import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadItem } from './types';

interface DownloadContextType {
  downloads: DownloadItem[];
  addDownload: (download: Omit<DownloadItem, 'id' | 'startedAt'>) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  updateDownload: (id: string, updates: Partial<DownloadItem>) => Promise<void>;
  loadDownloads: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  const loadDownloads = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('downloads');
      if (stored) {
        setDownloads(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  }, []);

  const saveDownloads = useCallback(async (newDownloads: DownloadItem[]) => {
    try {
      await AsyncStorage.setItem('downloads', JSON.stringify(newDownloads));
      setDownloads(newDownloads);
    } catch (error) {
      console.error('Failed to save downloads:', error);
    }
  }, []);

  const addDownload = useCallback(
    async (download: Omit<DownloadItem, 'id' | 'startedAt'>) => {
      const newDownload: DownloadItem = {
        ...download,
        id: Date.now().toString(),
        startedAt: Date.now(),
      };
      await saveDownloads([...downloads, newDownload]);
    },
    [downloads, saveDownloads]
  );

  const removeDownload = useCallback(
    async (id: string) => {
      const updated = downloads.filter((d) => d.id !== id);
      await saveDownloads(updated);
    },
    [downloads, saveDownloads]
  );

  const updateDownload = useCallback(
    async (id: string, updates: Partial<DownloadItem>) => {
      const updated = downloads.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      );
      await saveDownloads(updated);
    },
    [downloads, saveDownloads]
  );

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        addDownload,
        removeDownload,
        updateDownload,
        loadDownloads,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export const useDownloads = () => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within DownloadProvider');
  }
  return context;
};
