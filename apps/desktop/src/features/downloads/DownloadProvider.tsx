import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { electron } from '../../electronBridge';
import type { DownloadItem } from './types';

type IpcRendererEvent = unknown;

interface DownloadStartPayload {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
}

interface DownloadProgressPayload {
  id: string;
  receivedBytes: number;
  totalBytes: number;
}

interface DownloadDonePayload {
  id: string;
  savePath: string;
}

interface DownloadErrorPayload {
  id: string;
  error: string;
}

type State = DownloadItem[];
type Action =
  | { type: 'ADD'; payload: DownloadItem }
  | { type: 'PROGRESS'; payload: { id: string; receivedBytes: number; totalBytes: number } }
  | { type: 'DONE'; payload: { id: string; savePath: string } }
  | { type: 'ERROR'; payload: { id: string; error: string } }
  | { type: 'CANCEL'; payload: { id: string } }
  | { type: 'CLEAR' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD': {
      const existingIdx = state.findIndex((d) => d.id === action.payload.id);
      if (existingIdx !== -1) {
        const next = [...state];
        next[existingIdx] = { ...next[existingIdx], ...action.payload };
        return next;
      }
      return [...state, action.payload];
    }
    case 'PROGRESS':
      return state.map((d) =>
        d.id === action.payload.id
          ? {
              ...d,
              receivedBytes: action.payload.receivedBytes,
              totalBytes: action.payload.totalBytes,
              status: 'in-progress',
            }
          : d,
      );
    case 'DONE':
      return state.map((d) =>
        d.id === action.payload.id
          ? { ...d, status: 'completed', savePath: action.payload.savePath, endedAt: Date.now() }
          : d,
      );
    case 'ERROR':
      return state.map((d) =>
        d.id === action.payload.id
          ? { ...d, status: 'error', error: action.payload.error, endedAt: Date.now() }
          : d,
      );
    case 'CANCEL':
      return state.map((d) =>
        d.id === action.payload.id ? { ...d, status: 'canceled', endedAt: Date.now() } : d,
      );
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

const DownloadContext = createContext<{
  downloads: DownloadItem[];
  cancel: (id: string) => void;
  clear: () => void;
  openFolder: (path: string) => void;
} | null>(null);

export const useDownloads = () => {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloads must be used within DownloadProvider');
  return ctx;
};

export default function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    if (!electron?.ipcRenderer) {
      console.warn('electron ipcRenderer bridge not available');
      return;
    }

    const { ipcRenderer } = electron;

    const onStart = (_: IpcRendererEvent, data: DownloadStartPayload) => {
      const item: DownloadItem = {
        ...data,
        receivedBytes: 0,
        status: 'pending',
        startedAt: Date.now(),
      };
      dispatch({ type: 'ADD', payload: item });
    };

    const onProgress = (_: IpcRendererEvent, data: DownloadProgressPayload) => {
      dispatch({ type: 'PROGRESS', payload: data });
    };

    const onDone = (_: IpcRendererEvent, data: DownloadDonePayload) => {
      dispatch({ type: 'DONE', payload: data });
    };

    const onError = (_: IpcRendererEvent, data: DownloadErrorPayload) => {
      dispatch({ type: 'ERROR', payload: data });
    };

    ipcRenderer.on('download-start', onStart);
    ipcRenderer.on('download-progress', onProgress);
    ipcRenderer.on('download-done', onDone);
    ipcRenderer.on('download-error', onError);

    return () => {
      ipcRenderer.off('download-start', onStart);
      ipcRenderer.off('download-progress', onProgress);
      ipcRenderer.off('download-done', onDone);
      ipcRenderer.off('download-error', onError);
    };
  }, []);

  const cancel = (id: string) => {
    electron?.ipcRenderer?.invoke('download-cancel', id);
    dispatch({ type: 'CANCEL', payload: { id } });
  };

  const clear = () => {
    for (const item of downloads) {
      if (item.status === 'pending' || item.status === 'in-progress') {
        electron?.ipcRenderer?.invoke('download-cancel', item.id).catch(() => undefined);
      }
    }
    dispatch({ type: 'CLEAR' });
  };

  const openFolder = (savePath: string) => {
    electron?.ipcRenderer?.invoke('download-open', savePath);
  };

  return (
    <DownloadContext.Provider value={{ downloads, cancel, clear, openFolder }}>
      {children}
    </DownloadContext.Provider>
  );
}
