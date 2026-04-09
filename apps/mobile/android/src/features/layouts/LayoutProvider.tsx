import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Layout {
  name: string;
  tabBarPosition: 'bottom' | 'top';
  addressBarPosition: 'top' | 'bottom';
  compactMode: boolean;
}

interface LayoutContextType {
  layout: Layout;
  updateLayout: (layout: Partial<Layout>) => Promise<void>;
  loadLayout: () => Promise<void>;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

const defaultLayout: Layout = {
  name: 'default_standard',
  tabBarPosition: 'bottom',
  addressBarPosition: 'top',
  compactMode: false,
};

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layout, setLayout] = useState<Layout>(defaultLayout);

  const loadLayout = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('layout');
      if (stored) {
        setLayout(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load layout:', error);
    }
  }, []);

  const updateLayout = useCallback(async (updates: Partial<Layout>) => {
    try {
      const newLayout = { ...layout, ...updates };
      await AsyncStorage.setItem('layout', JSON.stringify(newLayout));
      setLayout(newLayout);
    } catch (error) {
      console.error('Failed to update layout:', error);
    }
  }, [layout]);

  return (
    <LayoutContext.Provider value={{ layout, updateLayout, loadLayout }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return context;
};
