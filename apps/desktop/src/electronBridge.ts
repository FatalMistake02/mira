interface RendererIpcBridge {
  on: <TArgs extends unknown[]>(channel: string, listener: (...args: TArgs) => void) => void;
  off: <TArgs extends unknown[]>(channel: string, listener: (...args: TArgs) => void) => void;
  invoke: <TResult = unknown>(channel: string, ...args: unknown[]) => Promise<TResult>;
}

interface ElectronBridge {
  platform: string;
  isMacOS: boolean;
  ipcRenderer: RendererIpcBridge;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

/**
 * Typed access point for the preload bridge injected by Electron.
 */
export const electron = window.electron;
