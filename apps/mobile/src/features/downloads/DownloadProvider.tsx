import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getCachedJson, setCachedJson } from '../../storage/cacheStorage';
import type { DownloadItem } from './types';

const DOWNLOAD_STORAGE_KEY = 'mira.mobile.downloads.v1';

type DownloadContextType = {
  downloads: DownloadItem[];
  upsertDownload: (download: DownloadItem) => void;
  updateDownload: (id: string, patch: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
};

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

function loadDownloads(): DownloadItem[] {
  const parsed = getCachedJson<DownloadItem[]>(DOWNLOAD_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveDownloads(downloads: DownloadItem[]) {
  setCachedJson(DOWNLOAD_STORAGE_KEY, downloads);
}

export default function DownloadProvider({ children }: { children: ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => loadDownloads());

  const upsertDownload = (download: DownloadItem) => {
    setDownloads((previous) => {
      const existingIndex = previous.findIndex((item) => item.id === download.id);
      const next =
        existingIndex === -1
          ? [download, ...previous]
          : previous.map((item, index) => (index === existingIndex ? { ...item, ...download } : item));
      saveDownloads(next);
      return next;
    });
  };

  const updateDownload = (id: string, patch: Partial<DownloadItem>) => {
    setDownloads((previous) => {
      const next = previous.map((item) => (item.id === id ? { ...item, ...patch } : item));
      saveDownloads(next);
      return next;
    });
  };

  const removeDownload = (id: string) => {
    setDownloads((previous) => {
      const next = previous.filter((item) => item.id !== id);
      saveDownloads(next);
      return next;
    });
  };

  const clearDownloads = () => {
    setDownloads([]);
    saveDownloads([]);
  };

  const value = useMemo(
    () => ({
      downloads,
      upsertDownload,
      updateDownload,
      removeDownload,
      clearDownloads,
    }),
    [downloads],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownloads(): DownloadContextType {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within DownloadProvider');
  }
  return context;
}
