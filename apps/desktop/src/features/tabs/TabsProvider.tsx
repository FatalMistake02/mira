import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Tab } from './types';
import { addHistoryEntry, updateHistoryEntryTitle } from '../history/clientHistory';
import { electron } from '../../electronBridge';
import miraLogo from '../../assets/mira_logo.png';
import {
  BROWSER_SETTINGS_CHANGED_EVENT,
  getBrowserSettings,
  getTabSleepAfterMs,
  type StartupRestoreBehavior,
} from '../settings/browserSettings';

const SESSION_STORAGE_KEY = 'mira.session.tabs.v1';
const IPC_OPEN_TAB_DEDUPE_WINDOW_MS = 500;
const INTERNAL_FAVICON_URL = miraLogo;

type FindInPageOptions = {
  forward?: boolean;
  findNext?: boolean;
  matchCase?: boolean;
};

type ScrollPageCommand = 'page-down' | 'page-up' | 'top' | 'bottom';

type FindInPageMatchState = {
  activeMatchOrdinal: number;
  matches: number;
};

type WebviewElement = {
  reload: () => void;
  reloadIgnoringCache?: () => void;
  stop?: () => void;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
  setZoomFactor?: (factor: number) => void;
  getZoomFactor?: (callback: (factor: number) => void) => void;
  findInPage: (text: string, options?: FindInPageOptions) => number;
  stopFindInPage?: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  getWebContentsId?: () => number;
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
type ApplyRestoredSnapshotOptions = {
  stageOnNewTab?: boolean;
};

type TabsContextType = {
  tabs: Tab[];
  activeId: string;
  newTab: (url?: string, options?: { activate?: boolean; activateDelayMs?: number }) => void;
  newTabToRight: (id: string, url?: string) => void;
  reloadTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  reopenLastClosedTab: () => void;
  openHistory: () => void;
  openDownloads: () => void;
  closeWindow: () => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  moveTab: (fromId: string, toId: string) => void;
  moveTabToIndex: (tabId: string, toIndex: number) => void;
  moveActiveTabBy: (delta: -1 | 1) => void;
  moveTabToNewWindow: (id: string) => void;
  navigate: (url: string, tabId?: string) => void;
  navigateToNewTabPage: () => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache: () => void;
  stopLoading: () => void;
  searchInPage: (query: string, options?: FindInPageOptions) => void;
  findInPageNext: (forward?: boolean) => void;
  stopFindInPage: () => void;
  findInPageActiveMatchOrdinal: number;
  findInPageMatches: number;
  updateFindInPageMatches: (
    tabId: string,
    requestId: number,
    activeMatchOrdinal: number,
    matches: number,
  ) => void;
  toggleDevTools: () => void;
  updateTabMetadata: (id: string, metadata: { title?: string; favicon?: string | null }) => void;
  printPage: () => void;
  savePage: () => void;
  openFile: () => void;
  openViewSource: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleFullScreen: () => void;
  scrollPage: (command: ScrollPageCommand) => void;
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
const MAX_RECENTLY_CLOSED_TABS = 25;
const REOPEN_CLOSED_TAB_DEDUPE_WINDOW_MS = 400;
const REOPEN_CLOSED_TAB_ACTIVATE_DELAY_MS = 120;
const IPC_OPEN_TAB_ACTIVATE_DELAY_MS = 110;
const IPC_OPEN_TAB_NAVIGATE_DELAY_MS = 50;
const ZOOM_STEP = 0.1;
const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 5;

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

    const activeIdRaw =
      typeof parsed.activeId === 'string' ? parsed.activeId : restorableTabs[0].id;
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
  const [isBootstrapReady, setIsBootstrapReady] = useState(false);
  const [findInPageMatchesByTab, setFindInPageMatchesByTab] = useState<
    Record<string, FindInPageMatchState>
  >({});

  const webviewMap = useRef<Record<string, WebviewElement>>({});
  const hydratedRef = useRef(false);
  const recentIpcTabOpenRef = useRef<{ url: string; openedAt: number } | null>(null);
  const didConsumeIncomingUrlsRef = useRef(false);
  const startupIncomingUrlsRef = useRef<string[]>([]);
  const tabsRef = useRef<Tab[]>([initialTabRef.current]);
  const activeIdRef = useRef(initialTabRef.current.id);
  const lastFindQueryByTabRef = useRef<Record<string, string>>({});
  const activeFindRequestIdByTabRef = useRef<Record<string, number>>({});
  const navigateRef = useRef<(url: string, tabId?: string) => void>(() => undefined);
  const newTabRef = useRef<(url?: string) => void>(() => undefined);
  const tabSleepTimerRef = useRef<number | null>(null);
  const recentlyClosedTabsRef = useRef<Tab[]>([]);
  const lastReopenClosedTabAtRef = useRef(0);
  const reopenTabActivationTimerRef = useRef<number | null>(null);
  const ipcOpenTabActivateTimerRef = useRef<number | null>(null);
  const ipcOpenTabNavigateTimerRef = useRef<number | null>(null);
  const zoomFactorByTabRef = useRef<Record<string, number>>({});
  const activeFindInPageMatches = findInPageMatchesByTab[activeId] ?? {
    activeMatchOrdinal: 0,
    matches: 0,
  };
  const applyRestoredSnapshot = useCallback(
    (snapshot: SessionSnapshot, options?: ApplyRestoredSnapshotOptions) => {
      if (!snapshot.tabs.length) return;

      const now = Date.now();
      const restoredTabs = snapshot.tabs.map((tab) =>
        tab.id === snapshot.activeId ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
      );

      if (options?.stageOnNewTab) {
        const stagingTab = createInitialTab(getBrowserSettings().newTabPage);
        setTabs([stagingTab, ...restoredTabs]);
        setActiveId(stagingTab.id);
      } else {
        setTabs(restoredTabs);
        setActiveId(snapshot.activeId);
      }

      setPendingSession(null);
      setRestoreTabCountState(0);
      setRestorePromptOpen(false);
      setRestoreWindowCount(1);
    },
    [],
  );

  const clearFindInPageMatchesForTab = useCallback((tabId: string) => {
    setFindInPageMatchesByTab((current) => {
      if (!(tabId in current)) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }, []);

  const updateFindInPageMatches = useCallback(
    (tabId: string, requestId: number, activeMatchOrdinal: number, matches: number) => {
      const activeRequestId = activeFindRequestIdByTabRef.current[tabId];
      if (typeof activeRequestId === 'number' && requestId !== activeRequestId) {
        return;
      }

      const nextActiveMatchOrdinal =
        Number.isFinite(activeMatchOrdinal) && activeMatchOrdinal > 0
          ? Math.floor(activeMatchOrdinal)
          : 0;
      const nextMatches = Number.isFinite(matches) && matches > 0 ? Math.floor(matches) : 0;

      setFindInPageMatchesByTab((current) => {
        const existing = current[tabId];
        if (
          existing &&
          existing.activeMatchOrdinal === nextActiveMatchOrdinal &&
          existing.matches === nextMatches
        ) {
          return current;
        }
        return {
          ...current,
          [tabId]: {
            activeMatchOrdinal: nextActiveMatchOrdinal,
            matches: nextMatches,
          },
        };
      });
    },
    [],
  );

  const persistSession = (nextTabs: Tab[], nextActiveId: string) => {
    const restorableTabs = filterRestorableTabs(nextTabs);
    const hasExplicitActiveId = restorableTabs.some((tab) => tab.id === nextActiveId);
    const fallbackActiveId =
      restorableTabs.length > 0
        ? restorableTabs.reduce(
            (candidate, tab) => (tab.lastActiveAt > candidate.lastActiveAt ? tab : candidate),
            restorableTabs[0],
          ).id
        : undefined;
    const safeActiveId = hasExplicitActiveId ? nextActiveId : fallbackActiveId;

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
      startupIncomingUrlsRef.current = [];
      const settings = getBrowserSettings();
      const restoreBehavior: StartupRestoreBehavior = settings.startupRestoreBehavior;
      const currentDefaultTabUrl = getBrowserSettings().newTabPage;
      const snapshot = parseSnapshot(
        localStorage.getItem(SESSION_STORAGE_KEY),
        currentDefaultTabUrl,
      );
      if (snapshot && !isDefaultSnapshot(snapshot, currentDefaultTabUrl)) {
        if (restoreBehavior === 'ask') {
          setPendingSession(snapshot);
          setRestoreTabCountState(snapshot.tabs.length);
          setRestorePromptOpen(true);
        } else if (restoreBehavior === 'fresh') {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } else {
          applyRestoredSnapshot(snapshot, { stageOnNewTab: true });
        }
      }
      hydratedRef.current = true;
      setIsBootstrapReady(true);
      return;
    }

    let cancelled = false;
    const bootstrapSessionRestore = async () => {
      try {
        const [queuedUrlsRaw, initialWindowUrlRaw] = await Promise.all([
          ipc
            .invoke<string[]>('incoming-urls-consume')
            .then((urls) =>
              Array.isArray(urls)
                ? urls
                    .filter((candidate): candidate is string => typeof candidate === 'string')
                    .map((candidate) => candidate.trim())
                    .filter(Boolean)
                : [],
            )
            .catch(() => []),
          ipc
            .invoke<string>('window-consume-initial-url')
            .then((url) => (typeof url === 'string' ? url.trim() : ''))
            .catch(() => ''),
        ]);
        if (cancelled) return;
        const queuedUrls = initialWindowUrlRaw
          ? [initialWindowUrlRaw, ...queuedUrlsRaw]
          : queuedUrlsRaw;
        startupIncomingUrlsRef.current = queuedUrls;

        const windowRestore = await ipc.invoke<SessionSnapshot | null>(
          'session-take-window-restore',
        );
        if (cancelled) return;

        if (windowRestore && windowRestore.tabs.length > 0) {
          applyRestoredSnapshot(windowRestore, { stageOnNewTab: true });
          return;
        }

        const restoreState = await ipc.invoke<SessionRestoreState>('session-get-restore-state');
        if (cancelled) return;

        if (restoreState?.hasPendingRestore && startupIncomingUrlsRef.current.length === 0) {
          const restoreBehavior: StartupRestoreBehavior =
            getBrowserSettings().startupRestoreBehavior;
          if (restoreBehavior === 'ask') {
            setRestorePromptOpen(true);
            setRestoreTabCountState(Math.max(restoreState.tabCount || 0, 0));
            setRestoreWindowCount(Math.max(restoreState.windowCount || 1, 1));
          } else if (restoreBehavior === 'fresh') {
            await ipc.invoke('session-discard-restore').catch(() => undefined);
          } else {
            const mode: SessionRestoreMode = restoreBehavior === 'windows' ? 'windows' : 'tabs';
            const snapshot = await ipc
              .invoke<SessionSnapshot | null>('session-accept-restore', mode)
              .catch(() => null);
            if (cancelled || !snapshot) return;
            applyRestoredSnapshot(snapshot, { stageOnNewTab: true });
          }
        }
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setIsBootstrapReady(true);
        }
      }
    };

    void bootstrapSessionRestore();
    return () => {
      cancelled = true;
    };
  }, [applyRestoredSnapshot]);

  const restorePreviousSession = (mode: SessionRestoreMode) => {
    const applyManualRestoreSnapshot = (snapshot: SessionSnapshot) => {
      applyRestoredSnapshot(snapshot, { stageOnNewTab: true });
      persistSession(snapshot.tabs, snapshot.activeId);
    };

    const ipc = electron?.ipcRenderer;
    if (ipc) {
      ipc
        .invoke<SessionSnapshot | null>('session-accept-restore', mode)
        .then((snapshot) => {
          if (!snapshot || !snapshot.tabs.length) {
            setRestorePromptOpen(false);
            return;
          }

          applyManualRestoreSnapshot(snapshot);
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

    applyManualRestoreSnapshot(pendingSession);
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

  const newTab = useCallback(
    (url?: string, options?: { activate?: boolean; activateDelayMs?: number }) => {
      const shouldActivate = options?.activate !== false;
      const activateDelayMsRaw = options?.activateDelayMs;
      const activateDelayMs =
        typeof activateDelayMsRaw === 'number' && Number.isFinite(activateDelayMsRaw)
          ? Math.max(0, Math.floor(activateDelayMsRaw))
          : 0;
      const defaultNewTabUrl = getBrowserSettings().newTabPage;
      const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : defaultNewTabUrl;
      const now = Date.now();
      const newEntry: Tab = {
        id: crypto.randomUUID(),
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
      if (shouldActivate) {
        if (activateDelayMs > 0) {
          window.setTimeout(() => {
            setActiveId(newEntry.id);
          }, activateDelayMs);
        } else {
          setActiveId(newEntry.id);
        }
      }
    },
    [activeId],
  );

  const newTabToRight = useCallback(
    (id: string, url?: string) => {
      if (!id) return;

      const defaultNewTabUrl = getBrowserSettings().newTabPage;
      const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : defaultNewTabUrl;
      const now = Date.now();
      const newEntry: Tab = {
        id: crypto.randomUUID(),
        url: targetUrl,
        title: targetUrl.startsWith('mira://') ? miraUrlToName(targetUrl) : targetUrl,
        favicon: targetUrl.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
        history: [targetUrl],
        historyIndex: 0,
        reloadToken: 0,
        isSleeping: false,
        lastActiveAt: now,
      };

      setTabs((currentTabs) => {
        const sourceIndex = currentTabs.findIndex((tab) => tab.id === id);
        if (sourceIndex === -1) return currentTabs;

        const nextTabs = currentTabs.map((tab) =>
          tab.id === activeId ? { ...tab, lastActiveAt: now } : tab,
        );
        nextTabs.splice(sourceIndex + 1, 0, newEntry);
        return nextTabs;
      });

      setActiveId(newEntry.id);
    },
    [activeId],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      if (!id) return;
      const tabToDuplicate = tabs.find((tab) => tab.id === id);
      if (!tabToDuplicate) return;

      const sourceUrl = tabToDuplicate.history[tabToDuplicate.historyIndex] ?? tabToDuplicate.url;
      newTabToRight(id, sourceUrl);
    },
    [tabs, newTabToRight],
  );

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

  const openDownloads = () => {
    const existingDownloadsTab = tabs.find(
      (tab) => tab.url.trim().toLowerCase() === 'mira://downloads',
    );
    if (existingDownloadsTab) {
      setActive(existingDownloadsTab.id);
      return;
    }

    const activeTab = tabs.find((tab) => tab.id === activeId);
    const newTabUrl = getBrowserSettings().newTabPage;
    const isNewTab = !!activeTab && isNewTabUrl(activeTab.url, newTabUrl);
    if (isNewTab && activeTab) {
      navigate('mira://downloads', activeTab.id);
      return;
    }

    newTab('mira://downloads');
  };

  const closeWindow = useCallback(() => {
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
  }, []);

  const clearTabRuntimeState = useCallback(
    (id: string) => {
      delete lastFindQueryByTabRef.current[id];
      delete activeFindRequestIdByTabRef.current[id];
      delete zoomFactorByTabRef.current[id];
      clearFindInPageMatchesForTab(id);
    },
    [clearFindInPageMatchesForTab],
  );

  const rememberRecentlyClosedTabs = useCallback((tabsToRemember: Tab[]) => {
    if (!tabsToRemember.length) return;

    const clonedTabs = tabsToRemember.map((tab) => ({
      ...tab,
      history: [...tab.history],
    }));
    recentlyClosedTabsRef.current = [...recentlyClosedTabsRef.current, ...clonedTabs].slice(
      -MAX_RECENTLY_CLOSED_TABS,
    );
  }, []);

  const closeTab = (id: string) => {
    const shouldCloseWindow = tabs.length === 1 && tabs[0]?.id === id;
    if (shouldCloseWindow) {
      closeWindow();
      return;
    }

    const tabToClose = tabs.find((tab) => tab.id === id);
    if (tabToClose) {
      rememberRecentlyClosedTabs([tabToClose]);
    }
    clearTabRuntimeState(id);

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

  const closeOtherTabs = useCallback(
    (id: string) => {
      if (!id) return;
      const tabToKeep = tabs.find((tab) => tab.id === id);
      if (!tabToKeep) return;

      const tabsToClose = tabs.filter((tab) => tab.id !== id);
      if (!tabsToClose.length) return;

      rememberRecentlyClosedTabs(tabsToClose);
      tabsToClose.forEach((tab) => {
        clearTabRuntimeState(tab.id);
      });

      const now = Date.now();
      setTabs([
        {
          ...tabToKeep,
          isSleeping: false,
          lastActiveAt: now,
        },
      ]);
      setActiveId(id);
    },
    [tabs, clearTabRuntimeState, rememberRecentlyClosedTabs],
  );

  const closeTabsToRight = useCallback(
    (id: string) => {
      if (!id) return;

      const currentIndex = tabs.findIndex((tab) => tab.id === id);
      if (currentIndex < 0) return;

      const tabsToClose = tabs.slice(currentIndex + 1);
      if (!tabsToClose.length) return;

      rememberRecentlyClosedTabs(tabsToClose);
      const tabsToCloseIds = new Set(tabsToClose.map((tab) => tab.id));
      tabsToClose.forEach((tab) => {
        clearTabRuntimeState(tab.id);
      });

      const activeTabWillClose = tabsToCloseIds.has(activeId);
      const now = Date.now();
      setTabs((currentTabs) => {
        const nextTabs = currentTabs.filter((tab) => !tabsToCloseIds.has(tab.id));
        if (!activeTabWillClose) return nextTabs;
        return nextTabs.map((tab) =>
          tab.id === id ? { ...tab, isSleeping: false, lastActiveAt: now } : tab,
        );
      });

      if (activeTabWillClose) {
        setActiveId(id);
      }
    },
    [tabs, activeId, clearTabRuntimeState, rememberRecentlyClosedTabs],
  );

  const reopenLastClosedTab = useCallback(() => {
    const now = Date.now();
    if (now - lastReopenClosedTabAtRef.current < REOPEN_CLOSED_TAB_DEDUPE_WINDOW_MS) {
      return;
    }
    lastReopenClosedTabAtRef.current = now;

    let lastClosedTab: Tab | null = null;
    while (recentlyClosedTabsRef.current.length > 0) {
      const candidate = recentlyClosedTabsRef.current[recentlyClosedTabsRef.current.length - 1];
      recentlyClosedTabsRef.current = recentlyClosedTabsRef.current.slice(0, -1);

      const candidateUrl = (candidate.history[candidate.historyIndex] ?? candidate.url).trim();
      if (!candidateUrl || candidateUrl.toLowerCase() === 'about:blank') {
        continue;
      }
      lastClosedTab = candidate;
      break;
    }

    if (!lastClosedTab) return;

    const normalizedHistory = lastClosedTab.history
      .map((entry) => entry.trim())
      .filter((entry) => !!entry && entry.toLowerCase() !== 'about:blank');
    const restoredUrl = (
      lastClosedTab.history[lastClosedTab.historyIndex] ?? lastClosedTab.url
    ).trim();
    const safeRestoredUrl =
      restoredUrl && restoredUrl.toLowerCase() !== 'about:blank'
        ? restoredUrl
        : getBrowserSettings().newTabPage;
    const nextHistory = normalizedHistory.length ? normalizedHistory : [safeRestoredUrl];
    const nextHistoryIndex = Math.max(
      0,
      Math.min(lastClosedTab.historyIndex, nextHistory.length - 1),
    );

    const reopenedTab: Tab = {
      ...lastClosedTab,
      id: crypto.randomUUID(),
      url: safeRestoredUrl,
      history: nextHistory,
      historyIndex: nextHistoryIndex,
      isSleeping: false,
      lastActiveAt: now,
    };

    setTabs((currentTabs) =>
      currentTabs
        .map((tab) => (tab.id === activeId ? { ...tab, lastActiveAt: now } : tab))
        .concat(reopenedTab),
    );
    if (reopenTabActivationTimerRef.current !== null) {
      window.clearTimeout(reopenTabActivationTimerRef.current);
      reopenTabActivationTimerRef.current = null;
    }

    const reopenedTabId = reopenedTab.id;
    reopenTabActivationTimerRef.current = window.setTimeout(() => {
      reopenTabActivationTimerRef.current = null;
      if (!tabsRef.current.some((tab) => tab.id === reopenedTabId)) {
        return;
      }
      setActiveId(reopenedTabId);
    }, REOPEN_CLOSED_TAB_ACTIVATE_DELAY_MS);
  }, [activeId]);

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

  const moveActiveTabBy = useCallback(
    (delta: -1 | 1) => {
      if (!tabs.length || !activeId) return;
      const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
      if (currentIndex < 0) return;
      const targetIndex = Math.max(0, Math.min(currentIndex + delta, tabs.length - 1));
      if (targetIndex === currentIndex) return;
      moveTabToIndex(activeId, targetIndex);
    },
    [tabs, activeId, moveTabToIndex],
  );

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
      clearTabRuntimeState(id);

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
    [tabs, activeId, clearTabRuntimeState],
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

  const navigate = useCallback(
    (url: string, tabId?: string) => {
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
            return tab;
          }

          const newHistory = tab.history.slice(0, tab.historyIndex + 1).concat(normalized);
          const defaultTitle = normalized.startsWith('mira://')
            ? miraUrlToName(normalized)
            : normalized;
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
    },
    [activeId],
  );

  const navigateToNewTabPage = useCallback(() => {
    navigate(getBrowserSettings().newTabPage);
  }, [navigate]);

  useEffect(() => {
    tabsRef.current = tabs;
    activeIdRef.current = activeId;
  }, [tabs, activeId]);

  useEffect(() => {
    if (!tabs.length) {
      const replacement = createInitialTab(getBrowserSettings().newTabPage);
      setTabs([replacement]);
      setActiveId(replacement.id);
      return;
    }

    const activeTabStillExists = tabs.some((tab) => tab.id === activeId);
    if (!activeTabStillExists) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    newTabRef.current = newTab;
  }, [newTab]);

  const goBack = () => {
    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== activeId) return tab;
        if (tab.historyIndex === 0) return tab;
        const newIdx = tab.historyIndex - 1;
        const nextUrl = tab.history[newIdx];
        const nextTitle = nextUrl.startsWith('mira://') ? miraUrlToName(nextUrl) : nextUrl;
        return {
          ...tab,
          url: nextUrl,
          title: nextTitle,
          favicon: nextUrl.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
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
        const nextUrl = tab.history[newIdx];
        const nextTitle = nextUrl.startsWith('mira://') ? miraUrlToName(nextUrl) : nextUrl;
        return {
          ...tab,
          url: nextUrl,
          title: nextTitle,
          favicon: nextUrl.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
          historyIndex: newIdx,
        };
      }),
    );
  };

  const reloadTab = useCallback((id: string) => {
    if (!id) return;

    const wv = webviewMap.current[id];
    if (wv && typeof wv.reload === 'function') {
      wv.reload();
      return;
    }

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === id ? { ...tab, isSleeping: false, reloadToken: tab.reloadToken + 1 } : tab,
      ),
    );
  }, []);

  const reload = useCallback(() => {
    reloadTab(activeId);
  }, [activeId, reloadTab]);

  const reloadIgnoringCache = useCallback(() => {
    const wv = webviewMap.current[activeId];
    if (wv && typeof wv.reloadIgnoringCache === 'function') {
      wv.reloadIgnoringCache();
      return;
    }
    reload();
  }, [activeId, reload]);

  const stopLoading = useCallback(() => {
    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.stop !== 'function') return;
    wv.stop();
  }, [activeId]);

  const searchInPage = useCallback(
    (query: string, options?: FindInPageOptions) => {
      const wv = webviewMap.current[activeId];
      if (!wv || typeof wv.findInPage !== 'function') return;

      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        if (typeof wv.stopFindInPage === 'function') {
          wv.stopFindInPage('clearSelection');
        }
        delete lastFindQueryByTabRef.current[activeId];
        delete activeFindRequestIdByTabRef.current[activeId];
        clearFindInPageMatchesForTab(activeId);
        return;
      }

      const previousQuery = lastFindQueryByTabRef.current[activeId];
      const isNewQuery = previousQuery !== normalizedQuery;
      if (isNewQuery) {
        clearFindInPageMatchesForTab(activeId);
        if (typeof wv.stopFindInPage === 'function') {
          wv.stopFindInPage('clearSelection');
        }
      }

      const requestId = wv.findInPage(normalizedQuery, {
        forward: options?.forward ?? true,
        findNext: options?.findNext ?? false,
        matchCase: options?.matchCase ?? false,
      });
      if (typeof requestId === 'number' && Number.isFinite(requestId)) {
        activeFindRequestIdByTabRef.current[activeId] = requestId;
      } else {
        delete activeFindRequestIdByTabRef.current[activeId];
      }
      lastFindQueryByTabRef.current[activeId] = normalizedQuery;
    },
    [activeId, clearFindInPageMatchesForTab],
  );

  const findInPageNext = useCallback(
    (forward = true) => {
      const query = lastFindQueryByTabRef.current[activeId];
      if (!query) return;

      searchInPage(query, {
        forward,
        findNext: true,
      });
    },
    [activeId, searchInPage],
  );

  const stopFindInPage = useCallback(() => {
    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.stopFindInPage !== 'function') return;
    wv.stopFindInPage('clearSelection');
    delete lastFindQueryByTabRef.current[activeId];
    delete activeFindRequestIdByTabRef.current[activeId];
    clearFindInPageMatchesForTab(activeId);
  }, [activeId, clearFindInPageMatchesForTab]);

  const toggleDevTools = () => {
    const wv = webviewMap.current[activeId];
    if (!wv) return;

    if (typeof wv.isDevToolsOpened === 'function' && wv.isDevToolsOpened()) {
      if (typeof wv.closeDevTools === 'function') {
        wv.closeDevTools();
      }
      return;
    }

    const devToolsOpenMode = getBrowserSettings().devToolsOpenMode;
    if (devToolsOpenMode === 'side') {
      const ipc = electron?.ipcRenderer;
      if (ipc && typeof wv.getWebContentsId === 'function') {
        const webContentsId = wv.getWebContentsId();
        if (typeof webContentsId === 'number' && Number.isFinite(webContentsId)) {
          void ipc
            .invoke<boolean>('webview-open-devtools', {
              webContentsId,
              mode: 'right',
            })
            .then((opened) => {
              if (!opened && typeof wv.openDevTools === 'function') {
                wv.openDevTools();
              }
            })
            .catch(() => {
              if (typeof wv.openDevTools === 'function') {
                wv.openDevTools();
              }
            });
          return;
        }
      }
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

  const savePage = useCallback(() => {
    const activeTab = tabs.find((tab) => tab.id === activeId);
    if (!activeTab || activeTab.url.startsWith('mira://')) return;

    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.getWebContentsId !== 'function') return;
    const webContentsId = wv.getWebContentsId();
    if (typeof webContentsId !== 'number' || !Number.isFinite(webContentsId)) return;

    electron?.ipcRenderer
      ?.invoke('webview-context-action', {
        webContentsId,
        action: 'save-page-as',
      })
      .catch(() => undefined);
  }, [tabs, activeId]);

  const openFile = useCallback(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    ipc
      .invoke<string>('dialog-open-file-url')
      .then((fileUrl) => {
        if (typeof fileUrl !== 'string') return;
        const normalized = fileUrl.trim();
        if (!normalized) return;
        navigate(normalized);
      })
      .catch(() => undefined);
  }, [navigate]);

  const openViewSource = useCallback(() => {
    const activeTab = tabs.find((tab) => tab.id === activeId);
    if (!activeTab) return;

    const sourceUrl = activeTab.url.trim();
    if (!sourceUrl || sourceUrl.startsWith('mira://')) return;

    newTab(`view-source:${sourceUrl}`);
  }, [tabs, activeId, newTab]);

  const applyZoomFactor = useCallback(
    (nextFactor: number) => {
      const wv = webviewMap.current[activeId];
      if (!wv || typeof wv.setZoomFactor !== 'function') return;

      const bounded = Math.max(MIN_ZOOM_FACTOR, Math.min(nextFactor, MAX_ZOOM_FACTOR));
      wv.setZoomFactor(bounded);
      zoomFactorByTabRef.current[activeId] = bounded;
    },
    [activeId],
  );

  const withCurrentZoomFactor = useCallback(
    (onRead: (factor: number) => void) => {
      const fallback = zoomFactorByTabRef.current[activeId] ?? 1;
      const wv = webviewMap.current[activeId];
      if (!wv || typeof wv.getZoomFactor !== 'function') {
        onRead(fallback);
        return;
      }

      try {
        wv.getZoomFactor((rawFactor) => {
          const normalized =
            typeof rawFactor === 'number' && Number.isFinite(rawFactor) && rawFactor > 0
              ? rawFactor
              : fallback;
          onRead(normalized);
        });
      } catch {
        onRead(fallback);
      }
    },
    [activeId],
  );

  const zoomIn = useCallback(() => {
    withCurrentZoomFactor((factor) => {
      applyZoomFactor(factor + ZOOM_STEP);
    });
  }, [applyZoomFactor, withCurrentZoomFactor]);

  const zoomOut = useCallback(() => {
    withCurrentZoomFactor((factor) => {
      applyZoomFactor(factor - ZOOM_STEP);
    });
  }, [applyZoomFactor, withCurrentZoomFactor]);

  const resetZoom = useCallback(() => {
    applyZoomFactor(1);
  }, [applyZoomFactor]);

  const toggleFullScreen = useCallback(() => {
    const ipc = electron?.ipcRenderer;
    if (ipc) {
      ipc.invoke('window-fullscreen-toggle').catch(() => undefined);
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  const scrollPage = useCallback(
    (command: ScrollPageCommand) => {
      const wv = webviewMap.current[activeId];
      if (wv && typeof wv.executeJavaScript === 'function') {
        const script = `(() => {
  const command = ${JSON.stringify(command)};
  const pageStep = Math.max(window.innerHeight * 0.9, 120);
  switch (command) {
    case 'page-down':
      window.scrollBy({ top: pageStep, left: 0, behavior: 'auto' });
      break;
    case 'page-up':
      window.scrollBy({ top: -pageStep, left: 0, behavior: 'auto' });
      break;
    case 'top':
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      break;
    case 'bottom':
      window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'auto' });
      break;
    default:
      break;
  }
})();`;
        wv.executeJavaScript(script).catch(() => undefined);
        return;
      }

      const pageStep = Math.max(window.innerHeight * 0.9, 120);
      if (command === 'page-down') {
        window.scrollBy({ top: pageStep, left: 0, behavior: 'auto' });
        return;
      }
      if (command === 'page-up') {
        window.scrollBy({ top: -pageStep, left: 0, behavior: 'auto' });
        return;
      }
      if (command === 'top') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        return;
      }
      if (command === 'bottom') {
        window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'auto' });
      }
    },
    [activeId],
  );

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
      const activeTab = tabsRef.current.find((tab) => tab.id === activeIdRef.current);
      if (activeTab && isNewTabUrl(activeTab.url, getBrowserSettings().newTabPage)) {
        navigateRef.current(normalized, activeTab.id);
        return;
      }

      if (ipcOpenTabActivateTimerRef.current !== null) {
        window.clearTimeout(ipcOpenTabActivateTimerRef.current);
        ipcOpenTabActivateTimerRef.current = null;
      }
      if (ipcOpenTabNavigateTimerRef.current !== null) {
        window.clearTimeout(ipcOpenTabNavigateTimerRef.current);
        ipcOpenTabNavigateTimerRef.current = null;
      }

      const defaultNewTabUrl = getBrowserSettings().newTabPage;
      const nowForTab = Date.now();
      const stagedTabId = crypto.randomUUID();
      const stagedTab: Tab = {
        id: stagedTabId,
        url: defaultNewTabUrl,
        title: defaultNewTabUrl.startsWith('mira://') ? miraUrlToName(defaultNewTabUrl) : defaultNewTabUrl,
        favicon: defaultNewTabUrl.startsWith('mira://') ? INTERNAL_FAVICON_URL : undefined,
        history: [defaultNewTabUrl],
        historyIndex: 0,
        reloadToken: 0,
        isSleeping: false,
        lastActiveAt: nowForTab,
      };
      setTabs((currentTabs) =>
        currentTabs
          .map((tab) => (tab.id === activeIdRef.current ? { ...tab, lastActiveAt: nowForTab } : tab))
          .concat(stagedTab),
      );

      ipcOpenTabActivateTimerRef.current = window.setTimeout(() => {
        ipcOpenTabActivateTimerRef.current = null;
        if (!tabsRef.current.some((tab) => tab.id === stagedTabId)) return;
        setActiveId(stagedTabId);

        ipcOpenTabNavigateTimerRef.current = window.setTimeout(() => {
          ipcOpenTabNavigateTimerRef.current = null;
          navigateRef.current(normalized, stagedTabId);
        }, IPC_OPEN_TAB_NAVIGATE_DELAY_MS);
      }, IPC_OPEN_TAB_ACTIVATE_DELAY_MS);
    };

    ipc.on('open-url-in-new-tab', onOpenUrlInNewTab);

    if (!didConsumeIncomingUrlsRef.current && isBootstrapReady) {
      didConsumeIncomingUrlsRef.current = true;
      const incomingUrls = startupIncomingUrlsRef.current;
      startupIncomingUrlsRef.current = [];
      if (incomingUrls.length > 0) {
        navigateRef.current(incomingUrls[0], activeIdRef.current);
        incomingUrls.slice(1).forEach((incomingUrl) => {
          newTabRef.current(incomingUrl);
        });
      }
    }

    return () => ipc.off('open-url-in-new-tab', onOpenUrlInNewTab);
  }, [isBootstrapReady]);

  useEffect(
    () => () => {
      if (reopenTabActivationTimerRef.current !== null) {
        window.clearTimeout(reopenTabActivationTimerRef.current);
        reopenTabActivationTimerRef.current = null;
      }
      if (ipcOpenTabActivateTimerRef.current !== null) {
        window.clearTimeout(ipcOpenTabActivateTimerRef.current);
        ipcOpenTabActivateTimerRef.current = null;
      }
      if (ipcOpenTabNavigateTimerRef.current !== null) {
        window.clearTimeout(ipcOpenTabNavigateTimerRef.current);
        ipcOpenTabNavigateTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onOpenUrlInCurrentTab = (_event: unknown, url: string) => {
      if (typeof url !== 'string') return;
      const normalized = url.trim();
      if (!normalized) return;
      navigateRef.current(normalized);
    };

    ipc.on('open-url-in-current-tab', onOpenUrlInCurrentTab);
    return () => ipc.off('open-url-in-current-tab', onOpenUrlInCurrentTab);
  }, []);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeId,
        newTab,
        newTabToRight,
        reloadTab,
        duplicateTab,
        reopenLastClosedTab,
        openHistory,
        openDownloads,
        closeWindow,
        closeTab,
        closeOtherTabs,
        closeTabsToRight,
        moveTab,
        moveTabToIndex,
        moveActiveTabBy,
        moveTabToNewWindow,
        navigate,
        navigateToNewTabPage,
        goBack,
        goForward,
        reload,
        reloadIgnoringCache,
        stopLoading,
        searchInPage,
        findInPageNext,
        stopFindInPage,
        findInPageActiveMatchOrdinal: activeFindInPageMatches.activeMatchOrdinal,
        findInPageMatches: activeFindInPageMatches.matches,
        updateFindInPageMatches,
        toggleDevTools,
        updateTabMetadata,
        printPage,
        savePage,
        openFile,
        openViewSource,
        zoomIn,
        zoomOut,
        resetZoom,
        toggleFullScreen,
        scrollPage,
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
