// src/hooks/useKeyboardShortcuts.ts
import { useEffect, type RefObject } from 'react';

interface UseKeyboardShortcutsProps {
  newTab: () => void;
  closeTab: (id: string) => void;
  activeId: string | null;
  addressInputRef: RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  newTab,
  closeTab,
  activeId,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
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
    };

    // Use capture phase (true) to intercept events before they reach the iframe
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [newTab, closeTab, activeId, addressInputRef]);
}
