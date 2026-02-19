/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTabs } from './TabsProvider';
import { BROWSER_SETTINGS_CHANGED_EVENT, getBrowserSettings } from '../settings/browserSettings';
import { getThemeById } from '../themes/themeLoader';
import { electron } from '../../electronBridge';
import ContextMenu, { type ContextMenuEntry } from '../../components/ContextMenu';

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

interface WebviewContextMenuEditFlags {
  canUndo?: boolean;
  canRedo?: boolean;
  canCut?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
  canPasteAndMatchStyle?: boolean;
  canSelectAll?: boolean;
}

interface WebviewContextMenuParams {
  x?: number;
  y?: number;
  pageURL?: string;
  linkURL?: string;
  srcURL?: string;
  mediaType?: string;
  isEditable?: boolean;
  editFlags?: WebviewContextMenuEditFlags;
}

interface WebviewContextMenuEvent extends Event {
  params?: WebviewContextMenuParams;
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
  contextMenuHandler?: (e: WebviewContextMenuEvent) => void;
}

interface NormalizedContextMenuEditFlags {
  canUndo: boolean;
  canRedo: boolean;
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canPasteAndMatchStyle: boolean;
  canSelectAll: boolean;
}

interface NormalizedContextMenuParams {
  x: number;
  y: number;
  pageURL: string;
  linkURL: string;
  srcURL: string;
  mediaType: string;
  isEditable: boolean;
  editFlags: NormalizedContextMenuEditFlags;
}

interface PageContextMenuState {
  tabId: string;
  webContentsId: number;
  x: number;
  y: number;
  params: NormalizedContextMenuParams;
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

function resolveContextMenuUrl(rawUrl: string, baseUrl?: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const normalizedBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    return normalizedBase ? new URL(trimmed, normalizedBase).toString() : new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function canOpenInNewTab(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const protocol = new URL(trimmed).protocol.toLowerCase();
    return (
      protocol === 'http:' ||
      protocol === 'https:' ||
      protocol === 'file:' ||
      protocol === 'about:' ||
      protocol === 'mira:' ||
      protocol === 'view-source:'
    );
  } catch {
    return false;
  }
}

function normalizeContextMenuParams(params?: WebviewContextMenuParams): NormalizedContextMenuParams {
  const editFlags = params?.editFlags;
  return {
    x: Number.isFinite(params?.x) ? Math.floor(params?.x ?? 0) : 0,
    y: Number.isFinite(params?.y) ? Math.floor(params?.y ?? 0) : 0,
    pageURL: typeof params?.pageURL === 'string' ? params.pageURL.trim() : '',
    linkURL: typeof params?.linkURL === 'string' ? params.linkURL.trim() : '',
    srcURL: typeof params?.srcURL === 'string' ? params.srcURL.trim() : '',
    mediaType: typeof params?.mediaType === 'string' ? params.mediaType.trim().toLowerCase() : '',
    isEditable: params?.isEditable === true,
    editFlags: {
      canUndo: editFlags?.canUndo ?? true,
      canRedo: editFlags?.canRedo ?? true,
      canCut: editFlags?.canCut ?? true,
      canCopy: editFlags?.canCopy ?? true,
      canPaste: editFlags?.canPaste ?? true,
      canPasteAndMatchStyle: editFlags?.canPasteAndMatchStyle ?? true,
      canSelectAll: editFlags?.canSelectAll ?? true,
    },
  };
}

function applyRawFileDarkModeStyle(webview: WebviewElement, shouldApply: boolean) {
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
        'a { color: #b9d88d !important; }',
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
    newTab,
    goBack,
    goForward,
    reload,
    printPage,
  } = useTabs();
  const [tabSleepMode, setTabSleepMode] = useState(() => getBrowserSettings().tabSleepMode);
  const [rawFileDarkModeEnabled, setRawFileDarkModeEnabled] = useState(
    () => getBrowserSettings().rawFileDarkModeEnabled,
  );
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const settings = getBrowserSettings();
    return getThemeById(settings.themeId)?.mode ?? 'dark';
  });
  const [pageMenuState, setPageMenuState] = useState<PageContextMenuState | null>(null);

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

  const closePageMenu = useCallback(() => {
    setPageMenuState(null);
  }, []);

  useEffect(() => {
    if (!pageMenuState) return;

    const tabStillExists = tabs.some((tab) => tab.id === pageMenuState.tabId);
    if (tabStillExists && pageMenuState.tabId === activeId) return;
    setPageMenuState(null);
  }, [tabs, activeId, pageMenuState]);

  const runWebviewContextAction = useCallback(
    (
      action: string,
      payload?: {
        url?: string;
        text?: string;
        x?: number;
        y?: number;
      },
    ) => {
      if (!pageMenuState) return;
      const ipc = electron?.ipcRenderer;
      if (!ipc) return;

      void ipc
        .invoke('webview-context-action', {
          webContentsId: pageMenuState.webContentsId,
          action,
          url: payload?.url,
          text: payload?.text,
          x: payload?.x,
          y: payload?.y,
        })
        .catch(() => undefined);
    },
    [pageMenuState],
  );

  const openInNewTabFromMenu = useCallback(
    (url: string, baseUrl?: string) => {
      const normalized = resolveContextMenuUrl(url, baseUrl);
      if (!canOpenInNewTab(normalized)) return;
      closePageMenu();
      window.setTimeout(() => {
        newTab(normalized, { activate: true, activateDelayMs: 120 });
      }, 0);
    },
    [closePageMenu, newTab],
  );

  const pageMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!pageMenuState) return [];

    const currentTab = tabs.find((tab) => tab.id === pageMenuState.tabId) ?? null;
    const params = pageMenuState.params;
    const sourceUrl = params.pageURL || currentTab?.url || '';

    const canGoBack = !!currentTab && currentTab.historyIndex > 0;
    const canGoForward = !!currentTab && currentTab.historyIndex < currentTab.history.length - 1;

    const item = (
      label: string,
      onSelect: () => void,
      options?: { disabled?: boolean },
    ): ContextMenuEntry => ({
      type: 'item',
      label,
      onSelect,
      disabled: options?.disabled,
    });
    const separator = (): ContextMenuEntry => ({ type: 'separator' });
    const inspectEntry = item('Inspect', () =>
      runWebviewContextAction('inspect-element', { x: params.x, y: params.y }),
    );

    if (params.isEditable) {
      return [
        item('Undo', () => runWebviewContextAction('edit-undo'), {
          disabled: !params.editFlags.canUndo,
        }),
        item('Redo', () => runWebviewContextAction('edit-redo'), {
          disabled: !params.editFlags.canRedo,
        }),
        separator(),
        item('Cut', () => runWebviewContextAction('edit-cut'), {
          disabled: !params.editFlags.canCut,
        }),
        item('Copy', () => runWebviewContextAction('edit-copy'), {
          disabled: !params.editFlags.canCopy,
        }),
        item('Paste', () => runWebviewContextAction('edit-paste'), {
          disabled: !params.editFlags.canPaste,
        }),
        item('Paste as Plain Text', () => runWebviewContextAction('edit-paste-as-plain-text'), {
          disabled: !params.editFlags.canPasteAndMatchStyle,
        }),
        separator(),
        item('Select All', () => runWebviewContextAction('edit-select-all'), {
          disabled: !params.editFlags.canSelectAll,
        }),
        separator(),
        inspectEntry,
      ];
    }

    if (params.mediaType === 'image' || !!params.srcURL) {
      const resolvedSrcUrl = resolveContextMenuUrl(params.srcURL, params.pageURL);
      const canOpenImageInNewTab = canOpenInNewTab(resolvedSrcUrl);
      return [
        item('Open Image in New Tab', () => openInNewTabFromMenu(resolvedSrcUrl, params.pageURL), {
          disabled: !canOpenImageInNewTab,
        }),
        item('Save Image As', () => runWebviewContextAction('download-url', { url: resolvedSrcUrl }), {
          disabled: !resolvedSrcUrl,
        }),
        item('Copy Image', () => runWebviewContextAction('copy-image-at', { x: params.x, y: params.y })),
        item('Copy Image Address', () => runWebviewContextAction('copy-text', { text: resolvedSrcUrl }), {
          disabled: !resolvedSrcUrl,
        }),
        separator(),
        inspectEntry,
      ];
    }

    if (params.linkURL) {
      const resolvedLinkUrl = resolveContextMenuUrl(params.linkURL, params.pageURL);
      const canOpenLinkInNewTab = canOpenInNewTab(resolvedLinkUrl);
      return [
        item('Open in New Tab', () => openInNewTabFromMenu(resolvedLinkUrl, params.pageURL), {
          disabled: !canOpenLinkInNewTab,
        }),
        item('Open in New Window', () => {
          if (!canOpenLinkInNewTab) return;
          const ipc = electron?.ipcRenderer;
          if (ipc) {
            void ipc.invoke('window-new-with-url', resolvedLinkUrl).catch(() => undefined);
            return;
          }
          window.open(resolvedLinkUrl, '_blank', 'noopener,noreferrer');
        }, {
          disabled: !canOpenLinkInNewTab,
        }),
        separator(),
        item('Copy Link Address', () => runWebviewContextAction('copy-text', { text: resolvedLinkUrl }), {
          disabled: !resolvedLinkUrl,
        }),
        item('Save Link As', () => runWebviewContextAction('download-url', { url: resolvedLinkUrl }), {
          disabled: !resolvedLinkUrl,
        }),
        separator(),
        inspectEntry,
      ];
    }

    return [
      item('Back', () => goBack(), { disabled: !canGoBack }),
      item('Forward', () => goForward(), { disabled: !canGoForward }),
      item('Reload', () => reload()),
      separator(),
      item('Save As', () => runWebviewContextAction('save-page-as')),
      item('Print', () => printPage()),
      separator(),
      item('View Source', () => openInNewTabFromMenu(`view-source:${sourceUrl}`), {
        disabled: !sourceUrl,
      }),
      inspectEntry,
    ];
  }, [
    pageMenuState,
    tabs,
    openInNewTabFromMenu,
    goBack,
    goForward,
    reload,
    printPage,
    runWebviewContextAction,
  ]);

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
                  if (wv.contextMenuHandler) {
                    wv.removeEventListener('context-menu', wv.contextMenuHandler as EventListener);
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
                  const contextMenuHandler = (e: Event) => {
                    const ev = e as WebviewContextMenuEvent;
                    const params = normalizeContextMenuParams(ev.params);
                    if (params.isEditable) {
                      e.preventDefault();
                      setPageMenuState(null);
                      return;
                    }

                    e.preventDefault();

                    const webContentsId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : -1;
                    if (!Number.isFinite(webContentsId) || webContentsId <= 0) return;

                    let x = params.x;
                    let y = params.y;

                    // Some environments report coordinates relative to the webview bounds.
                    // If direct values look invalid, fall back to translating by webview offset.
                    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
                      const webviewRect = wv.getBoundingClientRect();
                      x = webviewRect.left + params.x;
                      y = webviewRect.top + params.y;
                    }
                    setPageMenuState({
                      tabId: tab.id,
                      webContentsId: Math.floor(webContentsId),
                      x,
                      y,
                      params,
                    });
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
                  wv.foundInPageHandler = foundInPageHandler as (
                    e: WebviewFoundInPageEvent,
                  ) => void;
                  wv.contextMenuHandler = contextMenuHandler as (e: WebviewContextMenuEvent) => void;

                  wv.addEventListener('did-navigate', didNavigateHandler);
                  wv.addEventListener('did-navigate-in-page', didNavigateInPageHandler);
                  wv.addEventListener('dom-ready', domReadyHandler);
                  wv.addEventListener('page-title-updated', didPageTitleUpdatedHandler);
                  wv.addEventListener('page-favicon-updated', pageFaviconUpdatedHandler);
                  wv.addEventListener('found-in-page', foundInPageHandler);
                  wv.addEventListener('context-menu', contextMenuHandler);

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
      <ContextMenu
        open={!!pageMenuState}
        anchor={pageMenuState ? { x: pageMenuState.x, y: pageMenuState.y } : null}
        entries={pageMenuEntries}
        onClose={closePageMenu}
        minWidth={208}
      />
    </div>
  );
}
