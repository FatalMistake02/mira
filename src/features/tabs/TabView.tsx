/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import { useTabs } from './TabsProvider';
import { BROWSER_SETTINGS_CHANGED_EVENT, getBrowserSettings } from '../settings/browserSettings';
import { getThemeById } from '../themes/themeLoader';

interface WebviewNavigationEvent extends Event {
  url: string;
}

interface WebviewPageTitleUpdatedEvent extends Event {
  title: string;
}

interface WebviewPageFaviconUpdatedEvent extends Event {
  favicons: string[];
}

interface WebviewFoundInPageResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
}

interface WebviewFoundInPageEvent extends Event {
  result?: WebviewFoundInPageResult;
  requestId?: number;
  activeMatchOrdinal?: number;
  matches?: number;
  finalUpdate?: boolean;
}

interface WebviewElement extends HTMLElement {
  src: string;
  reload: () => void;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  findInPage: (
    text: string,
    options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean },
  ) => number;
  stopFindInPage?: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  getWebContentsId?: () => number;
  didNavigateHandler?: (e: WebviewNavigationEvent) => void;
  didNavigateInPageHandler?: (e: WebviewNavigationEvent) => void;
  domReadyHandler?: () => void;
  didPageTitleUpdatedHandler?: (e: WebviewPageTitleUpdatedEvent) => void;
  pageFaviconUpdatedHandler?: (e: WebviewPageFaviconUpdatedEvent) => void;
  foundInPageHandler?: (e: WebviewFoundInPageEvent) => void;
}

const RAW_FILE_DARK_STYLE_SCRIPT_ID = 'mira-raw-file-dark-mode-style';
const WEBVIEW_TRACKED_SRC_ATTR = 'data-mira-tracked-src';

function normalizeComparableUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function applyRawFileDarkModeStyle(
  webview: WebviewElement,
  shouldApply: boolean,
) {
  const script = `(() => {
  const shouldApply = ${shouldApply ? 'true' : 'false'};
  const styleId = ${JSON.stringify(RAW_FILE_DARK_STYLE_SCRIPT_ID)};
  const isRawHost = location.hostname === 'raw.githubusercontent.com';
  const contentType = (document.contentType || '').toLowerCase();
  const hasSinglePreBody =
    !!document.body
    && document.body.children.length === 1
    && document.body.firstElementChild?.tagName === 'PRE';
  const isRawTextDocument =
    contentType.startsWith('text/plain')
    || contentType.startsWith('application/json')
    || (contentType === '' && hasSinglePreBody)
    || (isRawHost && hasSinglePreBody);
  const existing = document.getElementById(styleId);

  if (shouldApply && isRawTextDocument) {
    if (!existing) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = [
        'html, body, pre {',
        '  background: #000 !important;',
        '  color: #fff !important;',
        '}',
        'a { color: #8ab4ff !important; }',
      ].join('\\n');
      document.head?.appendChild(style) || document.documentElement.appendChild(style);
    }
    document.documentElement.style.setProperty('color-scheme', 'dark');
    return;
  }

  existing?.remove();
  document.documentElement.style.removeProperty('color-scheme');
})();`;

  webview.executeJavaScript(script).catch(() => undefined);
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
  const {
    tabs,
    activeId,
    navigate,
    updateTabMetadata,
    registerWebview,
    updateFindInPageMatches,
  } = useTabs();
  const [tabSleepMode, setTabSleepMode] = useState(() => getBrowserSettings().tabSleepMode);
  const [rawFileDarkModeEnabled, setRawFileDarkModeEnabled] = useState(
    () => getBrowserSettings().rawFileDarkModeEnabled,
  );
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const settings = getBrowserSettings();
    return getThemeById(settings.themeId)?.mode ?? 'dark';
  });

  useEffect(() => {
    const syncSettings = () => {
      const settings = getBrowserSettings();
      setTabSleepMode(settings.tabSleepMode);
      setRawFileDarkModeEnabled(settings.rawFileDarkModeEnabled);
      setThemeMode(getThemeById(settings.themeId)?.mode ?? 'dark');
    };

    syncSettings();
    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  useEffect(() => {
    const shouldApplyRawFileDarkMode = rawFileDarkModeEnabled && themeMode === 'dark';
    const webviews = document.querySelectorAll('webview');
    webviews.forEach((node) => {
      applyRawFileDarkModeStyle(node as unknown as WebviewElement, shouldApplyRawFileDarkMode);
    });
  }, [rawFileDarkModeEnabled, themeMode]);

  const shouldApplyRawFileDarkMode = rawFileDarkModeEnabled && themeMode === 'dark';

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
                  if (wv.domReadyHandler) {
                    wv.removeEventListener('dom-ready', wv.domReadyHandler as EventListener);
                  }
                  if (wv.didPageTitleUpdatedHandler) {
                    wv.removeEventListener(
                      'page-title-updated',
                      wv.didPageTitleUpdatedHandler as EventListener,
                    );
                  }
                  if (wv.pageFaviconUpdatedHandler) {
                    wv.removeEventListener(
                      'page-favicon-updated',
                      wv.pageFaviconUpdatedHandler as EventListener,
                    );
                  }
                  if (wv.foundInPageHandler) {
                    wv.removeEventListener('found-in-page', wv.foundInPageHandler as EventListener);
                  }
                  const didNavigateHandler = (e: Event) => {
                    const ev = e as WebviewNavigationEvent;
                    wv.setAttribute(WEBVIEW_TRACKED_SRC_ATTR, normalizeComparableUrl(ev.url));
                    navigate(ev.url, tab.id);
                    applyRawFileDarkModeStyle(wv, shouldApplyRawFileDarkMode);
                  };
                  const didNavigateInPageHandler = (e: Event) => {
                    const ev = e as WebviewNavigationEvent;
                    wv.setAttribute(WEBVIEW_TRACKED_SRC_ATTR, normalizeComparableUrl(ev.url));
                    navigate(ev.url, tab.id);
                    applyRawFileDarkModeStyle(wv, shouldApplyRawFileDarkMode);
                  };
                  const domReadyHandler = () => {
                    applyRawFileDarkModeStyle(wv, shouldApplyRawFileDarkMode);
                  };
                  const didPageTitleUpdatedHandler = (e: Event) => {
                    const ev = e as WebviewPageTitleUpdatedEvent;
                    updateTabMetadata(tab.id, { title: ev.title });
                  };
                  const pageFaviconUpdatedHandler = (e: Event) => {
                    const ev = e as WebviewPageFaviconUpdatedEvent;
                    updateTabMetadata(tab.id, { favicon: ev.favicons?.[0] ?? null });
                  };
                  const foundInPageHandler = (e: Event) => {
                    const ev = e as WebviewFoundInPageEvent;
                    const result = ev.result ?? ev;
                    const requestId =
                      typeof result.requestId === 'number' ? result.requestId : Number.NaN;
                    if (!Number.isFinite(requestId)) return;

                    const activeMatchOrdinal =
                      typeof result.activeMatchOrdinal === 'number' ? result.activeMatchOrdinal : 0;
                    const matches = typeof result.matches === 'number' ? result.matches : 0;
                    updateFindInPageMatches(tab.id, requestId, activeMatchOrdinal, matches);
                  };

                  wv.didNavigateHandler = didNavigateHandler as (e: WebviewNavigationEvent) => void;
                  wv.didNavigateInPageHandler = didNavigateInPageHandler as (
                    e: WebviewNavigationEvent,
                  ) => void;
                  wv.domReadyHandler = domReadyHandler;
                  wv.didPageTitleUpdatedHandler = didPageTitleUpdatedHandler as (
                    e: WebviewPageTitleUpdatedEvent,
                  ) => void;
                  wv.pageFaviconUpdatedHandler = pageFaviconUpdatedHandler as (
                    e: WebviewPageFaviconUpdatedEvent,
                  ) => void;
                  wv.foundInPageHandler = foundInPageHandler as (e: WebviewFoundInPageEvent) => void;

                  wv.addEventListener('did-navigate', didNavigateHandler);
                  wv.addEventListener('did-navigate-in-page', didNavigateInPageHandler);
                  wv.addEventListener('dom-ready', domReadyHandler);
                  wv.addEventListener('page-title-updated', didPageTitleUpdatedHandler);
                  wv.addEventListener('page-favicon-updated', pageFaviconUpdatedHandler);
                  wv.addEventListener('found-in-page', foundInPageHandler);

                  const trackedSrc = wv.getAttribute(WEBVIEW_TRACKED_SRC_ATTR) ?? '';
                  const nextSrc = normalizeComparableUrl(tab.url);
                  if (trackedSrc !== nextSrc) {
                    wv.setAttribute(WEBVIEW_TRACKED_SRC_ATTR, nextSrc);
                    wv.src = tab.url;
                  }
                }}
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
