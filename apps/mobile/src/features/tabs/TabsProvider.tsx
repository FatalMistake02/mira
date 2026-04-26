import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createId } from '../../app/ids';
import { getCachedJson, setCachedJson } from '../../storage/cacheStorage';
import { useBookmarks } from '../bookmarks/BookmarksProvider';
import {
  getBrowserSettings,
  getSearchUrlFromInput,
  saveBrowserSettings,
  type BrowserSettings,
} from '../settings/browserSettings';
import { addHistoryEntry, updateHistoryEntryTitle } from '../history/clientHistory';
import type { Tab } from './types';

const SESSION_STORAGE_KEY = 'mira.mobile.session.tabs.v1';
const INTERNAL_FAVICON_URL = 'mira://favicon';
const MAX_RECENTLY_CLOSED_TABS = 25;

type SessionSnapshot = {
  tabs: Tab[];
  activeId: string;
  savedAt: number;
};

type FindInPageOptions = {
  forward?: boolean;
  findNext?: boolean;
};

type WebViewHandle = {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stopLoading: () => void;
  injectJavaScript: (script: string) => void;
};

type TabsContextType = {
  tabs: Tab[];
  activeId: string;
  activeTab: Tab | null;
  newTab: (url?: string, options?: { activate?: boolean; toIndex?: number }) => string;
  duplicateTab: (id: string) => void;
  reopenLastClosedTab: () => void;
  canReopenClosedTab: boolean;
  openHistory: () => void;
  openDownloads: () => void;
  openBookmarks: () => void;
  openSettings: () => void;
  openThemeCreator: () => void;
  openLayoutCreator: () => void;
  openUpdates: () => void;
  toggleBookmarksBar: () => void;
  bookmarkCurrentPage: () => void;
  bookmarkAllTabs: () => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  moveTabToIndex: (tabId: string, toIndex: number) => void;
  moveActiveTabBy: (delta: -1 | 1) => void;
  navigate: (
    input: string,
    tabId?: string,
    options?: { fromWebView?: boolean; skipInputNormalization?: boolean },
  ) => void;
  navigateToNewTabPage: () => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stopLoading: () => void;
  searchInPage: (query: string, options?: FindInPageOptions) => void;
  findInPageNext: (forward?: boolean) => void;
  stopFindInPage: () => void;
  updateTabMetadata: (id: string, metadata: { title?: string; favicon?: string | null }) => void;
  updateTabNavigationState: (
    id: string,
    state: {
      url: string;
      title?: string;
      canGoBack: boolean;
      canGoForward: boolean;
      loading: boolean;
    },
  ) => void;
  updateTabProgress: (id: string, progress: number) => void;
  registerWebView: (id: string, webView: WebViewHandle | null) => void;
  setActive: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInternal(url: string): boolean {
  return url.trim().toLowerCase().startsWith('mira://');
}

function normalizeMailtoNavigationUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol.toLowerCase() !== 'mailto:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function toInternalMailtoTabUrl(url: string): string | null {
  const normalizedMailtoUrl = normalizeMailtoNavigationUrl(url);
  if (!normalizedMailtoUrl) return null;
  return `mira://mailto?url=${encodeURIComponent(normalizedMailtoUrl)}`;
}

function isLikelyUrlInput(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return true;
  if (normalized.includes(' ')) return false;
  if (normalized.startsWith('localhost')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/.test(normalized)) return true;
  return normalized.includes('.');
}

function normalizeUserInputToUrl(input: string, settings: BrowserSettings): string {
  const normalized = input.trim();
  if (!normalized) return settings.newTabPage;

  if (isInternal(normalized)) return normalized;

  const mailtoUrl = toInternalMailtoTabUrl(normalized);
  if (mailtoUrl) return mailtoUrl;

  if (normalized.toLowerCase().startsWith('about:')) return normalized;

  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    try {
      return new URL(normalized).toString();
    } catch {
      return normalized;
    }
  }

  if (isLikelyUrlInput(normalized)) {
    const withProtocol =
      normalized.startsWith('localhost') || /^\d{1,3}(?:\.\d{1,3}){3}/.test(normalized)
        ? `http://${normalized}`
        : `https://${normalized}`;

    try {
      return new URL(withProtocol).toString();
    } catch {
      return getSearchUrlFromInput(
        normalized,
        settings.searchEngine,
        settings.searchEngineShortcutsEnabled,
        settings.searchEngineShortcutPrefix,
        settings.searchEngineShortcutChars,
      );
    }
  }

  return getSearchUrlFromInput(
    normalized,
    settings.searchEngine,
    settings.searchEngineShortcutsEnabled,
    settings.searchEngineShortcutPrefix,
    settings.searchEngineShortcutChars,
  );
}

function normalizeTabNavigationUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function getInternalRouteLabel(url: string): string {
  const route = url.replace(/^mira:\/\//i, '').split(/[?#]/, 1)[0];
  const normalized = route.replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'New Tab';

  return normalized
    .split(/[/-]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function getTabTitleForUrl(url: string): string {
  return isInternal(url) ? getInternalRouteLabel(url) : url;
}

function getFaviconForUrl(url: string): string | undefined {
  if (isInternal(url)) return INTERNAL_FAVICON_URL;

  try {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
  } catch {
    return undefined;
  }
}

function createInitialTab(url: string): Tab {
  const now = Date.now();
  return {
    id: createId('tab'),
    url,
    title: getTabTitleForUrl(url),
    favicon: getFaviconForUrl(url),
    history: [url],
    historyIndex: 0,
    reloadToken: 0,
    isSleeping: false,
    lastActiveAt: now,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    progress: 0,
  };
}

function normalizeTab(value: unknown, defaultUrl: string): Tab | null {
  if (!isRecord(value)) return null;

  const urlRaw = typeof value.url === 'string' ? value.url.trim() : '';
  const url = urlRaw || defaultUrl;
  const historyRaw = Array.isArray(value.history)
    ? value.history.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : [url];
  const history = historyRaw.length ? historyRaw : [url];

  const historyIndexRaw =
    typeof value.historyIndex === 'number' && Number.isFinite(value.historyIndex)
      ? Math.floor(value.historyIndex)
      : history.length - 1;
  const historyIndex = Math.max(0, Math.min(historyIndexRaw, history.length - 1));

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : createId('tab'),
    url,
    title:
      typeof value.title === 'string' && value.title.trim() ? value.title : getTabTitleForUrl(url),
    favicon:
      typeof value.favicon === 'string' && value.favicon.trim()
        ? value.favicon
        : getFaviconForUrl(url),
    history,
    historyIndex,
    reloadToken:
      typeof value.reloadToken === 'number' && Number.isFinite(value.reloadToken)
        ? value.reloadToken
        : 0,
    isSleeping: value.isSleeping === true,
    lastActiveAt:
      typeof value.lastActiveAt === 'number' && Number.isFinite(value.lastActiveAt)
        ? value.lastActiveAt
        : Date.now(),
    canGoBack: value.canGoBack === true,
    canGoForward: value.canGoForward === true,
    loading: value.loading === true,
    progress:
      typeof value.progress === 'number' && Number.isFinite(value.progress) ? value.progress : 0,
  };
}

function loadSessionSnapshot(): SessionSnapshot {
  const settings = getBrowserSettings();
  const fallbackUrl = settings.newTabPage;
  const fallbackTab = createInitialTab(fallbackUrl);
  const parsed = getCachedJson<SessionSnapshot | null>(SESSION_STORAGE_KEY, null);

  if (
    !parsed
    || settings.startupRestoreBehavior === 'fresh'
    || !Array.isArray(parsed.tabs)
    || !parsed.tabs.length
  ) {
    return {
      tabs: [fallbackTab],
      activeId: fallbackTab.id,
      savedAt: Date.now(),
    };
  }

  const tabs = parsed.tabs
    .map((tab) => normalizeTab(tab, fallbackUrl))
    .filter((tab): tab is Tab => tab !== null);
  if (!tabs.length) {
    return {
      tabs: [fallbackTab],
      activeId: fallbackTab.id,
      savedAt: Date.now(),
    };
  }

  const activeId = tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id;
  return {
    tabs,
    activeId,
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
  };
}

function persistSessionSnapshot(tabs: Tab[], activeId: string): void {
  setCachedJson(SESSION_STORAGE_KEY, {
    tabs,
    activeId,
    savedAt: Date.now(),
  } satisfies SessionSnapshot);
}

function insertAtIndex<T>(items: T[], item: T, index: number): T[] {
  const next = [...items];
  const boundedIndex = Math.max(0, Math.min(index, next.length));
  next.splice(boundedIndex, 0, item);
  return next;
}

function buildFindScript(query: string, forward = true, findNext = false): string {
  const escapedQuery = JSON.stringify(query);
  return `
    (function() {
      try {
        var query = ${escapedQuery};
        if (!query) { return true; }
        var hasWindowFind = typeof window.find === 'function';
        if (!hasWindowFind) { return true; }
        if (!${findNext ? 'true' : 'false'}) {
          window.__miraLastFindQuery = query;
        }
        window.find(query, false, false, ${forward ? 'true' : 'false'}, false, false, false);
      } catch (error) {
        true;
      }
      return true;
    })();
  `;
}

export default function TabsProvider({ children }: { children: ReactNode }) {
  const { bookmarks, addBookmark, deleteBookmark } = useBookmarks();
  const initialSession = useMemo(() => loadSessionSnapshot(), []);
  const [tabs, setTabs] = useState<Tab[]>(initialSession.tabs);
  const [activeId, setActiveIdState] = useState(initialSession.activeId);
  const webViewRefs = useRef(new Map<string, WebViewHandle | null>());
  const recentlyClosedTabsRef = useRef<Tab[]>([]);
  const lastFindQueryRef = useRef('');

  useEffect(() => {
    persistSessionSnapshot(tabs, activeId);
  }, [activeId, tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;

  const setActive = useCallback((id: string) => {
    setActiveIdState(id);
    setTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        isSleeping: tab.id !== id,
        lastActiveAt: tab.id === id ? Date.now() : tab.lastActiveAt,
      })),
    );
  }, []);

  const newTab = useCallback(
    (url?: string, options?: { activate?: boolean; toIndex?: number }) => {
      const settings = getBrowserSettings();
      const requestedUrl = url?.trim() ? url : settings.newTabPage;
      const resolvedUrl = normalizeTabNavigationUrl(requestedUrl);
      const tab = createInitialTab(resolvedUrl);

      setTabs((previous) => {
        const nextTabs =
          typeof options?.toIndex === 'number'
            ? insertAtIndex(previous, tab, options.toIndex)
            : [...previous, tab];
        return nextTabs.map((item) => ({
          ...item,
          isSleeping: options?.activate === false ? item.id !== activeId : item.id !== tab.id,
        }));
      });

      if (options?.activate !== false) {
        setActiveIdState(tab.id);
      }

      return tab.id;
    },
    [activeId],
  );

  const reopenLastClosedTab = useCallback(() => {
    const last = recentlyClosedTabsRef.current.shift();
    if (!last) return;
    setTabs((previous) =>
      [...previous, { ...last, isSleeping: false, lastActiveAt: Date.now() }].map((tab) => ({
        ...tab,
        isSleeping: tab.id !== last.id,
      })),
    );
    setActiveIdState(last.id);
  }, []);

  const updateTabMetadata = useCallback(
    (id: string, metadata: { title?: string; favicon?: string | null }) => {
      setTabs((previous) =>
        previous.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                title: metadata.title?.trim() || tab.title,
                favicon:
                  metadata.favicon === null
                    ? undefined
                    : metadata.favicon?.trim() || tab.favicon || getFaviconForUrl(tab.url),
              }
            : tab,
        ),
      );
    },
    [],
  );

  const updateTabNavigationState = useCallback(
    (
      id: string,
      state: {
        url: string;
        title?: string;
        canGoBack: boolean;
        canGoForward: boolean;
        loading: boolean;
      },
    ) => {
      const normalizedUrl = normalizeTabNavigationUrl(state.url);
      setTabs((previous) =>
        previous.map((tab) => {
          if (tab.id !== id) return tab;

          let history = tab.history.length ? [...tab.history] : [tab.url];
          let historyIndex = Math.max(0, Math.min(tab.historyIndex, history.length - 1));
          const currentEntry = history[historyIndex];

          if (normalizedUrl && normalizedUrl !== currentEntry) {
            if (history[historyIndex - 1] === normalizedUrl) {
              historyIndex -= 1;
            } else if (history[historyIndex + 1] === normalizedUrl) {
              historyIndex += 1;
            } else {
              history = [...history.slice(0, historyIndex + 1), normalizedUrl];
              historyIndex = history.length - 1;
            }
          }

          const nextTitle = state.title?.trim() || (normalizedUrl ? getTabTitleForUrl(normalizedUrl) : tab.title);
          return {
            ...tab,
            url: normalizedUrl || tab.url,
            title: nextTitle,
            favicon: normalizedUrl ? getFaviconForUrl(normalizedUrl) : tab.favicon,
            history,
            historyIndex,
            canGoBack: state.canGoBack || historyIndex > 0,
            canGoForward: state.canGoForward || historyIndex < history.length - 1,
            loading: state.loading,
            progress: state.loading ? tab.progress : 1,
          };
        }),
      );

      if (!isInternal(normalizedUrl)) {
        addHistoryEntry(normalizedUrl, state.title?.trim() || normalizedUrl).catch(() => undefined);
        if (state.title?.trim() && state.title.trim() !== normalizedUrl) {
          updateHistoryEntryTitle(normalizedUrl, state.title.trim()).catch(() => undefined);
        }
      }
    },
    [],
  );

  const updateTabProgress = useCallback((id: string, progress: number) => {
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              progress,
              loading: progress < 1 ? true : tab.loading,
            }
          : tab,
      ),
    );
  }, []);

  const navigate = useCallback(
    (
      input: string,
      tabId?: string,
      options?: { fromWebView?: boolean; skipInputNormalization?: boolean },
    ) => {
      const targetTabId = tabId ?? activeId;
      if (!targetTabId) return;

      const settings = getBrowserSettings();
      let nextUrl = options?.skipInputNormalization
        ? normalizeTabNavigationUrl(input)
        : normalizeUserInputToUrl(input, settings);

      const mailtoInternalUrl = toInternalMailtoTabUrl(nextUrl);
      if (mailtoInternalUrl) {
        nextUrl = mailtoInternalUrl;
      }

      if (nextUrl.startsWith('http://') && !options?.fromWebView) {
        nextUrl = `mira://errors/unsecure-site?url=${encodeURIComponent(nextUrl)}`;
      }

      setTabs((previous) =>
        previous.map((tab) => {
          if (tab.id !== targetTabId) return tab;

          const history = [...tab.history.slice(0, tab.historyIndex + 1), nextUrl];
          return {
            ...tab,
            url: nextUrl,
            title: getTabTitleForUrl(nextUrl),
            favicon: getFaviconForUrl(nextUrl),
            history,
            historyIndex: history.length - 1,
            reloadToken: tab.reloadToken + 1,
            canGoBack: history.length > 1,
            canGoForward: false,
            loading: !isInternal(nextUrl),
            progress: 0,
            isSleeping: false,
          };
        }),
      );

      if (targetTabId !== activeId) {
        setActive(targetTabId);
      }
    },
    [activeId, setActive],
  );

  const navigateToNewTabPage = useCallback(() => {
    navigate(getBrowserSettings().newTabPage);
  }, [navigate]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((previous) => {
        const target = previous.find((tab) => tab.id === id);
        const remaining = previous.filter((tab) => tab.id !== id);
        if (target) {
          recentlyClosedTabsRef.current = [target, ...recentlyClosedTabsRef.current].slice(
            0,
            MAX_RECENTLY_CLOSED_TABS,
          );
        }

        if (!remaining.length) {
          const fallback = createInitialTab(getBrowserSettings().newTabPage);
          setActiveIdState(fallback.id);
          return [fallback];
        }

        if (id === activeId) {
          const previousIndex = previous.findIndex((tab) => tab.id === id);
          const nextActive =
            remaining[Math.min(previousIndex, remaining.length - 1)] ?? remaining[remaining.length - 1];
          setActiveIdState(nextActive.id);
          return remaining.map((tab) => ({
            ...tab,
            isSleeping: tab.id !== nextActive.id,
          }));
        }

        return remaining;
      });
      webViewRefs.current.delete(id);
    },
    [activeId],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      setTabs((previous) => {
        const keep = previous.find((tab) => tab.id === id);
        if (!keep) return previous;

        const closed = previous.filter((tab) => tab.id !== id);
        recentlyClosedTabsRef.current = [...closed, ...recentlyClosedTabsRef.current].slice(
          0,
          MAX_RECENTLY_CLOSED_TABS,
        );
        setActiveIdState(id);
        return [{ ...keep, isSleeping: false }];
      });
    },
    [],
  );

  const closeTabsToRight = useCallback(
    (id: string) => {
      setTabs((previous) => {
        const index = previous.findIndex((tab) => tab.id === id);
        if (index === -1) return previous;
        const closed = previous.slice(index + 1);
        recentlyClosedTabsRef.current = [...closed, ...recentlyClosedTabsRef.current].slice(
          0,
          MAX_RECENTLY_CLOSED_TABS,
        );
        return previous.slice(0, index + 1);
      });
    },
    [],
  );

  const moveTabToIndex = useCallback((tabId: string, toIndex: number) => {
    setTabs((previous) => {
      const fromIndex = previous.findIndex((tab) => tab.id === tabId);
      if (fromIndex === -1) return previous;

      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      const boundedIndex = Math.max(0, Math.min(toIndex, next.length));
      next.splice(boundedIndex, 0, moved);
      return next;
    });
  }, []);

  const moveActiveTabBy = useCallback(
    (delta: -1 | 1) => {
      const index = tabs.findIndex((tab) => tab.id === activeId);
      if (index === -1) return;
      moveTabToIndex(activeId, index + delta);
    },
    [activeId, moveTabToIndex, tabs],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      const source = tabs.find((tab) => tab.id === id);
      if (!source) return;
      const duplicated = createInitialTab(source.url);
      duplicated.title = source.title;
      duplicated.favicon = source.favicon;
      duplicated.history = [...source.history];
      duplicated.historyIndex = source.historyIndex;
      const sourceIndex = tabs.findIndex((tab) => tab.id === id);
      setTabs((previous) => insertAtIndex(previous, duplicated, sourceIndex + 1));
      setActiveIdState(duplicated.id);
    },
    [tabs],
  );

  const openOrFocusInternalTab = useCallback(
    (url: string) => {
      const existing = tabs.find((tab) => tab.url.trim().toLowerCase() === url.trim().toLowerCase());
      if (existing) {
        setActive(existing.id);
        return;
      }

      if (activeTab && activeTab.url.trim().toLowerCase() === getBrowserSettings().newTabPage.trim().toLowerCase()) {
        navigate(url, activeTab.id, { skipInputNormalization: true });
        return;
      }

      newTab(url);
    },
    [activeTab, navigate, newTab, setActive, tabs],
  );

  const openHistory = useCallback(() => openOrFocusInternalTab('mira://history'), [openOrFocusInternalTab]);
  const openDownloads = useCallback(() => openOrFocusInternalTab('mira://downloads'), [openOrFocusInternalTab]);
  const openBookmarks = useCallback(() => openOrFocusInternalTab('mira://bookmarks'), [openOrFocusInternalTab]);
  const openSettings = useCallback(() => openOrFocusInternalTab('mira://settings'), [openOrFocusInternalTab]);
  const openThemeCreator = useCallback(() => openOrFocusInternalTab('mira://themecreator'), [openOrFocusInternalTab]);
  const openLayoutCreator = useCallback(() => openOrFocusInternalTab('mira://layoutcreator'), [openOrFocusInternalTab]);
  const openUpdates = useCallback(() => openOrFocusInternalTab('mira://updates'), [openOrFocusInternalTab]);

  const toggleBookmarksBar = useCallback(() => {
    const current = getBrowserSettings();
    saveBrowserSettings({
      showBookmarksBar: !current.showBookmarksBar,
    });
  }, []);

  const bookmarkCurrentPage = useCallback(() => {
    if (!activeTab || !activeTab.url || activeTab.url.startsWith('mira://errors/')) return;

    const existing = bookmarks.find(
      (bookmark) => bookmark.type === 'bookmark' && bookmark.url === activeTab.url,
    );
    if (existing) {
      deleteBookmark(existing.id);
      return;
    }

    addBookmark({
      title: activeTab.title || activeTab.url,
      type: 'bookmark',
      url: activeTab.url,
    });
  }, [activeTab, addBookmark, bookmarks, deleteBookmark]);

  const bookmarkAllTabs = useCallback(() => {
    const bookmarkableTabs = tabs.filter((tab) => !isInternal(tab.url) && !tab.url.startsWith('mira://errors/'));
    bookmarkableTabs.forEach((tab) => {
      const exists = bookmarks.some(
        (bookmark) => bookmark.type === 'bookmark' && bookmark.url === tab.url,
      );
      if (!exists) {
        addBookmark({
          title: tab.title || tab.url,
          type: 'bookmark',
          url: tab.url,
        });
      }
    });
  }, [addBookmark, bookmarks, tabs]);

  const goBack = useCallback(() => {
    if (!activeTab) return;
    const webView = webViewRefs.current.get(activeTab.id);
    if (webView && activeTab.canGoBack) {
      webView.goBack();
      return;
    }

    if (activeTab.historyIndex <= 0) return;
    const nextUrl = activeTab.history[activeTab.historyIndex - 1];
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              url: nextUrl,
              historyIndex: tab.historyIndex - 1,
              title: getTabTitleForUrl(nextUrl),
              favicon: getFaviconForUrl(nextUrl),
              reloadToken: tab.reloadToken + 1,
              canGoBack: tab.historyIndex - 1 > 0,
              canGoForward: true,
            }
          : tab,
      ),
    );
  }, [activeTab]);

  const goForward = useCallback(() => {
    if (!activeTab) return;
    const webView = webViewRefs.current.get(activeTab.id);
    if (webView && activeTab.canGoForward) {
      webView.goForward();
      return;
    }

    if (activeTab.historyIndex >= activeTab.history.length - 1) return;
    const nextUrl = activeTab.history[activeTab.historyIndex + 1];
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              url: nextUrl,
              historyIndex: tab.historyIndex + 1,
              title: getTabTitleForUrl(nextUrl),
              favicon: getFaviconForUrl(nextUrl),
              reloadToken: tab.reloadToken + 1,
              canGoBack: true,
              canGoForward: tab.historyIndex + 1 < tab.history.length - 1,
            }
          : tab,
      ),
    );
  }, [activeTab]);

  const reload = useCallback(() => {
    if (!activeTab) return;
    const webView = webViewRefs.current.get(activeTab.id);
    if (webView) {
      webView.reload();
      return;
    }

    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTab.id ? { ...tab, reloadToken: tab.reloadToken + 1 } : tab,
      ),
    );
  }, [activeTab]);

  const stopLoading = useCallback(() => {
    if (!activeTab) return;
    const webView = webViewRefs.current.get(activeTab.id);
    webView?.stopLoading();
  }, [activeTab]);

  const searchInPage = useCallback(
    (query: string, options?: FindInPageOptions) => {
      if (!activeTab || isInternal(activeTab.url)) return;
      const webView = webViewRefs.current.get(activeTab.id);
      if (!webView) return;
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return;

      lastFindQueryRef.current = normalizedQuery;
      webView.injectJavaScript(
        buildFindScript(normalizedQuery, options?.forward !== false, options?.findNext === true),
      );
    },
    [activeTab],
  );

  const findInPageNext = useCallback(
    (forward = true) => {
      if (!lastFindQueryRef.current) return;
      searchInPage(lastFindQueryRef.current, { forward, findNext: true });
    },
    [searchInPage],
  );

  const stopFindInPage = useCallback(() => {
    lastFindQueryRef.current = '';
  }, []);

  const registerWebView = useCallback((id: string, webView: WebViewHandle | null) => {
    if (webView) {
      webViewRefs.current.set(id, webView);
      return;
    }
    webViewRefs.current.delete(id);
  }, []);

  const value = useMemo<TabsContextType>(
    () => ({
      tabs,
      activeId,
      activeTab,
      newTab,
      duplicateTab,
      reopenLastClosedTab,
      canReopenClosedTab: recentlyClosedTabsRef.current.length > 0,
      openHistory,
      openDownloads,
      openBookmarks,
      openSettings,
      openThemeCreator,
      openLayoutCreator,
      openUpdates,
      toggleBookmarksBar,
      bookmarkCurrentPage,
      bookmarkAllTabs,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      moveTabToIndex,
      moveActiveTabBy,
      navigate,
      navigateToNewTabPage,
      goBack,
      goForward,
      reload,
      stopLoading,
      searchInPage,
      findInPageNext,
      stopFindInPage,
      updateTabMetadata,
      updateTabNavigationState,
      updateTabProgress,
      registerWebView,
      setActive,
    }),
    [
      activeId,
      activeTab,
      bookmarkAllTabs,
      bookmarkCurrentPage,
      closeOtherTabs,
      closeTab,
      closeTabsToRight,
      duplicateTab,
      findInPageNext,
      goBack,
      goForward,
      moveActiveTabBy,
      moveTabToIndex,
      navigate,
      navigateToNewTabPage,
      newTab,
      openBookmarks,
      openDownloads,
      openHistory,
      openLayoutCreator,
      openSettings,
      openThemeCreator,
      openUpdates,
      registerWebView,
      reload,
      reopenLastClosedTab,
      searchInPage,
      setActive,
      stopFindInPage,
      stopLoading,
      tabs,
      toggleBookmarksBar,
      updateTabMetadata,
      updateTabNavigationState,
      updateTabProgress,
    ],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsContextType {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within TabsProvider');
  }
  return context;
}
