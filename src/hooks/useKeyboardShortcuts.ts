// src/hooks/useKeyboardShortcuts.ts
import { useEffect, type RefObject } from 'react';
import { electron } from '../electronBridge';

interface UseKeyboardShortcutsProps {
  newTab: () => void;
  closeTab: (id: string) => void;
  reload: () => void;
  findInPage: () => void;
  activeId: string | null;
  addressInputRef: RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  newTab,
  closeTab,
  reload,
  findInPage,
  activeId,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const hasElectronBridge = !!electron?.ipcRenderer;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        newTab();
        return;
      }

      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        e.stopPropagation();
        if (activeId) closeTab(activeId);
        return;
      }

      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        e.stopPropagation();
        addressInputRef.current?.focus();
        return;
      }

      if (!hasElectronBridge && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        e.stopPropagation();
        reload();
        return;
      }

      if (!hasElectronBridge && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        findInPage();
        return;
      }
    };

    // Use capture phase (true) to intercept events before they reach the iframe
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [newTab, closeTab, reload, findInPage, activeId, addressInputRef]);

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
      }
    };

    ipc.on('app-shortcut', onShortcut);
    return () => ipc.off('app-shortcut', onShortcut);
  }, [reload, findInPage]);
}
