import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Tab } from './types';
import { addHistoryEntry, updateHistoryEntryTitle } from '../history/clientHistory';
import { electron } from '../../electronBridge';
import miraLogo from '../../assets/mira_logo.png';
import {
  BROWSER_SETTINGS_CHANGED_EVENT,
  getBrowserSettings,
  getTabSleepAfterMs,
} from '../settings/browserSettings';

const SESSION_STORAGE_KEY = 'mira.session.tabs.v1';
const IPC_OPEN_TAB_DEDUPE_WINDOW_MS = 500;
const INTERNAL_FAVICON_URL = miraLogo;

type WebviewElement = {
  reload: () => void;
  findInPage: (text: string) => void;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  print?: (options?: unknown, callback?: (success: boolean, failureReason: string) => void) => void;
} | null;

type SessionSnapshot = {
  tabs: Tab[];
  activeId: string;
  savedAt: number;
};

type SessionRestoreState = {
  hasPendingRestore: boolean;
  tabCount: number;
  windowCount: number;
};

type SessionRestoreMode = 'tabs' | 'windows';

type TabsContextType = {
  tabs: Tab[];
  activeId: string;
  newTab: (url?: string) => void;
  openHistory: () => void;
  closeTab: (id: string) => void;
  moveTab: (fromId: string, toId: string) => void;
  moveTabToIndex: (tabId: string, toIndex: number) => void;
  moveTabToNewWindow: (id: string) => void;
  navigate: (url: string, tabId?: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  findInPage: () => void;
  toggleDevTools: () => void;
  updateTabMetadata: (
    id: string,
    metadata: { title?: string; favicon?: string | null },
  ) => void;
  printPage: () => void;
  registerWebview: (id: string, el: WebviewElement) => void;
  setActive: (id: string) => void;
  restorePromptOpen: boolean;
  restoreTabCount: number;
  restoreWindowCount: number;
  restoreTabsFromPreviousSession: () => void;
  restoreWindowsFromPreviousSession: () => void;
  discardPreviousSession: () => void;
};

const TabsContext = createContext<TabsContextType>(null!);
export const useTabs = () => useContext(TabsContext);

function isNewTabUrl(url: string, defaultTabUrl: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized === 'mira://newtab' || normalized === defaultTabUrl.trim().toLowerCase();
}

function isSessionEphemeralTabUrl(url: string): boolean {
  return url.trim().toLowerCase() === 'mira://newtab';
}

function filterRestorableTabs(tabs: Tab[]): Tab[] {
  return tabs.filter((tab) => !isSessionEphemeralTabUrl(tab.url));
}

function createInitialTab(url: string): Tab {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    url,
    title: url.startsWith('mira://') ? 'New Tab' : url,
    favicon: url.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
    history: [url],
    historyIndex: 0,
    reloadToken: 0,
    isSleeping: false,
    lastActiveAt: now,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTab(value: unknown, defaultTabUrl: string): Tab | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : crypto.randomUUID();
  const url = typeof value.url === 'string' && value.url.trim() ? value.url : defaultTabUrl;
  const title =
    typeof value.title === 'string' && value.title.trim()
      ? value.title.trim()
      : url.startsWith('mira://')
        ? 'New Tab'
        : url;
  const favicon = url.startsWith('mira://')
    ? INTERNAL_FAVICON_URL
    : typeof value.favicon === 'string' && value.favicon.trim()
      ? value.favicon.trim()
      : undefined;
  const historyRaw = Array.isArray(value.history) ? value.history : [url];
  const history = historyRaw.filter(
    (entry): entry is string => typeof entry === 'string' && !!entry.trim(),
  );
  const normalizedHistory = history.length ? history : [url];
  const historyIndexRaw =
    typeof value.historyIndex === 'number' ? value.historyIndex : normalizedHistory.length - 1;
  const historyIndex = Math.min(
    Math.max(Math.floor(historyIndexRaw), 0),
    normalizedHistory.length - 1,
  );
  const reloadToken =
    typeof value.reloadToken === 'number' && Number.isFinite(value.reloadToken)
      ? value.reloadToken
      : 0;
  const isSleeping = typeof value.isSleeping === 'boolean' ? value.isSleeping : false;
  const lastActiveAt =
    typeof value.lastActiveAt === 'number' && Number.isFinite(value.lastActiveAt)
      ? value.lastActiveAt
      : Date.now();

  return {
    id,
    url,
    title,
    favicon,
    history: normalizedHistory,
    historyIndex,
    reloadToken,
    isSleeping,
    lastActiveAt,
  };
}

function parseSnapshot(raw: string | null, defaultTabUrl: string): SessionSnapshot | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    const tabsRaw = Array.isArray(parsed.tabs) ? parsed.tabs : [];
    const tabs = tabsRaw
      .map((tab) => normalizeTab(tab, defaultTabUrl))
      .filter((tab): tab is Tab => tab !== null);
    const restorableTabs = filterRestorableTabs(tabs);
    if (!restorableTabs.length) return null;

    const activeIdRaw = typeof parsed.activeId === 'string' ? parsed.activeId : restorableTabs[0].id;
    const activeId = restorableTabs.some((tab) => tab.id === activeIdRaw)
      ? activeIdRaw
      : restorableTabs[0].id;

    return {
      tabs: restorableTabs,
      activeId,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function isDefaultSnapshot(snapshot: SessionSnapshot, defaultTabUrl: string): boolean {
  return snapshot.tabs.length === 1 && snapshot.tabs[0].url === defaultTabUrl;
}

export default function TabsProvider({ children }: { children: React.ReactNode }) {
  const initialTabUrlRef = useRef(getBrowserSettings().newTabPage);
  const initialTabRef = useRef<Tab>(createInitialTab(initialTabUrlRef.current));
  const [tabs, setTabs] = useState<Tab[]>([initialTabRef.current]);
  const [activeId, setActiveId] = useState(initialTabRef.current.id);
  const [tabSleepAfterMs, setTabSleepAfterMs] = useState(() =>
    getTabSleepAfterMs(getBrowserSettings()),
  );
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionSnapshot | null>(null);
  const [restoreTabCountState, setRestoreTabCountState] = useState(0);
  const [restoreWindowCount, setRestoreWindowCount] = useState(1);

  const webviewMap = useRef<Record<string, WebviewElement>>({});
  const hydratedRef = useRef(false);
  const recentIpcTabOpenRef = useRef<{ url: string; openedAt: number } | null>(null);
  const tabSleepTimerRef = useRef<number | null>(null);

  const persistSession = (nextTabs: Tab[], nextActiveId: string) => {
    const restorableTabs = filterRestorableTabs(nextTabs);
    const safeActiveId = restorableTabs.some((tab) => tab.id === nextActiveId)
      ? nextActiveId
      : restorableTabs[0]?.id;

    if (!restorableTabs.length || !safeActiveId) {
      if (electron?.ipcRenderer) {
        electron.ipcRenderer.invoke('session-save-window', null).catch(() => undefined);
        return;
      }
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage failures (quota/private mode).
      }
      return;
    }

    const snapshot: SessionSnapshot = {
      tabs: restorableTabs,
      activeId: safeActiveId,
      savedAt: Date.now(),
    };

    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('session-save-window', snapshot).catch(() => undefined);
      return;
    }

    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures (quota/private mode).
    }
  };

  useEffect(() => {
    const syncTabSleepTimeout = () => {
      setTabSleepAfterMs(getTabSleepAfterMs(getBrowserSettings()));
    };

    syncTabSleepTimeout();
    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncTabSleepTimeout);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, syncTabSleepTimeout);
  }, []);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) {
      const currentDefaultTabUrl = getBrowserSettings().newTabPage;
      const snapshot = parseSnapshot(localStorage.getItem(SESSION_STORAGE_KEY), currentDefaultTabUrl);
      if (snapshot && !isDefaultSnapshot(snapshot, currentDefaultTabUrl)) {
        setPendingSession(snapshot);
        setRestoreTabCountState(snapshot.tabs.length);
        setRestorePromptOpen(true);
      }
      hydratedRef.current = true;
      return;
    }

    let cancelled = false;
    const bootstrapSessionRestore = async () => {
      const windowRestore = await ipc.invoke<SessionSnapshot | null>('session-take-window-restore');
      if (cancelled) return;

      if (windowRestore && windowRestore.tabs.length > 0) {
        const now = Date.now();
        const nextTabs = windowRestore.tabs.map((tab) =>
          tab.id === windowRestore.activeId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
        );
        setTabs(nextTabs);
        setActiveId(windowRestore.activeId);
        setPendingSession(null);
        setRestoreTabCountState(0);
        setRestorePromptOpen(false);
        setRestoreWindowCount(1);
        hydratedRef.current = true;
        return;
      }

      const restoreState = await ipc.invoke<SessionRestoreState>('session-get-restore-state');
      if (cancelled) return;

      if (restoreState?.hasPendingRestore) {
        setRestorePromptOpen(true);
        setRestoreTabCountState(Math.max(restoreState.tabCount || 0, 0));
        setRestoreWindowCount(Math.max(restoreState.windowCount || 1, 1));
      }
      hydratedRef.current = true;
    };

    void bootstrapSessionRestore();
    return () => {
      cancelled = true;
    };
  }, []);

  const restorePreviousSession = (mode: SessionRestoreMode) => {
    const ipc = electron?.ipcRenderer;
    if (ipc) {
      ipc.invoke<SessionSnapshot | null>('session-accept-restore', mode)
        .then((snapshot) => {
          if (!snapshot || !snapshot.tabs.length) {
            setRestorePromptOpen(false);
            return;
          }

          const now = Date.now();
          const restoredTabs = snapshot.tabs.map((tab) =>
            tab.id === snapshot.activeId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
          );
          setTabs(restoredTabs);
          setActiveId(snapshot.activeId);
          setRestorePromptOpen(false);
          setPendingSession(null);
          setRestoreTabCountState(0);
          setRestoreWindowCount(1);
          persistSession(restoredTabs, snapshot.activeId);
        })
        .catch(() => {
          setRestorePromptOpen(false);
        });
      return;
    }

    if (!pendingSession) {
      setRestorePromptOpen(false);
      return;
    }

    const now = Date.now();
    const restoredTabs = pendingSession.tabs.map((tab) =>
      tab.id === pendingSession.activeId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
    );
    setTabs(restoredTabs);
    setActiveId(pendingSession.activeId);
    setRestorePromptOpen(false);
    setPendingSession(null);
    persistSession(restoredTabs, pendingSession.activeId);
  };

  const restoreTabsFromPreviousSession = () => {
    restorePreviousSession('tabs');
  };

  const restoreWindowsFromPreviousSession = () => {
    restorePreviousSession('windows');
  };

  const discardPreviousSession = () => {
    const ipc = electron?.ipcRenderer;
    if (ipc) {
      ipc.invoke('session-discard-restore').catch(() => undefined);
    }
    setRestorePromptOpen(false);
    setPendingSession(null);
    setRestoreTabCountState(0);
    setRestoreWindowCount(1);
    if (!ipc) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    persistSession(tabs, activeId);
  };

  const registerWebview = (id: string, el: WebviewElement) => {
    if (el) {
      webviewMap.current[id] = el;
    } else {
      delete webviewMap.current[id];
    }
  };

  function miraUrlToName(url?: string) {
    if (!url?.startsWith('mira://')) {
      throw new Error(`Invalid mira url: '${url}'`);
    }
    const sanitized = url.slice(7);
    switch (sanitized.toLowerCase()) {
      case 'newtab':
        return 'New Tab';
      default:
        // return a capitalized version of the url
        return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }
  }

  const newTab = useCallback((url?: string) => {
    const defaultNewTabUrl = getBrowserSettings().newTabPage;
    const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : defaultNewTabUrl;
    const now = Date.now();
    const id = crypto.randomUUID();
    const newEntry: Tab = {
      id,
      url: targetUrl,
      title: targetUrl.startsWith('mira://') ? miraUrlToName(targetUrl) : targetUrl,
      favicon: targetUrl.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
      history: [targetUrl],
      historyIndex: 0,
      reloadToken: 0,
      isSleeping: false,
      lastActiveAt: now,
    };
    setTabs((t) =>
      t
        .map((tab) => (tab.id === activeId ? { ...tab, lastActiveAt: now } : tab))
        .concat(newEntry),
    );
    setActiveId(id);
  }, [activeId]);

  const openHistory = () => {
    const activeTab = tabs.find((t) => t.id === activeId);
    const newTabUrl = getBrowserSettings().newTabPage;
    const isNewTab = !!activeTab && isNewTabUrl(activeTab.url, newTabUrl);

    if (isNewTab && activeTab) {
      navigate('mira://history', activeTab.id); // reuse current tab
    } else {
      newTab('mira://history'); // open separate tab
    }
  };

  const closeCurrentWindow = () => {
    const ipc = electron?.ipcRenderer;
    if (ipc) {
      ipc.invoke('session-save-window', null).catch(() => undefined);
      ipc.invoke('window-close').catch(() => undefined);
      return;
    }

    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    window.close();
  };

  const closeTab = (id: string) => {
    const shouldCloseWindow = tabs.length === 1 && tabs[0]?.id === id;
    if (shouldCloseWindow) {
      closeCurrentWindow();
      return;
    }

    setTabs((t) => {
      const next = t.filter((tab) => tab.id !== id);
      if (id !== activeId || !next.length) return next;

      const nextActiveId = next[0].id;
      const now = Date.now();
      setActiveId(nextActiveId);
      return next.map((tab) =>
        tab.id === nextActiveId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
      );
    });
  };

  const moveTab = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;

    setTabs((currentTabs) => {
      const fromIndex = currentTabs.findIndex((tab) => tab.id === fromId);
      const toIndex = currentTabs.findIndex((tab) => tab.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return currentTabs;
      }

      const nextTabs = [...currentTabs];
      const [moved] = nextTabs.splice(fromIndex, 1);
      nextTabs.splice(toIndex, 0, moved);
      return nextTabs;
    });
  }, []);

  const moveTabToIndex = useCallback((tabId: string, toIndex: number) => {
    if (!tabId) return;

    setTabs((currentTabs) => {
      const fromIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      if (fromIndex === -1) return currentTabs;

      const normalizedToIndex = Math.floor(toIndex);
      if (!Number.isFinite(normalizedToIndex)) return currentTabs;

      const boundedTargetIndex = Math.max(0, Math.min(normalizedToIndex, currentTabs.length - 1));
      if (boundedTargetIndex === fromIndex) {
        return currentTabs;
      }

      const nextTabs = [...currentTabs];
      const [moved] = nextTabs.splice(fromIndex, 1);
      const boundedIndex = Math.max(0, Math.min(boundedTargetIndex, nextTabs.length));
      nextTabs.splice(boundedIndex, 0, moved);
      return nextTabs;
    });
  }, []);


  const moveTabToNewWindow = useCallback(
    (id: string) => {
      const tabToMove = tabs.find((tab) => tab.id === id);
      if (!tabToMove) return;

      const url = tabToMove.url.trim();
      if (electron?.ipcRenderer) {
        electron.ipcRenderer.invoke('window-new-with-url', url).catch(() => undefined);
      } else {
        window.open(url || window.location.href, '_blank', 'noopener,noreferrer');
      }

      setTabs((currentTabs) => {
        const nextTabs = currentTabs.filter((tab) => tab.id !== id);
        if (!nextTabs.length) {
          const replacement = createInitialTab(getBrowserSettings().newTabPage);
          setActiveId(replacement.id);
          return [replacement];
        }

        if (id !== activeId) return nextTabs;

        const now = Date.now();
        const nextActiveId = nextTabs[0].id;
        setActiveId(nextActiveId);
        return nextTabs.map((tab) =>
          tab.id === nextActiveId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
        );
      });
    },
    [tabs, activeId],
  );

  const setActive = useCallback(
    (id: string) => {
      const now = Date.now();
      setTabs((currentTabs) => {
        let changed = false;
        const nextTabs = currentTabs.map((tab) => {
          if (tab.id === activeId || tab.id === id) {
            const nextLastActiveAt = now;
            const nextIsSleeping = tab.id === id ? false : tab.isSleeping;
            if (tab.lastActiveAt !== nextLastActiveAt || tab.isSleeping !== nextIsSleeping) {
              changed = true;
              return {
                ...tab,
                lastActiveAt: nextLastActiveAt,
                isSleeping: nextIsSleeping,
              };
            }
          }
          return tab;
        });
        return changed ? nextTabs : currentTabs;
      });
      setActiveId(id);
    },
    [activeId],
  );

  const updateTabMetadata = useCallback(
    (id: string, metadata: { title?: string; favicon?: string | null }) => {
      const historyTitleUpdates: Array<{ url: string; title: string }> = [];
      setTabs((currentTabs) => {
        let changed = false;
        const nextTabs = currentTabs.map((tab) => {
          if (tab.id !== id) return tab;

          let nextTitle = tab.title;
          let nextFavicon = tab.favicon;

          if (typeof metadata.title === 'string') {
            const normalizedTitle = metadata.title.trim();
            if (normalizedTitle) {
              nextTitle = normalizedTitle;
              if (!tab.url.startsWith('mira://') && normalizedTitle !== tab.url) {
                historyTitleUpdates.push({ url: tab.url, title: normalizedTitle });
              }
            }
          }

          if (metadata.favicon !== undefined) {
            const normalizedFavicon =
              typeof metadata.favicon === 'string' && metadata.favicon.trim()
                ? metadata.favicon.trim()
                : undefined;
            nextFavicon = normalizedFavicon;
          }

          if (nextTitle === tab.title && nextFavicon === tab.favicon) {
            return tab;
          }

          changed = true;
          return {
            ...tab,
            title: nextTitle,
            favicon: nextFavicon,
          };
        });

        return changed ? nextTabs : currentTabs;
      });
      for (const update of historyTitleUpdates) {
        updateHistoryEntryTitle(update.url, update.title).catch(() => undefined);
      }
    },
    [],
  );

  const navigate = (url: string, tabId?: string) => {
    const targetTabId = tabId ?? activeId;
    const normalized = url.trim();
    if (normalized && !normalized.startsWith('mira://')) {
      addHistoryEntry(normalized, normalized).catch(() => undefined);
    }

    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== targetTabId) return tab;

        const currentUrl = tab.history[tab.historyIndex];
        if (currentUrl === normalized) {
          return { ...tab, url: normalized };
        }

        const newHistory = tab.history.slice(0, tab.historyIndex + 1).concat(normalized);
        const defaultTitle = normalized.startsWith('mira://') ? miraUrlToName(normalized) : normalized;
        return {
          ...tab,
          url: normalized,
          title: defaultTitle,
          favicon: normalized.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          reloadToken: tab.reloadToken,
        };
      }),
    );
  };

  const goBack = () => {
    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== activeId) return tab;
        if (tab.historyIndex === 0) return tab;
        const newIdx = tab.historyIndex - 1;
        return {
          ...tab,
          url: tab.history[newIdx],
          historyIndex: newIdx,
        };
      }),
    );
  };

  const goForward = () => {
    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== activeId) return tab;
        if (tab.historyIndex >= tab.history.length - 1) return tab;
        const newIdx = tab.historyIndex + 1;
        return {
          ...tab,
          url: tab.history[newIdx],
          historyIndex: newIdx,
        };
      }),
    );
  };

  const reload = () => {
    const wv = webviewMap.current[activeId];
    if (wv && typeof wv.reload === 'function') {
      wv.reload();
      return;
    }

    setTabs((t) =>
      t.map((tab) => (tab.id === activeId ? { ...tab, reloadToken: tab.reloadToken + 1 } : tab)),
    );
  };

  const findInPage = () => {
    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.findInPage !== 'function') return;

    const query = window.prompt('Find in page');
    if (!query) return;
    wv.findInPage(query);
  };

  const toggleDevTools = () => {
    const wv = webviewMap.current[activeId];
    if (!wv) return;

    if (typeof wv.isDevToolsOpened === 'function' && wv.isDevToolsOpened()) {
      if (typeof wv.closeDevTools === 'function') {
        wv.closeDevTools();
      }
      return;
    }

    if (typeof wv.openDevTools === 'function') {
      wv.openDevTools();
    }
  };
  const printPage = useCallback(() => {
    const activeTab = tabs.find((tab) => tab.id === activeId);
    if (activeTab?.url.startsWith('mira://')) {
      window.print();
      return;
    }

    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.print !== 'function') return;

    wv.print({ printBackground: true });
  }, [tabs, activeId]);

  useEffect(() => {
    const sleepInactiveTabs = () => {
      const now = Date.now();
      setTabs((currentTabs) => {
        let changed = false;
        const nextTabs = currentTabs.map((tab) => {
          if (tab.id === activeId) {
            if (tab.isSleeping) {
              changed = true;
              return { ...tab, isSleeping: false, lastActiveAt: now };
            }
            return tab;
          }

          const shouldSleep = now - tab.lastActiveAt >= tabSleepAfterMs;
          if (shouldSleep && !tab.isSleeping) {
            changed = true;
            return { ...tab, isSleeping: true };
          }

          return tab;
        });
        return changed ? nextTabs : currentTabs;
      });
    };

    const scheduleNextSleepCheck = () => {
      if (tabSleepTimerRef.current !== null) {
        window.clearTimeout(tabSleepTimerRef.current);
      }

      const now = Date.now();
      let nextCheckInMs: number | null = null;

      for (const tab of tabs) {
        if (tab.id === activeId || tab.isSleeping) continue;
        const remainingMs = Math.max(tab.lastActiveAt + tabSleepAfterMs - now, 0);
        if (nextCheckInMs === null || remainingMs < nextCheckInMs) {
          nextCheckInMs = remainingMs;
        }
      }

      if (nextCheckInMs === null) return;

      tabSleepTimerRef.current = window.setTimeout(() => {
        sleepInactiveTabs();
      }, nextCheckInMs);
    };

    sleepInactiveTabs();
    scheduleNextSleepCheck();

    return () => {
      if (tabSleepTimerRef.current !== null) {
        window.clearTimeout(tabSleepTimerRef.current);
        tabSleepTimerRef.current = null;
      }
    };
  }, [tabs, activeId, tabSleepAfterMs]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (restorePromptOpen) return;
    persistSession(tabs, activeId);
  }, [tabs, activeId, restorePromptOpen]);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onOpenUrlInNewTab = (_event: unknown, url: string) => {
      if (!url || typeof url !== 'string') return;
      const normalized = url.trim();
      if (!normalized) return;

      const now = Date.now();
      const last = recentIpcTabOpenRef.current;
      const isDuplicate =
        !!last && last.url === normalized && now - last.openedAt < IPC_OPEN_TAB_DEDUPE_WINDOW_MS;
      if (isDuplicate) return;

      recentIpcTabOpenRef.current = { url: normalized, openedAt: now };
      newTab(normalized);
    };

    ipc.on('open-url-in-new-tab', onOpenUrlInNewTab);
    return () => ipc.off('open-url-in-new-tab', onOpenUrlInNewTab);
  }, [newTab]);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onOpenUrlInCurrentTab = (_event: unknown, url: string) => {
      if (typeof url !== 'string') return;
      const normalized = url.trim();
      if (!normalized) return;
      navigate(normalized);
    };

    ipc.on('open-url-in-current-tab', onOpenUrlInCurrentTab);
    return () => ipc.off('open-url-in-current-tab', onOpenUrlInCurrentTab);
  }, [navigate]);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeId,
        newTab,
        openHistory,
        closeTab,
        moveTab,
        moveTabToIndex,
        moveTabToNewWindow,
        navigate,
        goBack,
        goForward,
        reload,
        findInPage,
        toggleDevTools,
        updateTabMetadata,
        printPage,
        registerWebview,
        setActive,
        restorePromptOpen,
        restoreTabCount: pendingSession?.tabs.length ?? restoreTabCountState,
        restoreWindowCount,
        restoreTabsFromPreviousSession,
        restoreWindowsFromPreviousSession,
        discardPreviousSession,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
}
