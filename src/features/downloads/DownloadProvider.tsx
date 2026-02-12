import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { electron } from '../../electronBridge';               // <-- NEW
type IpcRendererEvent = any;
import type { DownloadItem } from './types';                    // <-- NEW

// ---------- payload interfaces (unchanged) ----------
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

// ---------- reducer (unchanged) ----------
type State = DownloadItem[];
type Action =
  | { type: 'ADD'; payload: DownloadItem }
  | { type: 'PROGRESS'; payload: { id: string; receivedBytes: number; totalBytes: number } }
  | { type: 'DONE'; payload: { id: string; savePath: string } }
  | { type: 'ERROR'; payload: { id: string; error: string } }
  | { type: 'CANCEL'; payload: { id: string } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return [...state, action.payload];
    case 'PROGRESS':
      return state.map(d =>
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
      return state.map(d =>
        d.id === action.payload.id
          ? { ...d, status: 'completed', savePath: action.payload.savePath, endedAt: Date.now() }
          : d,
      );
    case 'ERROR':
      return state.map(d =>
        d.id === action.payload.id
          ? { ...d, status: 'error', error: action.payload.error, endedAt: Date.now() }
          : d,
      );
    case 'CANCEL':
      return state.map(d =>
        d.id === action.payload.id ? { ...d, status: 'canceled', endedAt: Date.now() } : d,
      );
    default:
      return state;
  }
}

// ---------- context ----------
const DownloadContext = createContext<{
  downloads: DownloadItem[];
  cancel: (id: string) => void;
  openFolder: (path: string) => void;
} | null>(null);

export const useDownloads = () => {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloads must be used within DownloadProvider');
  return ctx;
};

// ---------- provider ----------
export default function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, dispatch] = useReducer(reducer, []);

  // ---- IPC listeners -------------------------------------------------------
  useEffect(() => {
    // Defensive guard – the bridge may be missing in a non‑Electron preview
    if (!electron?.ipcRenderer) {
      console.warn('⚠️ electron ipcRenderer bridge not available');
      return;
    }

    const { ipcRenderer } = electron;

    const onStart = (_: IpcRendererEvent, data: DownloadStartPayload) => {
      const item: DownloadItem = {
        ...data,
        receivedBytes: 0,
        status: 'pending',
        startedAt: Date.now(),
        // optional fields start undefined
        endedAt: undefined,
        savePath: undefined,
        error: undefined,
      };
      dispatch({ type: 'ADD', payload: item });
    };

    const onProg = (_: IpcRendererEvent, data: DownloadProgressPayload) => {
      dispatch({ type: 'PROGRESS', payload: data });
    };

    const onDone = (_: IpcRendererEvent, data: DownloadDonePayload) => {
      dispatch({ type: 'DONE', payload: data });
    };

    const onError = (_: IpcRendererEvent, data: DownloadErrorPayload) => {
      dispatch({ type: 'ERROR', payload: data });
    };

    ipcRenderer.on('download-start', onStart);
    ipcRenderer.on('download-progress', onProg);
    ipcRenderer.on('download-done', onDone);
    ipcRenderer.on('download-error', onError);

    return () => {
      ipcRenderer.removeListener('download-start', onStart);
      ipcRenderer.removeListener('download-progress', onProg);
      ipcRenderer.removeListener('download-done', onDone);
      ipcRenderer.removeListener('download-error', onError);
    };
  }, []);

  // ---- actions ------------------------------------------------------------
  const cancel = (id: string) => {
    electron?.ipcRenderer?.invoke('download-cancel', id);
    dispatch({ type: 'CANCEL', payload: { id } });
  };

  const openFolder = (savePath: string) => {
    electron?.ipcRenderer?.invoke('download-open', savePath);
  };

  return (
    <DownloadContext.Provider value={{ downloads, cancel, openFolder }}>
      {children}
    </DownloadContext.Provider>
  );
}
