import { createContext, useContext, useState, useRef } from 'react';
import type { Tab } from './types';

type WebviewElement = {
  reload: () => void;
} | null;

type TabsContextType = {
  tabs: Tab[];
  activeId: string;
  newTab: (url?: string) => void;
  closeTab: (id: string) => void;
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  registerWebview: (id: string, el: WebviewElement) => void;
  setActive: (id: string) => void;
};

const TabsContext = createContext<TabsContextType>(null!);
export const useTabs = () => useContext(TabsContext);

export default function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: crypto.randomUUID(),
      url: 'mira://NewTab',
      history: ['mira://NewTab'],
      historyIndex: 0,
    },
  ]);

  const [activeId, setActiveId] = useState(tabs[0].id);

  const webviewMap = useRef<Record<string, WebviewElement>>({});

  const registerWebview = (id: string, el: WebviewElement) => {
    if (el) {
      webviewMap.current[id] = el;
    } else {
      delete webviewMap.current[id];
    }
  };

  const newTab = (url = 'mira://NewTab') => {
    const id = crypto.randomUUID();
    const newEntry: Tab = {
      id,
      url,
      history: [url],
      historyIndex: 0,
    };
    setTabs((t) => [...t, newEntry]);
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((tab) => tab.id !== id);
      if (id === activeId && next.length) setActiveId(next[0].id);
      return next;
    });
  };

  const navigate = (url: string) => {
    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== activeId) return tab;

        const currentUrl = tab.history[tab.historyIndex];
        if (currentUrl === url) {
          return { ...tab, url };
        }

        const newHistory = tab.history.slice(0, tab.historyIndex + 1).concat(url);
        return {
          ...tab,
          url,
          history: newHistory,
          historyIndex: newHistory.length - 1,
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
    }
  };

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
        registerWebview,
        setActive: setActiveId,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
}
