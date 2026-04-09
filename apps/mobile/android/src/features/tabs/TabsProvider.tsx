import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
}

interface TabsContextType {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (url: string, title?: string) => Promise<void>;
  removeTab: (id: string) => Promise<void>;
  updateTab: (id: string, updates: Partial<Tab>) => Promise<void>;
  setActiveTab: (id: string) => Promise<void>;
  loadTabs: () => Promise<void>;
  closeTabs: () => Promise<void>;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const loadTabs = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('tabs');
      if (stored) {
        const parsedTabs = JSON.parse(stored);
        setTabs(parsedTabs);
        const active = parsedTabs.find((t: Tab) => t.isActive);
        setActiveTabId(active?.id || null);
      }
    } catch (error) {
      console.error('Failed to load tabs:', error);
    }
  }, []);

  const saveTabs = useCallback(async (newTabs: Tab[], activeId: string | null) => {
    try {
      const tabsToSave = newTabs.map((t) => ({
        ...t,
        isActive: t.id === activeId,
      }));
      await AsyncStorage.setItem('tabs', JSON.stringify(tabsToSave));
      setTabs(tabsToSave);
      setActiveTabId(activeId);
    } catch (error) {
      console.error('Failed to save tabs:', error);
    }
  }, []);

  const addTab = useCallback(
    async (url: string, title?: string) => {
      const newTab: Tab = {
        id: Date.now().toString(),
        url,
        title: title || url,
        isActive: true,
      };
      const updated = [...tabs.map((t) => ({ ...t, isActive: false })), newTab];
      await saveTabs(updated, newTab.id);
    },
    [tabs, saveTabs]
  );

  const removeTab = useCallback(
    async (id: string) => {
      const updated = tabs.filter((t) => t.id !== id);
      let newActiveId = activeTabId;
      if (activeTabId === id) {
        newActiveId = updated.length > 0 ? updated[updated.length - 1].id : null;
      }
      await saveTabs(updated, newActiveId);
    },
    [tabs, activeTabId, saveTabs]
  );

  const updateTab = useCallback(
    async (id: string, updates: Partial<Tab>) => {
      const updated = tabs.map((t) => (t.id === id ? { ...t, ...updates } : t));
      await saveTabs(updated, activeTabId);
    },
    [tabs, activeTabId, saveTabs]
  );

  const setActiveTab = useCallback(
    async (id: string) => {
      const updated = tabs.map((t) => ({
        ...t,
        isActive: t.id === id,
      }));
      await saveTabs(updated, id);
    },
    [tabs, saveTabs]
  );

  const closeTabs = useCallback(async () => {
    await AsyncStorage.removeItem('tabs');
    setTabs([]);
    setActiveTabId(null);
  }, []);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTabId,
        addTab,
        removeTab,
        updateTab,
        setActiveTab,
        loadTabs,
        closeTabs,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
};

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within TabsProvider');
  }
  return context;
};
