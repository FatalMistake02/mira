// src/electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// ──────────────────────────────────────────────────────────────
// Helper: expose a safe subset of ipcRenderer to the renderer
// ──────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) =>
      ipcRenderer.on(channel, listener),
    off: (channel: string, listener: (...args: any[]) => void) =>
      ipcRenderer.removeListener(channel, listener),
    invoke: (channel: string, ...args: any[]) =>
      ipcRenderer.invoke(channel, ...args),
  },
});

/* ------------------------------------------------------------------
   If you need the absolute path to the preloaded file (e.g. for
   `win.loadFile` in main.ts when the app is packaged), you can
   expose it too, but **do not expose the whole `path` module**.
   ------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
contextBridge.exposeInMainWorld('preloadPath', { __dirname, __filename });