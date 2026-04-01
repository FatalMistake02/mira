/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTabs } from './TabsProvider';
import { BROWSER_SETTINGS_CHANGED_EVENT, getBrowserSettings } from '../settings/browserSettings';
import { getThemeById } from '../themes/themeLoader';
import { electron } from '../../electronBridge';
import ContextMenu, { type ContextMenuEntry } from '../../components/ContextMenu';

interface WebviewNavigationEvent extends Event {
  url: string;
}

interface WebviewDidFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
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

interface WebviewNewWindowEvent extends Event {
  url?: string;
  frameName?: string;
  disposition?: string;
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
  didStartLoadingHandler?: () => void;
  didFailLoadHandler?: (e: WebviewDidFailLoadEvent) => void;
  domReadyHandler?: () => void;
  didPageTitleUpdatedHandler?: (e: WebviewPageTitleUpdatedEvent) => void;
  pageFaviconUpdatedHandler?: (e: WebviewPageFaviconUpdatedEvent) => void;
  foundInPageHandler?: (e: WebviewFoundInPageEvent) => void;
  contextMenuHandler?: (e: WebviewContextMenuEvent) => void;
  newWindowHandler?: (e: WebviewNewWindowEvent) => void;
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

interface NativeContextCommandPayload {
  command?: unknown;
  webContentsId?: unknown;
  tabId?: unknown;
  url?: unknown;
  text?: unknown;
  x?: unknown;
  y?: unknown;
  baseUrl?: unknown;
}

interface MainFrameHttpErrorPayload {
  webContentsId?: unknown;
  url?: unknown;
  statusCode?: unknown;
}

interface ExternalErrorState {
  route: 'errors/external-404' | 'errors/external-network' | 'errors/external-offline' | 'errors/unsecure-site';
  failedUrlComparable: string;
  httpFallbackUrl?: string;
}

const RAW_FILE_DARK_STYLE_SCRIPT_ID = 'mira-raw-file-dark-mode-style';
const WEBVIEW_TRACKED_SRC_ATTR = 'data-mira-tracked-src';
const WEBVIEW_TAB_ID_ATTR = 'data-mira-tab-id';
const ERR_INTERNET_DISCONNECTED = -106;
const ERR_CONNECTION_REFUSED = -102;
const ERR_CONNECTION_FAILED = -104;
const ERR_NAME_NOT_RESOLVED = -105;

/**
 * Produces a stable comparable URL string used to suppress redundant webview reloads.
 */
function normalizeComparableUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function getTabIdForWebContentsId(webContentsId: number): string | undefined {
  if (!Number.isFinite(webContentsId) || webContentsId <= 0) return undefined;
  const webviewNodes = Array.from(document.querySelectorAll('webview')) as WebviewElement[];
  const matchingWebview = webviewNodes.find((node) => {
    if (typeof node.getWebContentsId !== 'function') return false;
    return node.getWebContentsId() === webContentsId;
  });
  if (!matchingWebview) return undefined;
  const tabId = matchingWebview.getAttribute(WEBVIEW_TAB_ID_ATTR)?.trim();
  return tabId || undefined;
}

/**
 * Resolves context-menu URLs, supporting relative links against the page URL.
 */
function resolveContextMenuUrl(rawUrl: string, baseUrl?: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const normalizedBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    return normalizedBase
      ? new URL(trimmed, normalizedBase).toString()
      : new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

/**
 * Guards "open in new tab" actions to known-safe schemes handled by the app.
 */
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

function normalizeContextMenuParams(
  params?: WebviewContextMenuParams,
): NormalizedContextMenuParams {
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

/**
 * Applies/removes a dark style override for raw text files in GitHub raw views.
 */
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

function detachWebviewListeners(webview: WebviewElement) {
  if (webview.didNavigateHandler) {
    webview.removeEventListener('did-navigate', webview.didNavigateHandler as EventListener);
    delete webview.didNavigateHandler;
  }
  if (webview.didNavigateInPageHandler) {
    webview.removeEventListener(
      'did-navigate-in-page',
      webview.didNavigateInPageHandler as EventListener,
    );
    delete webview.didNavigateInPageHandler;
  }
  if (webview.didStartLoadingHandler) {
    webview.removeEventListener(
      'did-start-loading',
      webview.didStartLoadingHandler as EventListener,
    );
    delete webview.didStartLoadingHandler;
  }
  if (webview.didFailLoadHandler) {
    webview.removeEventListener('did-fail-load', webview.didFailLoadHandler as EventListener);
    delete webview.didFailLoadHandler;
  }
  if (webview.domReadyHandler) {
    webview.removeEventListener('dom-ready', webview.domReadyHandler as EventListener);
    delete webview.domReadyHandler;
  }
  if (webview.didPageTitleUpdatedHandler) {
    webview.removeEventListener(
      'page-title-updated',
      webview.didPageTitleUpdatedHandler as EventListener,
    );
    delete webview.didPageTitleUpdatedHandler;
  }
  if (webview.pageFaviconUpdatedHandler) {
    webview.removeEventListener(
      'page-favicon-updated',
      webview.pageFaviconUpdatedHandler as EventListener,
    );
    delete webview.pageFaviconUpdatedHandler;
  }
  if (webview.foundInPageHandler) {
    webview.removeEventListener('found-in-page', webview.foundInPageHandler as EventListener);
    delete webview.foundInPageHandler;
  }
  if (webview.contextMenuHandler) {
    webview.removeEventListener('context-menu', webview.contextMenuHandler as EventListener);
    delete webview.contextMenuHandler;
  }
  if (webview.newWindowHandler) {
    webview.removeEventListener('new-window', webview.newWindowHandler as EventListener);
    delete webview.newWindowHandler;
  }
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
  const routeRawWithParams = url.replace(/^mira:\/\//, '');
  const routeRaw = routeRawWithParams.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
  const route = routeRaw.toLowerCase();
  const Page = pages[route];
  if (Page) return <Page key={`${route}-${reloadToken}`} />;

  const NotFoundPage = pages['errors/internal-404'] ?? pages['errors/404'] ?? pages['404'];
  if (NotFoundPage) {
    return <NotFoundPage key={`errors/404-${reloadToken}`} />;
  }

  return <div style={{ padding: 20 }}>Unknown internal page: {routeRaw || '(root)'}</div>;
}

/**
 * Renders either an internal page or a live Electron webview for the active tab.
 */
export default function TabView() {
  const {
    tabs,
    activeId,
    navigate,
    updateTabMetadata,
    registerWebview,
    updateFindInPageMatches,
    newTabToRight,
    goBack,
    goForward,
    reload,
    printPage,
  } = useTabs();
  const [tabSleepMode, setTabSleepMode] = useState(() => getBrowserSettings().tabSleepMode);
  const [rawFileDarkModeEnabled, setRawFileDarkModeEnabled] = useState(
    () => getBrowserSettings().rawFileDarkModeEnabled,
  );
  const [nativeTextFieldContextMenu, setNativeTextFieldContextMenu] = useState(
    () => getBrowserSettings().nativeTextFieldContextMenu,
  );
  const [renderOrderTabIds, setRenderOrderTabIds] = useState<string[]>(() =>
    tabs.map((tab) => tab.id),
  );
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const settings = getBrowserSettings();
    return getThemeById(settings.themeId)?.mode ?? 'dark';
  });
  const [pageMenuState, setPageMenuState] = useState<PageContextMenuState | null>(null);
  const [externalErrorByTabId, setExternalErrorByTabId] = useState<
    Record<string, ExternalErrorState>
  >({});
  const lastNativeContextCommandRef = React.useRef<{ signature: string; at: number } | null>(null);
  const isMacOS = electron?.isMacOS ?? false;
  const primaryShortcutLabel = isMacOS ? 'Cmd' : 'Ctrl';
  const redoShortcutLabel = isMacOS ? 'Cmd+Shift+Z' : 'Ctrl+Y';
  const inspectShortcutLabel = isMacOS ? 'Cmd+Opt+I' : 'F12';
  const tabsById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const renderTabs = useMemo(
    () =>
      renderOrderTabIds
        .map((id) => tabsById.get(id))
        .filter((tab): tab is (typeof tabs)[number] => !!tab),
    [renderOrderTabIds, tabsById],
  );
  const webviewMap = useRef<Record<string, WebviewElement>>({});
  const webviewRefCallbacks = useRef<Record<string, (el: Element | null) => void>>({});

  useEffect(() => {
    const syncSettings = () => {
      const settings = getBrowserSettings();
      setTabSleepMode(settings.tabSleepMode);
      setRawFileDarkModeEnabled(settings.rawFileDarkModeEnabled);
      setNativeTextFieldContextMenu(settings.nativeTextFieldContextMenu);
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

  // Handle login completion messages from login tabs
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message:', event.data);
      
      if (event.data?.type === 'login-completed' && event.data?.originalTabId) {
        const originalTabId = event.data.originalTabId;
        const returnUrl = event.data.returnUrl;
        
        console.log('Login completion message received:', { originalTabId, returnUrl });
        
        // Check if the original tab still exists
        const originalTab = tabs.find(tab => tab.id === originalTabId);
        if (originalTab) {
          console.log('Switching back to original tab:', originalTabId);
          // Switch back to the original tab
          navigate(returnUrl || originalTab.url, originalTabId);
        } else {
          console.log('Original tab not found:', originalTabId);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [tabs, navigate]);

  // Global handler for external link clicks to catch login flows
  useEffect(() => {
    const handleExternalLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a[href]');
      
      if (link && link.getAttribute('href')) {
        const href = link.getAttribute('href')!;
        const isExternal = href.startsWith('http') && !href.includes(window.location.origin);
        const isLikelyLogin = /login|signin|oauth|auth|sso|account|consent/i.test(href) || 
                             /google\.com|github\.com|facebook\.com|microsoft\.com|apple\.com/i.test(href);
        
        console.log('External link clicked:', { href, isExternal, isLikelyLogin });
        
        if (isExternal && isLikelyLogin) {
          event.preventDefault();
          event.stopPropagation();
          
          // Open as new tab with login tracking
          const newTabId = newTabToRight(activeId, href);
          console.log('Opened login tab:', { newTabId, href });
          
          // Set up monitoring for login completion
          if (!newTabId) return;
          
          setTimeout(() => {
            const webview = webviewMap.current[newTabId] || null;
            if (webview && typeof webview.executeJavaScript === 'function') {
              // Wait for webview to be ready before injecting script
              webview.addEventListener('dom-ready', () => {
                // Monitor navigation events to detect login completion
                const loginMonitorScript = `
                  (function() {
                    let originalTabId = '${activeId}';
                    let hasReturned = false;
                    
                    // Check if current URL suggests login completion
                    function checkForLoginCompletion() {
                      const currentUrl = window.location.href;
                      console.log('Checking for login completion at:', currentUrl);
                      
                      // More comprehensive patterns for login completion
                      const hasTokenOrCode = /#access_token=|#code=|/callback|/auth/callback|state=/.test(currentUrl);
                      const isNotLoginFlow = !/login|signin|oauth|auth|sso|consent|account/i.test(currentUrl);
                      const isBackToOriginal = currentUrl.includes(window.location.origin);
                      
                      // Google OAuth often redirects back to the app with tokens
                      const isOAuthComplete = hasTokenOrCode && (isNotLoginFlow || isBackToOriginal);
                      
                      console.log('Login completion check:', {
                        hasTokenOrCode,
                        isNotLoginFlow,
                        isBackToOriginal,
                        isOAuthComplete,
                        hasReturned
                      });
                      
                      if (isOAuthComplete && !hasReturned) {
                        hasReturned = true;
                        console.log('Login completed, returning to original tab:', originalTabId);
                        // Send message to parent to return to original tab
                        window.parent.postMessage({
                          type: 'login-completed',
                          originalTabId: originalTabId,
                          returnUrl: currentUrl
                        }, '*');
                      }
                    }
                    
                    // Monitor URL changes
                    let lastUrl = window.location.href;
                    setInterval(() => {
                      if (window.location.href !== lastUrl) {
                        lastUrl = window.location.href;
                        checkForLoginCompletion();
                      }
                    }, 1000);
                    
                    // Initial check
                    checkForLoginCompletion();
                  })();
                `;
                
                webview.executeJavaScript(loginMonitorScript).catch(() => undefined);
              });
            }
          }, 2000); // Wait 2 seconds for tab to fully load
        }
      }
    };

    document.addEventListener('click', handleExternalLinkClick, true);
    return () => document.removeEventListener('click', handleExternalLinkClick, true);
  }, [activeId, navigate, newTabToRight]);

  const shouldApplyRawFileDarkMode = rawFileDarkModeEnabled && themeMode === 'dark';

  const clearExternalErrorForTab = useCallback((tabId: string) => {
    setExternalErrorByTabId((current) => {
      if (!(tabId in current)) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }, []);

  useEffect(() => {
    const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
    setExternalErrorByTabId((current) => {
      let changed = false;
      const next: Record<string, ExternalErrorState> = {};
      for (const [tabId, errorState] of Object.entries(current)) {
        const tab = tabById.get(tabId);
        if (!tab) {
          changed = true;
          continue;
        }
        const tabUrlComparable = normalizeComparableUrl(tab.url);
        if (errorState.failedUrlComparable && errorState.failedUrlComparable !== tabUrlComparable) {
          changed = true;
          continue;
        }
        next[tabId] = errorState;
      }
      return changed ? next : current;
    });
  }, [tabs]);

  useEffect(() => {
    const nextIds = tabs.map((tab) => tab.id);
    setRenderOrderTabIds((current) => {
      const nextIdSet = new Set(nextIds);
      const kept = current.filter((id) => nextIdSet.has(id));
      const keptSet = new Set(kept);
      const additions = nextIds.filter((id) => !keptSet.has(id));
      const merged = kept.concat(additions);
      if (merged.length !== current.length) return merged;
      for (let index = 0; index < merged.length; index += 1) {
        if (merged[index] !== current[index]) return merged;
      }
      return current;
    });
  }, [tabs]);

  useEffect(() => {
    const nextIdSet = new Set(tabs.map((tab) => tab.id));
    for (const tabId of Object.keys(webviewRefCallbacks.current)) {
      if (!nextIdSet.has(tabId)) {
        delete webviewRefCallbacks.current[tabId];
      }
    }
  }, [tabs]);

  const syncWebviewSource = React.useEffectEvent((tabId: string, webview: WebviewElement) => {
    const tab = tabsById.get(tabId);
    if (!tab || isInternal(tab.url)) return;

    const trackedSrc = webview.getAttribute(WEBVIEW_TRACKED_SRC_ATTR) ?? '';
    const nextSrc = normalizeComparableUrl(tab.url);
    if (trackedSrc !== nextSrc) {
      webview.setAttribute(WEBVIEW_TRACKED_SRC_ATTR, nextSrc);
      webview.src = tab.url;
    }
  });

  const handleDidNavigate = React.useEffectEvent(
    (tabId: string, webview: WebviewElement, event: Event) => {
      const webviewEvent = event as WebviewNavigationEvent;
      webview.setAttribute(WEBVIEW_TRACKED_SRC_ATTR, normalizeComparableUrl(webviewEvent.url));
      clearExternalErrorForTab(tabId);
      navigate(webviewEvent.url, tabId);
      applyRawFileDarkModeStyle(webview, shouldApplyRawFileDarkMode);
    },
  );

  const handleDidStartLoading = React.useEffectEvent((tabId: string) => {
    clearExternalErrorForTab(tabId);
  });

  const handleDidFailLoad = React.useEffectEvent((tabId: string, event: Event) => {
    const webviewEvent = event as WebviewDidFailLoadEvent;
    if (!webviewEvent.isMainFrame) return;
    // Ignore cancellations from abort/redirect churn.
    if (webviewEvent.errorCode === 0 || webviewEvent.errorCode === -3) return;

    const currentTab = tabsById.get(tabId);
    const failedUrl = webviewEvent.validatedURL || currentTab?.url || '';

    // Check if this is an HTTPS connection failure that we should fallback from
    if (
      failedUrl.startsWith('https://') &&
      (webviewEvent.errorCode === ERR_CONNECTION_REFUSED ||
        webviewEvent.errorCode === ERR_CONNECTION_FAILED ||
        webviewEvent.errorCode === ERR_NAME_NOT_RESOLVED)
    ) {
      // Try HTTP fallback - navigate to unsecure warning page with HTTP URL
      const httpUrl = failedUrl.replace(/^https:\/\//, 'http://');
      navigate(`mira://errors/unsecure-site?url=${encodeURIComponent(httpUrl)}`, tabId);
      return;
    }

    const route =
      webviewEvent.errorCode === ERR_INTERNET_DISCONNECTED
        ? 'errors/external-offline'
        : 'errors/external-network';
    setExternalErrorByTabId((current) => ({
      ...current,
      [tabId]: {
        route,
        failedUrlComparable: normalizeComparableUrl(failedUrl),
      },
    }));
  });

  const handleDomReady = React.useEffectEvent((webview: WebviewElement) => {
    applyRawFileDarkModeStyle(webview, shouldApplyRawFileDarkMode);
    // Inject script to handle data-link attributes
    const dataLinkScript = `(() => {
  const falsyAttr = (value) => value === 'false' || value === '0' || value === 'no';
  const resolveUrl = (raw) => {
    try {
      return new URL(raw, window.location.href).toString();
    } catch {
      return raw;
    }
  };

  document.addEventListener('click', (e) => {
    const ev = e;
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
    const candidate = (path[0] instanceof Element ? path[0] : ev.target) instanceof Element
      ? (path[0] instanceof Element ? path[0] : ev.target)
      : null;
    if (!candidate) return;

    const element = candidate.closest('[data-link]');
    if (!element) return;

    const rawLink = element.getAttribute('data-link') ?? '';
    const link = rawLink.trim();
    if (!link) return;

    const hasNewTabAttr = element.hasAttribute('data-link-new-tab');
    const newTabAttrValue = (element.getAttribute('data-link-new-tab') ?? '').trim().toLowerCase();
    // Presence of data-link-new-tab should open in new tab, unless explicitly disabled.
    const wantsNewTab = hasNewTabAttr && !falsyAttr(newTabAttrValue);

    const isModifiedClick =
      (ev instanceof MouseEvent)
      && (ev.button === 1 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey);

    ev.preventDefault();
    ev.stopPropagation();

    const resolved = resolveUrl(link);
    if (wantsNewTab || isModifiedClick) {
      // Use window.open to trigger webview new-window event (opens in new tab)
      window.open(resolved, '_blank', 'noopener,noreferrer');
    } else {
      window.location.assign(resolved);
    }
  }, true);
})();`;
    webview.executeJavaScript(dataLinkScript).catch(() => undefined);

    const miraVersion = electron?.appVersion ?? null;
    if (miraVersion) {
      const miraVersionScript = `(() => {
  try {
    const version = ${JSON.stringify(miraVersion)};
    if (!version) return;
    const value = Object.freeze({ version });
    Object.defineProperty(window, 'mira', {
      value,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  } catch {
    // Ignore script injection errors.
  }
})();`;
      webview.executeJavaScript(miraVersionScript).catch(() => undefined);
    }
  });

  const handlePageTitleUpdated = React.useEffectEvent((tabId: string, event: Event) => {
    const webviewEvent = event as WebviewPageTitleUpdatedEvent;
    updateTabMetadata(tabId, { title: webviewEvent.title });
  });

  const handlePageFaviconUpdated = React.useEffectEvent((tabId: string, event: Event) => {
    const webviewEvent = event as WebviewPageFaviconUpdatedEvent;
    updateTabMetadata(tabId, { favicon: webviewEvent.favicons?.[0] ?? null });
  });

  const handleFoundInPage = React.useEffectEvent((tabId: string, event: Event) => {
    const webviewEvent = event as WebviewFoundInPageEvent;
    const result = webviewEvent.result ?? webviewEvent;
    const requestId = typeof result.requestId === 'number' ? result.requestId : Number.NaN;
    if (!Number.isFinite(requestId)) return;

    const activeMatchOrdinal =
      typeof result.activeMatchOrdinal === 'number' ? result.activeMatchOrdinal : 0;
    const matches = typeof result.matches === 'number' ? result.matches : 0;
    updateFindInPageMatches(tabId, requestId, activeMatchOrdinal, matches);
  });

  const handleContextMenu = React.useEffectEvent(
    (tabId: string, webview: WebviewElement, event: Event) => {
      const webviewEvent = event as WebviewContextMenuEvent;
      const params = normalizeContextMenuParams(webviewEvent.params);

      if (nativeTextFieldContextMenu) {
        const ipc = electron?.ipcRenderer;
        const webContentsId =
          typeof webview.getWebContentsId === 'function' ? webview.getWebContentsId() : -1;
        if (ipc && Number.isFinite(webContentsId) && webContentsId > 0) {
          event.preventDefault();
          setPageMenuState(null);

          let x = params.x;
          let y = params.y;
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
            const webviewRect = webview.getBoundingClientRect();
            x = webviewRect.left + params.x;
            y = webviewRect.top + params.y;
          }

          const currentTab = tabsById.get(tabId);
          const canGoBack = (currentTab?.historyIndex ?? 0) > 0;
          const canGoForward =
            !!currentTab && currentTab.historyIndex < currentTab.history.length - 1;
          const sourceUrl = params.pageURL || currentTab?.url || '';

          void ipc
            .invoke('webview-show-native-context-menu', {
              webContentsId: Math.floor(webContentsId),
              tabId,
              x,
              y,
              params,
              context: {
                canGoBack,
                canGoForward,
                sourceUrl,
              },
            })
            .catch(() => undefined);
          return;
        }
      }

      event.preventDefault();

      const webContentsId =
        typeof webview.getWebContentsId === 'function' ? webview.getWebContentsId() : -1;
      if (!Number.isFinite(webContentsId) || webContentsId <= 0) return;

      let x = params.x;
      let y = params.y;

      // Some environments report coordinates relative to the webview bounds.
      // If direct values look invalid, fall back to translating by webview offset.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        const webviewRect = webview.getBoundingClientRect();
        x = webviewRect.left + params.x;
        y = webviewRect.top + params.y;
      }
      setPageMenuState({
        tabId,
        webContentsId: Math.floor(webContentsId),
        x,
        y,
        params,
      });
    },
  );

  const handleNewWindow = React.useEffectEvent((tabId: string, event: Event) => {
    const webviewEvent = event as WebviewNewWindowEvent;
    const url = typeof webviewEvent.url === 'string' ? webviewEvent.url.trim() : '';
    const disposition =
      typeof webviewEvent.disposition === 'string' ? webviewEvent.disposition.toLowerCase() : '';

    console.log('newWindowHandler called:', { url, disposition });

    if (!url) {
      event.preventDefault();
      return;
    }

    // Prevent the default behavior of opening in a new window
    event.preventDefault();

    // Open in a new tab based on disposition
    if (disposition === 'new-window') {
      // Open in new window
      const ipc = electron?.ipcRenderer;
      if (ipc) {
        void ipc.invoke('window-new-with-url', url).catch(() => undefined);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    // Open in new tab (default for target="_blank")
    // Track if this might be a login tab by checking common login patterns
    const isLikelyLoginTab =
      /login|signin|oauth|auth|sso|account|consent/i.test(url) ||
      /google\.com|github\.com|facebook\.com|microsoft\.com|apple\.com/i.test(url) ||
      /accounts\.google\.com/i.test(url);

    // Debug logging to help identify issues
    if (isLikelyLoginTab) {
      console.log('Login tab detected:', url);
    } else {
      console.log('URL not detected as login tab:', url);
    }

    const newTabId = newTabToRight(tabId, url);

    // If this appears to be a login tab, set up navigation monitoring to return to original tab
    if (isLikelyLoginTab && newTabId) {
      // Store the original tab ID for potential return after login
      setTimeout(() => {
        const webview = webviewMap.current[newTabId];
        if (webview && typeof webview.executeJavaScript === 'function') {
          // Monitor navigation events to detect login completion
          const loginMonitorScript = `
                                (function() {
                                  let originalTabId = '${tabId}';
                                  let hasReturned = false;
                                  
                                  // Check if current URL suggests login completion
                                  function checkForLoginCompletion() {
                                    const currentUrl = window.location.href;
                                    console.log('Checking for login completion at:', currentUrl);
                                    
                                    // More comprehensive patterns for login completion
                                    const hasTokenOrCode = /#access_token=|#code=|/callback|/auth/callback|state=/.test(currentUrl);
                                    const isNotLoginFlow = !/login|signin|oauth|auth|sso|consent|account/i.test(currentUrl);
                                    const isBackToOriginal = currentUrl.includes(window.location.origin);
                                    
                                    // Google OAuth often redirects back to the app with tokens
                                    const isOAuthComplete = hasTokenOrCode && (isNotLoginFlow || isBackToOriginal);
                                    
                                    console.log('Login completion check:', {
                                      hasTokenOrCode,
                                      isNotLoginFlow,
                                      isBackToOriginal,
                                      isOAuthComplete,
                                      hasReturned
                                    });
                                    
                                    if (isOAuthComplete && !hasReturned) {
                                      hasReturned = true;
                                      console.log('Login completed, returning to original tab:', originalTabId);
                                      // Send message to parent to return to original tab
                                      window.parent.postMessage({
                                        type: 'login-completed',
                                        originalTabId: originalTabId,
                                        returnUrl: currentUrl
                                      }, '*');
                                    }
                                  }
                                  
                                  // Monitor URL changes
                                  let lastUrl = window.location.href;
                                  setInterval(() => {
                                    if (window.location.href !== lastUrl) {
                                      lastUrl = window.location.href;
                                      checkForLoginCompletion();
                                    }
                                  }, 1000);
                                  
                                  // Initial check
                                  checkForLoginCompletion();
                                })();
                              `;

          webview.executeJavaScript(loginMonitorScript).catch(() => undefined);
        }
      }, 2000); // Wait 2 seconds for tab to fully load
    }
  });

  const attachWebview = React.useEffectEvent((tabId: string, webview: WebviewElement) => {
    detachWebviewListeners(webview);

    const didNavigateHandler = (event: Event) => {
      handleDidNavigate(tabId, webview, event);
    };
    const didNavigateInPageHandler = (event: Event) => {
      handleDidNavigate(tabId, webview, event);
    };
    const didStartLoadingHandler = () => {
      handleDidStartLoading(tabId);
    };
    const didFailLoadHandler = (event: Event) => {
      handleDidFailLoad(tabId, event);
    };
    const domReadyHandler = () => {
      handleDomReady(webview);
    };
    const didPageTitleUpdatedHandler = (event: Event) => {
      handlePageTitleUpdated(tabId, event);
    };
    const pageFaviconUpdatedHandler = (event: Event) => {
      handlePageFaviconUpdated(tabId, event);
    };
    const foundInPageHandler = (event: Event) => {
      handleFoundInPage(tabId, event);
    };
    const contextMenuHandler = (event: Event) => {
      handleContextMenu(tabId, webview, event);
    };
    const newWindowHandler = (event: Event) => {
      handleNewWindow(tabId, event);
    };

    webview.didNavigateHandler = didNavigateHandler as (e: WebviewNavigationEvent) => void;
    webview.didNavigateInPageHandler = didNavigateInPageHandler as (
      e: WebviewNavigationEvent,
    ) => void;
    webview.didStartLoadingHandler = didStartLoadingHandler;
    webview.didFailLoadHandler = didFailLoadHandler as (e: WebviewDidFailLoadEvent) => void;
    webview.domReadyHandler = domReadyHandler;
    webview.didPageTitleUpdatedHandler = didPageTitleUpdatedHandler as (
      e: WebviewPageTitleUpdatedEvent,
    ) => void;
    webview.pageFaviconUpdatedHandler = pageFaviconUpdatedHandler as (
      e: WebviewPageFaviconUpdatedEvent,
    ) => void;
    webview.foundInPageHandler = foundInPageHandler as (e: WebviewFoundInPageEvent) => void;
    webview.contextMenuHandler = contextMenuHandler as (e: WebviewContextMenuEvent) => void;
    webview.newWindowHandler = newWindowHandler as (e: WebviewNewWindowEvent) => void;

    webview.addEventListener('did-navigate', didNavigateHandler);
    webview.addEventListener('did-navigate-in-page', didNavigateInPageHandler);
    webview.addEventListener('did-start-loading', didStartLoadingHandler);
    webview.addEventListener('did-fail-load', didFailLoadHandler);
    webview.addEventListener('dom-ready', domReadyHandler);
    webview.addEventListener('page-title-updated', didPageTitleUpdatedHandler);
    webview.addEventListener('page-favicon-updated', pageFaviconUpdatedHandler);
    webview.addEventListener('found-in-page', foundInPageHandler);
    webview.addEventListener('context-menu', contextMenuHandler);
    webview.addEventListener('new-window', newWindowHandler);
  });

  const handleWebviewRefChange = React.useEffectEvent((tabId: string, node: Element | null) => {
    const existing = webviewMap.current[tabId] ?? null;
    if (!node) {
      if (!existing) return;
      detachWebviewListeners(existing);
      existing.removeAttribute(WEBVIEW_TAB_ID_ATTR);
      delete webviewMap.current[tabId];
      registerWebview(tabId, null);
      return;
    }

    const webview = node as unknown as WebviewElement;
    webview.setAttribute(WEBVIEW_TAB_ID_ATTR, tabId);
    // Electron/Chromium treats `allowpopups` as a presence-based attribute.
    // React may serialize boolean props as `allowpopups="true"`, which can
    // fail to enable popups (e.g. target="_blank") depending on platform.
    webview.setAttribute('allowpopups', '');

    if (existing === webview) {
      registerWebview(tabId, webview);
      syncWebviewSource(tabId, webview);
      return;
    }

    if (existing) {
      detachWebviewListeners(existing);
      registerWebview(tabId, null);
    }

    webviewMap.current[tabId] = webview;
    registerWebview(tabId, webview);
    attachWebview(tabId, webview);
    syncWebviewSource(tabId, webview);
  });

  const getWebviewRefCallback = useCallback((tabId: string) => {
    let callback = webviewRefCallbacks.current[tabId];
    if (!callback) {
      callback = (node: Element | null) => {
        handleWebviewRefChange(tabId, node);
      };
      webviewRefCallbacks.current[tabId] = callback;
    }
    return callback;
  }, []);

  useEffect(() => {
    for (const tab of tabs) {
      if (isInternal(tab.url)) continue;
      const webview = webviewMap.current[tab.id];
      if (!webview) continue;
      syncWebviewSource(tab.id, webview);
    }
  }, [tabs]);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onMainFrameHttpError = (_event: unknown, payload: unknown) => {
      if (typeof payload !== 'object' || !payload) return;
      const candidate = payload as MainFrameHttpErrorPayload;
      const webContentsId =
        typeof candidate.webContentsId === 'number' && Number.isFinite(candidate.webContentsId)
          ? Math.floor(candidate.webContentsId)
          : -1;
      if (webContentsId <= 0) return;

      const statusCode =
        typeof candidate.statusCode === 'number' && Number.isFinite(candidate.statusCode)
          ? Math.floor(candidate.statusCode)
          : 0;
      if (statusCode < 400) return;

      const tabId = getTabIdForWebContentsId(webContentsId);
      if (!tabId) return;
      const errorUrl = typeof candidate.url === 'string' ? candidate.url.trim() : '';

      setExternalErrorByTabId((current) => ({
        ...current,
        [tabId]: {
          route: statusCode === 404 ? 'errors/external-404' : 'errors/external-network',
          failedUrlComparable: normalizeComparableUrl(errorUrl),
        },
      }));
    };

    ipc.on('webview-main-frame-http-error', onMainFrameHttpError);
    return () => ipc.off('webview-main-frame-http-error', onMainFrameHttpError);
  }, []);

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
      options?: {
        webContentsId?: number;
      },
    ) => {
      const resolvedWebContentsId = options?.webContentsId ?? pageMenuState?.webContentsId ?? -1;
      if (!Number.isFinite(resolvedWebContentsId) || resolvedWebContentsId <= 0) return;
      const ipc = electron?.ipcRenderer;
      if (!ipc) return;

      void ipc
        .invoke('webview-context-action', {
          webContentsId: Math.floor(resolvedWebContentsId),
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
    (url: string, baseUrl: string | undefined, sourceTabId: string) => {
      const normalized = resolveContextMenuUrl(url, baseUrl);
      if (!canOpenInNewTab(normalized)) return;
      // Same as middle-click newWindowHandler: newTabToRight(tab.id, url)
      newTabToRight(sourceTabId, normalized);
      closePageMenu();
    },
    [closePageMenu, newTabToRight],
  );

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onNativeContextCommand = (_event: unknown, payload: unknown) => {
      if (typeof payload !== 'object' || !payload) return;

      const candidate = payload as NativeContextCommandPayload;
      const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
      if (!command) return;

      const webContentsId =
        typeof candidate.webContentsId === 'number' && Number.isFinite(candidate.webContentsId)
          ? Math.floor(candidate.webContentsId)
          : -1;
      const x =
        typeof candidate.x === 'number' && Number.isFinite(candidate.x)
          ? Math.floor(candidate.x)
          : 0;
      const y =
        typeof candidate.y === 'number' && Number.isFinite(candidate.y)
          ? Math.floor(candidate.y)
          : 0;
      const rawUrl = typeof candidate.url === 'string' ? candidate.url : '';
      const rawBaseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl : '';
      const resolvedUrl = resolveContextMenuUrl(rawUrl, rawBaseUrl || undefined);
      const text = typeof candidate.text === 'string' ? candidate.text : '';

      const dedupeSignature = [
        command,
        String(webContentsId),
        resolvedUrl,
        text,
        String(x),
        String(y),
      ].join('|');
      const now = Date.now();
      const previous = lastNativeContextCommandRef.current;
      if (previous && previous.signature === dedupeSignature && now - previous.at < 250) {
        return;
      }
      lastNativeContextCommandRef.current = {
        signature: dedupeSignature,
        at: now,
      };

      if (command === 'open-url-in-new-tab') {
        if (!canOpenInNewTab(resolvedUrl)) return;
        const tabIdFromPayload =
          typeof candidate.tabId === 'string' ? candidate.tabId.trim() : '';
        const sourceTabId =
          tabIdFromPayload && tabs.some((t) => t.id === tabIdFromPayload)
            ? tabIdFromPayload
            : (webContentsId > 0 ? getTabIdForWebContentsId(webContentsId) : undefined) ?? activeId;
        newTabToRight(sourceTabId, resolvedUrl);
        return;
      }

      if (command === 'open-url-in-new-window') {
        if (!canOpenInNewTab(resolvedUrl)) return;
        const renderer = electron?.ipcRenderer;
        if (renderer) {
          void renderer.invoke('window-new-with-url', resolvedUrl).catch(() => undefined);
          return;
        }
        window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (command === 'go-back') {
        goBack();
        return;
      }

      if (command === 'go-forward') {
        goForward();
        return;
      }

      if (command === 'reload') {
        reload();
        return;
      }

      if (command === 'print') {
        printPage();
        return;
      }

      if (webContentsId <= 0) return;

      if (command === 'save-page-as') {
        runWebviewContextAction('save-page-as', undefined, { webContentsId });
        return;
      }

      if (command === 'download-url') {
        runWebviewContextAction('download-url', { url: resolvedUrl }, { webContentsId });
        return;
      }

      if (command === 'copy-text') {
        runWebviewContextAction('copy-text', { text }, { webContentsId });
        return;
      }

      if (command === 'copy-image-at') {
        runWebviewContextAction('copy-image-at', { x, y }, { webContentsId });
        return;
      }

      if (command === 'inspect-element') {
        runWebviewContextAction('inspect-element', { x, y }, { webContentsId });
        return;
      }

      if (command === 'edit-undo') {
        runWebviewContextAction('edit-undo', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-redo') {
        runWebviewContextAction('edit-redo', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-cut') {
        runWebviewContextAction('edit-cut', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-copy') {
        runWebviewContextAction('edit-copy', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-paste') {
        runWebviewContextAction('edit-paste', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-paste-as-plain-text') {
        runWebviewContextAction('edit-paste-as-plain-text', undefined, { webContentsId });
        return;
      }

      if (command === 'edit-select-all') {
        runWebviewContextAction('edit-select-all', undefined, { webContentsId });
      }
    };

    ipc.on('webview-native-context-command', onNativeContextCommand);
    return () => ipc.off('webview-native-context-command', onNativeContextCommand);
  }, [activeId, goBack, goForward, newTabToRight, printPage, reload, runWebviewContextAction, tabs]);

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
      options?: { disabled?: boolean; shortcut?: string },
    ): ContextMenuEntry => ({
      type: 'item',
      label,
      shortcut: options?.shortcut,
      onSelect,
      disabled: options?.disabled,
    });
    const separator = (): ContextMenuEntry => ({ type: 'separator' });
    const inspectEntry = item(
      'Inspect',
      () => runWebviewContextAction('inspect-element', { x: params.x, y: params.y }),
      { shortcut: inspectShortcutLabel },
    );

    if (params.isEditable) {
      return [
        item('Undo', () => runWebviewContextAction('edit-undo'), {
          disabled: !params.editFlags.canUndo,
          shortcut: `${primaryShortcutLabel}+Z`,
        }),
        item('Redo', () => runWebviewContextAction('edit-redo'), {
          disabled: !params.editFlags.canRedo,
          shortcut: redoShortcutLabel,
        }),
        separator(),
        item('Cut', () => runWebviewContextAction('edit-cut'), {
          disabled: !params.editFlags.canCut,
          shortcut: `${primaryShortcutLabel}+X`,
        }),
        item('Copy', () => runWebviewContextAction('edit-copy'), {
          disabled: !params.editFlags.canCopy,
          shortcut: `${primaryShortcutLabel}+C`,
        }),
        item('Paste', () => runWebviewContextAction('edit-paste'), {
          disabled: !params.editFlags.canPaste,
          shortcut: `${primaryShortcutLabel}+V`,
        }),
        item('Paste as Plain Text', () => runWebviewContextAction('edit-paste-as-plain-text'), {
          disabled: !params.editFlags.canPasteAndMatchStyle,
          shortcut: `${primaryShortcutLabel}+Shift+V`,
        }),
        separator(),
        item('Select All', () => runWebviewContextAction('edit-select-all'), {
          disabled: !params.editFlags.canSelectAll,
          shortcut: `${primaryShortcutLabel}+A`,
        }),
        separator(),
        inspectEntry,
      ];
    }

    if (params.mediaType === 'image' || !!params.srcURL) {
      const resolvedSrcUrl = resolveContextMenuUrl(params.srcURL, params.pageURL);
      const canOpenImageInNewTab = canOpenInNewTab(resolvedSrcUrl);
      return [
        item('Open Image in New Tab', () =>
          openInNewTabFromMenu(resolvedSrcUrl, params.pageURL, pageMenuState.tabId), {
          disabled: !canOpenImageInNewTab,
        }),
        item(
          'Save Image As',
          () => runWebviewContextAction('download-url', { url: resolvedSrcUrl }),
          {
            disabled: !resolvedSrcUrl,
          },
        ),
        item('Copy Image', () =>
          runWebviewContextAction('copy-image-at', { x: params.x, y: params.y }),
        ),
        item(
          'Copy Image Address',
          () => runWebviewContextAction('copy-text', { text: resolvedSrcUrl }),
          {
            disabled: !resolvedSrcUrl,
          },
        ),
        separator(),
        inspectEntry,
      ];
    }

    if (params.linkURL) {
      const resolvedLinkUrl = resolveContextMenuUrl(params.linkURL, params.pageURL);
      const canOpenLinkInNewTab = canOpenInNewTab(resolvedLinkUrl);
      return [
        item('Open in New Tab', () =>
          openInNewTabFromMenu(resolvedLinkUrl, params.pageURL, pageMenuState.tabId), {
          disabled: !canOpenLinkInNewTab,
        }),
        item(
          'Open in New Window',
          () => {
            if (!canOpenLinkInNewTab) return;
            const ipc = electron?.ipcRenderer;
            if (ipc) {
              void ipc.invoke('window-new-with-url', resolvedLinkUrl).catch(() => undefined);
              return;
            }
            window.open(resolvedLinkUrl, '_blank', 'noopener,noreferrer');
          },
          {
            disabled: !canOpenLinkInNewTab,
          },
        ),
        separator(),
        item(
          'Copy Link Address',
          () => runWebviewContextAction('copy-text', { text: resolvedLinkUrl }),
          {
            disabled: !resolvedLinkUrl,
          },
        ),
        item(
          'Save Link As',
          () => runWebviewContextAction('download-url', { url: resolvedLinkUrl }),
          {
            disabled: !resolvedLinkUrl,
          },
        ),
        separator(),
        inspectEntry,
      ];
    }

    return [
      item('Back', () => goBack(), { disabled: !canGoBack, shortcut: 'Alt+Left' }),
      item('Forward', () => goForward(), { disabled: !canGoForward, shortcut: 'Alt+Right' }),
      item('Reload', () => reload(), { shortcut: `${primaryShortcutLabel}+R` }),
      separator(),
      item('Save As', () => runWebviewContextAction('save-page-as'), {
        shortcut: `${primaryShortcutLabel}+S`,
      }),
      item('Print', () => printPage(), { shortcut: `${primaryShortcutLabel}+P` }),
      separator(),
      item('View Source', () =>
        openInNewTabFromMenu(`view-source:${sourceUrl}`, undefined, pageMenuState.tabId), {
        disabled: !sourceUrl,
        shortcut: `${primaryShortcutLabel}+U`,
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
    inspectShortcutLabel,
    primaryShortcutLabel,
    redoShortcutLabel,
  ]);

  return (
    <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
      {renderTabs.map((tab) => {
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
              <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#fff' }}>
                <webview
                  ref={getWebviewRefCallback(tab.id)}
                  style={{ flex: 1, width: '100%', height: '100%' }}
                />
                {(() => {
                  const externalError = externalErrorByTabId[tab.id];
                  if (!externalError) return null;
                  const ErrorPage =
                    pages[externalError.route] ??
                    (externalError.route === 'errors/external-404'
                      ? pages['errors/404']
                      : pages['errors/network']);
                  if (ErrorPage) {
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 1,
                          background: 'var(--bg)',
                        }}
                      >
                        <ErrorPage />
                      </div>
                    );
                  }

                  return (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 12,
                        background: 'var(--bg)',
                        color: 'var(--text1)',
                      }}
                    >
                      <div>Failed to load this page.</div>
                      <button
                        type="button"
                        onClick={reload}
                        className="theme-btn theme-btn-go"
                        style={{ padding: '8px 14px', fontSize: 14 }}
                      >
                        Reload
                      </button>
                    </div>
                  );
                })()}
              </div>
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
