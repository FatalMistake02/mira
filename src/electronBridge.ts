// ---------------------------------------------------------------
// This file lives in the **renderer** (React) source tree.
// It simply re‑exports the IPC helpers that the preload script
// attached to `window.electron`.  Using a separate module makes
// the import statements clean and avoids pulling the real `electron`
// package into the browser bundle.
// ---------------------------------------------------------------
export const electron = (window as any).electron as {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
};