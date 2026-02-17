// src/hooks/useKeyboardShortcuts.ts
import { useEffect, useRef, type RefObject } from 'react';
import { electron } from '../electronBridge';

interface UseKeyboardShortcutsProps {
  newTab: (url?: string) => void;
  reopenLastClosedTab: () => void;
  openHistory: () => void;
  openDownloads: () => void;
  openNewWindow: () => void;
  closeTab: (id: string) => void;
  reload: () => void;
  findInPage: () => void;
  toggleDevTools: () => void;
  printPage: () => void;
  activeId: string | null;
  addressInputRef: RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  newTab,
  reopenLastClosedTab,
  openHistory,
  openDownloads,
  openNewWindow,
  closeTab,
  reload,
  findInPage,
  toggleDevTools,
  printPage,
  activeId,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  const lastReopenShortcutAtRef = useRef(0);

  useEffect(() => {
    const hasElectronBridge = !!electron?.ipcRenderer;
    const isMacOS = electron?.isMacOS ?? false;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditableTarget =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isAddressBarTarget = target === addressInputRef.current;
      if (isEditableTarget && !isAddressBarTarget) {
        return;
      }
      if (e.repeat) {
        return;
      }
      const isPrimaryModifier = isMacOS ? e.metaKey : e.ctrlKey;

      if (isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        newTab();
        return;
      }

      if (isPrimaryModifier && e.shiftKey && e.key.toLowerCase() === 't') {
        // In Electron, main process forwards this as `app-shortcut` to avoid
        // duplicate handling when webview/main content focus differs.
        if (hasElectronBridge) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        reopenLastClosedTab();
        return;
      }

      const historyKey = isMacOS ? e.key.toLowerCase() === 'y' : e.key.toLowerCase() === 'h';

      if (isPrimaryModifier && !e.shiftKey && historyKey) {
        e.preventDefault();
        e.stopPropagation();
        openHistory();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        e.stopPropagation();
        openDownloads();
        return;
      }


      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        e.stopPropagation();
        openNewWindow();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        e.stopPropagation();
        if (activeId) closeTab(activeId);
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        e.stopPropagation();
        addressInputRef.current?.focus();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        e.stopPropagation();
        reload();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        findInPage();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        e.stopPropagation();
        toggleDevTools();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
        printPage();
        return;
      }
    };

    // Use capture phase (true) to intercept events before they reach the iframe
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [newTab, reopenLastClosedTab, openHistory, openDownloads, openNewWindow, closeTab, reload, findInPage, toggleDevTools, printPage, activeId, addressInputRef]);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onShortcut = (_event: unknown, action: string) => {
      if (action === 'reload-tab') {
        reload();
        return;
      }
      if (action === 'find-in-page') {
        findInPage();
        return;
      }
      if (action === 'open-window') {
        openNewWindow();
        return;
      }
      if (action === 'open-downloads') {
        openDownloads();
        return;
      }
      if (action === 'reopen-closed-tab') {
        const now = Date.now();
        if (now - lastReopenShortcutAtRef.current < 150) {
          return;
        }
        lastReopenShortcutAtRef.current = now;
        reopenLastClosedTab();
        return;
      }
      if (action === 'toggle-devtools') {
        toggleDevTools();
        return;
      }
      if (action === 'print-page') {
        printPage();
      }
    };

    ipc.on('app-shortcut', onShortcut);
    return () => ipc.off('app-shortcut', onShortcut);
  }, [reload, findInPage, openDownloads, openNewWindow, reopenLastClosedTab, toggleDevTools, printPage]);
}
