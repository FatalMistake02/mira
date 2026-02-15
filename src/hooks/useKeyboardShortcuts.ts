// src/hooks/useKeyboardShortcuts.ts
import { useEffect, type RefObject } from 'react';
import { electron } from '../electronBridge';

interface UseKeyboardShortcutsProps {
  newTab: (url?: string) => void;
  openHistory: () => void;
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
  openHistory,
  openNewWindow,
  closeTab,
  reload,
  findInPage,
  toggleDevTools,
  printPage,
  activeId,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const hasElectronBridge = !!electron?.ipcRenderer;
    const isMacOS = electron?.isMacOS ?? false;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const isPrimaryModifier = isMacOS ? e.metaKey : e.ctrlKey;

      if (isPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        newTab();
        return;
      }

      const historyKey = isMacOS ? e.key.toLowerCase() === 'y' : e.key.toLowerCase() === 'h';

      if (isPrimaryModifier && !e.shiftKey && historyKey) {
        e.preventDefault();
        e.stopPropagation();
        openHistory();
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
  }, [newTab, openHistory, openNewWindow, closeTab, reload, findInPage, toggleDevTools, printPage, activeId, addressInputRef]);

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
      if (action === 'toggle-devtools') {
        toggleDevTools();
      if (action === 'print-page') {
        printPage();
      }
    };

    ipc.on('app-shortcut', onShortcut);
    return () => ipc.off('app-shortcut', onShortcut);
  }, [reload, findInPage, openNewWindow, toggleDevTools, printPage]);
}
