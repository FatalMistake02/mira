/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import { useTabs } from './TabsProvider';
import { BROWSER_SETTINGS_CHANGED_EVENT, getBrowserSettings } from '../settings/browserSettings';

interface WebviewNavigationEvent extends Event {
  url: string;
}

interface WebviewElement extends HTMLElement {
  src: string;
  reload: () => void;
  findInPage: (text: string) => void;
  didNavigateHandler?: (e: WebviewNavigationEvent) => void;
  didNavigateInPageHandler?: (e: WebviewNavigationEvent) => void;
}

// Load all internal pages (unchanged)
const modules = import.meta.glob('../../browser_pages/**/*.tsx', { eager: true }) as Record<
  string,
  { default: React.ComponentType }
>;

const pages = Object.entries(modules).reduce<Record<string, React.ComponentType>>(
  (acc, [path, mod]) => {
    const m = path.match(/\/browser_pages\/(.+)\.tsx$/);
    if (!m) return acc;
    const route = m[1].replace(/\\/g, '/').toLowerCase();
    acc[route] = mod.default;
    const idxRoute = route.replace(/\/index$/, '');
    if (idxRoute !== route && !(idxRoute in acc)) acc[idxRoute] = mod.default;
    return acc;
  },
  {},
);

function isInternal(url: string) {
  return url.startsWith('mira://');
}

function renderInternal(url: string, reloadToken: number) {
  const routeRaw = url.replace(/^mira:\/\//, '').replace(/^\/+|\/+$/g, '');
  const route = routeRaw.toLowerCase();
  const Page = pages[route];
  if (Page) return <Page key={`${route}-${reloadToken}`} />;
  return <div style={{ padding: 20 }}>Unknown internal page: {routeRaw}</div>;
}

export default function TabView() {
  const { tabs, activeId, navigate, registerWebview } = useTabs();
  const [tabSleepMode, setTabSleepMode] = useState(() => getBrowserSettings().tabSleepMode);

  useEffect(() => {
    const syncTabSleepMode = () => {
      setTabSleepMode(getBrowserSettings().tabSleepMode);
    };

    syncTabSleepMode();
    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncTabSleepMode);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncTabSleepMode);
  }, []);

  return (
    <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
      {tabs.map((tab) => {
        const isVisible = tab.id === activeId;
        if (tabSleepMode === 'discard' && tab.isSleeping && !isVisible) {
          return null;
        }

        return (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              visibility: isVisible ? 'visible' : 'hidden',
              pointerEvents: isVisible ? 'auto' : 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {isInternal(tab.url) ? (
              <div style={{ flex: 1, overflow: 'auto' }}>
                {renderInternal(tab.url, tab.reloadToken)}
              </div>
            ) : (
              <webview
                ref={(el) => {
                  if (!el) {
                    // When the element unmounts we deregister it
                    registerWebview(tab.id, null);
                    return;
                  }
                  const wv = el as unknown as WebviewElement;
                  registerWebview(tab.id, wv);

                  // Clean any old listeners that might still be attached
                  if (wv.didNavigateHandler) {
                    wv.removeEventListener('did-navigate', wv.didNavigateHandler as EventListener);
                  }
                  if (wv.didNavigateInPageHandler) {
                    wv.removeEventListener(
                      'did-navigate-in-page',
                      wv.didNavigateInPageHandler as EventListener,
                    );
                  }
                  const didNavigateHandler = (e: Event) => {
                    const ev = e as WebviewNavigationEvent;
                    navigate(ev.url);
                  };
                  const didNavigateInPageHandler = (e: Event) => {
                    const ev = e as WebviewNavigationEvent;
                    navigate(ev.url);
                  };

                  wv.didNavigateHandler = didNavigateHandler as (e: WebviewNavigationEvent) => void;
                  wv.didNavigateInPageHandler = didNavigateInPageHandler as (
                    e: WebviewNavigationEvent,
                  ) => void;

                  wv.addEventListener('did-navigate', didNavigateHandler);
                  wv.addEventListener('did-navigate-in-page', didNavigateInPageHandler);
                }}
                src={tab.url}
                allowpopups={true}
                style={{ flex: 1, width: '100%', height: '100%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
