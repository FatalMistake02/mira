// src/hooks/useKeyboardShortcuts.ts
import { useEffect, type RefObject } from 'react';
import { electron } from '../electronBridge';

interface UseKeyboardShortcutsProps {
  newTab: () => void;
  openNewWindow: () => void;
  closeTab: (id: string) => void;
  reload: () => void;
  findInPage: () => void;
  toggleDevTools: () => void;
  activeId: string | null;
  addressInputRef: RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  newTab,
  openNewWindow,
  closeTab,
  reload,
  findInPage,
  toggleDevTools,
  activeId,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const hasElectronBridge = !!electron?.ipcRenderer;
    const isMacOS =
      electron?.isMacOS ??
      ((
        (
          navigator as Navigator & { userAgentData?: { platform?: string } }
        ).userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        ''
      )
        .toLowerCase()
        .includes('mac'));
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
      }
    };

    // Use capture phase (true) to intercept events before they reach the iframe
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [newTab, openNewWindow, closeTab, reload, findInPage, toggleDevTools, activeId, addressInputRef]);

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
      }
    };

    ipc.on('app-shortcut', onShortcut);
    return () => ipc.off('app-shortcut', onShortcut);
  }, [reload, findInPage, openNewWindow, toggleDevTools]);
}
