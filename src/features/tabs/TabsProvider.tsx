import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Tab } from './types';
import { addHistoryEntry } from '../history/clientHistory';
import { electron } from '../../electronBridge';
import { getBrowserSettings } from '../settings/browserSettings';

const SESSION_STORAGE_KEY = 'mira.session.tabs.v1';
const IPC_OPEN_TAB_DEDUPE_WINDOW_MS = 500;

type WebviewElement = {
  reload: () => void;
  findInPage: (text: string) => void;
} | null;

type SessionSnapshot = {
  tabs: Tab[];
  activeId: string;
  savedAt: number;
};

type TabsContextType = {
  tabs: Tab[];
  activeId: string;
  newTab: (url?: string) => void;
  closeTab: (id: string) => void;
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  findInPage: () => void;
  registerWebview: (id: string, el: WebviewElement) => void;
  setActive: (id: string) => void;
  restorePromptOpen: boolean;
  restoreTabCount: number;
  restorePreviousSession: () => void;
  discardPreviousSession: () => void;
};

const TabsContext = createContext<TabsContextType>(null!);
export const useTabs = () => useContext(TabsContext);

function createInitialTab(url: string): Tab {
  return {
    id: crypto.randomUUID(),
    url,
    history: [url],
    historyIndex: 0,
    reloadToken: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTab(value: unknown, defaultTabUrl: string): Tab | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : crypto.randomUUID();
  const url = typeof value.url === 'string' && value.url.trim() ? value.url : defaultTabUrl;
  const historyRaw = Array.isArray(value.history) ? value.history : [url];
  const history = historyRaw.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim());
  const normalizedHistory = history.length ? history : [url];
  const historyIndexRaw = typeof value.historyIndex === 'number' ? value.historyIndex : normalizedHistory.length - 1;
  const historyIndex = Math.min(Math.max(Math.floor(historyIndexRaw), 0), normalizedHistory.length - 1);
  const reloadToken = typeof value.reloadToken === 'number' && Number.isFinite(value.reloadToken) ? value.reloadToken : 0;

  return {
    id,
    url,
    history: normalizedHistory,
    historyIndex,
    reloadToken,
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
    if (!tabs.length) return null;

    const activeIdRaw = typeof parsed.activeId === 'string' ? parsed.activeId : tabs[0].id;
    const activeId = tabs.some((tab) => tab.id === activeIdRaw) ? activeIdRaw : tabs[0].id;

    return {
      tabs,
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
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionSnapshot | null>(null);

  const webviewMap = useRef<Record<string, WebviewElement>>({});
  const hydratedRef = useRef(false);
  const recentIpcTabOpenRef = useRef<{ url: string; openedAt: number } | null>(null);

  const persistSession = (nextTabs: Tab[], nextActiveId: string) => {
    try {
      const snapshot: SessionSnapshot = {
        tabs: nextTabs,
        activeId: nextActiveId,
        savedAt: Date.now(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures (quota/private mode).
    }
  };

  useEffect(() => {
    const currentDefaultTabUrl = getBrowserSettings().newTabPage;
    const snapshot = parseSnapshot(localStorage.getItem(SESSION_STORAGE_KEY), currentDefaultTabUrl);
    if (snapshot && !isDefaultSnapshot(snapshot, currentDefaultTabUrl)) {
      setPendingSession(snapshot);
      setRestorePromptOpen(true);
    }
    hydratedRef.current = true;
  }, []);

  const restorePreviousSession = () => {
    if (!pendingSession) {
      setRestorePromptOpen(false);
      return;
    }

    setTabs(pendingSession.tabs);
    setActiveId(pendingSession.activeId);
    setRestorePromptOpen(false);
    setPendingSession(null);
    persistSession(pendingSession.tabs, pendingSession.activeId);
  };

  const discardPreviousSession = () => {
    setRestorePromptOpen(false);
    setPendingSession(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    persistSession(tabs, activeId);
  };

  const registerWebview = (id: string, el: WebviewElement) => {
    if (el) {
      webviewMap.current[id] = el;
    } else {
      delete webviewMap.current[id];
    }
  };

  const newTab = useCallback((url?: string) => {
    const defaultNewTabUrl = getBrowserSettings().newTabPage;
    const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : defaultNewTabUrl;
    const id = crypto.randomUUID();
    const newEntry: Tab = {
      id,
      url: targetUrl,
      history: [targetUrl],
      historyIndex: 0,
      reloadToken: 0,
    };
    setTabs((t) => [...t, newEntry]);
    setActiveId(id);
  }, []);

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((tab) => tab.id !== id);
      if (id === activeId && next.length) setActiveId(next[0].id);
      return next;
    });
  };

  const navigate = (url: string) => {
    const normalized = url.trim();
    if (normalized && !normalized.startsWith('mira://')) {
      addHistoryEntry(normalized, normalized).catch(() => undefined);
    }

    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== activeId) return tab;

        const currentUrl = tab.history[tab.historyIndex];
        if (currentUrl === normalized) {
          return { ...tab, url: normalized };
        }

        const newHistory = tab.history.slice(0, tab.historyIndex + 1).concat(normalized);
        return {
          ...tab,
          url: normalized,
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
      t.map((tab) =>
        tab.id === activeId ? { ...tab, reloadToken: tab.reloadToken + 1 } : tab,
      ),
    );
  };

  const findInPage = () => {
    const wv = webviewMap.current[activeId];
    if (!wv || typeof wv.findInPage !== 'function') return;

    const query = window.prompt('Find in page');
    if (!query) return;
    wv.findInPage(query);
  };

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
        !!last &&
        last.url === normalized &&
        now - last.openedAt < IPC_OPEN_TAB_DEDUPE_WINDOW_MS;
      if (isDuplicate) return;

      recentIpcTabOpenRef.current = { url: normalized, openedAt: now };
      newTab(normalized);
    };

    ipc.on('open-url-in-new-tab', onOpenUrlInNewTab);
    return () => ipc.off('open-url-in-new-tab', onOpenUrlInNewTab);
  }, [newTab]);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeId,
        newTab,
        closeTab,
        navigate,
        goBack,
        goForward,
        reload,
        findInPage,
        registerWebview,
        setActive: setActiveId,
        restorePromptOpen,
        restoreTabCount: pendingSession?.tabs.length ?? 0,
        restorePreviousSession,
        discardPreviousSession,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
}
