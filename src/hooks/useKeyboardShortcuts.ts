import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { electron } from '../electronBridge';

type ScrollPageCommand = 'page-down' | 'page-up' | 'top' | 'bottom';

interface UseKeyboardShortcutsProps {
  tabs: Array<{ id: string }>;
  newTab: (url?: string) => void;
  reopenLastClosedTab: () => void;
  openHistory: () => void;
  openDownloads: () => void;
  openNewWindow: () => void;
  closeWindow: () => void;
  closeTab: (id: string) => void;
  moveActiveTabBy: (delta: -1 | 1) => void;
  navigateToNewTabPage: () => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache: () => void;
  stopLoading: () => void;
  findInPage: () => void;
  findInPageNext: (forward?: boolean) => void;
  toggleDevTools: () => void;
  printPage: () => void;
  savePage: () => void;
  openFile: () => void;
  openViewSource: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleFullScreen: () => void;
  scrollPage: (command: ScrollPageCommand) => void;
  activeId: string | null;
  setActive: (id: string) => void;
  addressInputRef: RefObject<HTMLInputElement | null>;
}

export function useKeyboardShortcuts({
  tabs,
  newTab,
  reopenLastClosedTab,
  openHistory,
  openDownloads,
  openNewWindow,
  closeWindow,
  closeTab,
  moveActiveTabBy,
  navigateToNewTabPage,
  goBack,
  goForward,
  reload,
  reloadIgnoringCache,
  stopLoading,
  findInPage,
  findInPageNext,
  toggleDevTools,
  printPage,
  savePage,
  openFile,
  openViewSource,
  zoomIn,
  zoomOut,
  resetZoom,
  toggleFullScreen,
  scrollPage,
  activeId,
  setActive,
  addressInputRef,
}: UseKeyboardShortcutsProps) {
  const lastReopenShortcutAtRef = useRef(0);

  const activateRelativeTab = useCallback(
    (delta: 1 | -1) => {
      if (!tabs.length) return;
      const currentIndex = activeId ? tabs.findIndex((tab) => tab.id === activeId) : -1;
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeCurrentIndex + delta + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      setActive(nextTab.id);
    },
    [tabs, activeId, setActive],
  );

  const activateTabByNumber = useCallback(
    (number: number) => {
      if (!Number.isInteger(number) || number < 1 || number > 9) return;
      if (!tabs.length) return;
      const index = number === 9 ? tabs.length - 1 : number - 1;
      const nextTab = tabs[index];
      if (!nextTab) return;
      setActive(nextTab.id);
    },
    [tabs, setActive],
  );

  useEffect(() => {
    const hasElectronBridge = !!electron?.ipcRenderer;
    const isMacOS = electron?.isMacOS ?? false;

    const handler = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const tagName = (target?.tagName ?? '').toLowerCase();
      const isEditableTarget =
        tagName === 'input' || tagName === 'textarea' || target?.isContentEditable === true;
      const isAddressBarTarget = target === addressInputRef.current;
      if (isEditableTarget && !isAddressBarTarget) return;
      if (e.repeat) return;

      const isPrimaryModifier = isMacOS ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const isPageUp = key === 'pageup';
      const isPageDown = key === 'pagedown';
      const isSpace = e.key === ' ' || key === 'spacebar';

      if (isPrimaryModifier && !e.shiftKey && key === 't') {
        e.preventDefault();
        e.stopPropagation();
        newTab();
        return;
      }

      if (isPrimaryModifier && e.shiftKey && key === 't') {
        if (hasElectronBridge) return;
        e.preventDefault();
        e.stopPropagation();
        reopenLastClosedTab();
        return;
      }

      if (isPrimaryModifier && e.shiftKey && key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        closeWindow();
        return;
      }

      const historyKey = isMacOS ? key === 'y' : key === 'h';
      if (isPrimaryModifier && !e.shiftKey && historyKey) {
        e.preventDefault();
        e.stopPropagation();
        openHistory();
        return;
      }

      if (isPrimaryModifier && e.shiftKey && isPageUp) {
        e.preventDefault();
        e.stopPropagation();
        moveActiveTabBy(-1);
        return;
      }

      if (isPrimaryModifier && e.shiftKey && isPageDown) {
        e.preventDefault();
        e.stopPropagation();
        moveActiveTabBy(1);
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'tab') {
        e.preventDefault();
        e.stopPropagation();
        activateRelativeTab(1);
        return;
      }

      if (isPrimaryModifier && e.shiftKey && key === 'tab') {
        if (hasElectronBridge) return;
        e.preventDefault();
        e.stopPropagation();
        activateRelativeTab(-1);
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && /^[1-9]$/.test(key)) {
        e.preventDefault();
        e.stopPropagation();
        activateTabByNumber(Number.parseInt(key, 10));
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'j') {
        e.preventDefault();
        e.stopPropagation();
        openDownloads();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        openNewWindow();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        if (activeId) closeTab(activeId);
        return;
      }

      if (!isPrimaryModifier && e.altKey && !e.shiftKey && key === 'arrowleft') {
        e.preventDefault();
        e.stopPropagation();
        goBack();
        return;
      }

      if (!isPrimaryModifier && e.altKey && !e.shiftKey && key === 'arrowright') {
        e.preventDefault();
        e.stopPropagation();
        goForward();
        return;
      }

      if (!isPrimaryModifier && e.altKey && !e.shiftKey && key === 'home') {
        e.preventDefault();
        e.stopPropagation();
        navigateToNewTabPage();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 'l') {
        e.preventDefault();
        e.stopPropagation();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }

      if (!isPrimaryModifier && e.altKey && !e.shiftKey && key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }

      if (!isPrimaryModifier && !e.altKey && !e.shiftKey && key === 'f6') {
        e.preventDefault();
        e.stopPropagation();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'r') {
        e.preventDefault();
        e.stopPropagation();
        reload();
        return;
      }

      if (
        !hasElectronBridge &&
        ((isPrimaryModifier && e.shiftKey && key === 'r') ||
          (isPrimaryModifier && !e.shiftKey && key === 'f5'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        reloadIgnoringCache();
        return;
      }

      if (!hasElectronBridge && !isPrimaryModifier && !e.altKey && !e.shiftKey && key === 'f5') {
        e.preventDefault();
        e.stopPropagation();
        reload();
        return;
      }

      if (!isPrimaryModifier && !e.altKey && !e.shiftKey && key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        stopLoading();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        findInPage();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        findInPageNext(true);
        return;
      }

      if (isPrimaryModifier && e.shiftKey && key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        findInPageNext(false);
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        savePage();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 'o') {
        e.preventDefault();
        e.stopPropagation();
        openFile();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        openViewSource();
        return;
      }

      if (isPrimaryModifier && !e.altKey && (key === '+' || key === '=')) {
        e.preventDefault();
        e.stopPropagation();
        zoomIn();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && !e.altKey && key === '-') {
        e.preventDefault();
        e.stopPropagation();
        zoomOut();
        return;
      }

      if (isPrimaryModifier && !e.shiftKey && !e.altKey && key === '0') {
        e.preventDefault();
        e.stopPropagation();
        resetZoom();
        return;
      }

      if (!isPrimaryModifier && !e.altKey && !e.shiftKey && key === 'f11') {
        e.preventDefault();
        e.stopPropagation();
        toggleFullScreen();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && e.shiftKey && (key === 'i' || key === 'j')) {
        e.preventDefault();
        e.stopPropagation();
        toggleDevTools();
        return;
      }

      if (!hasElectronBridge && !isPrimaryModifier && !e.altKey && !e.shiftKey && key === 'f12') {
        e.preventDefault();
        e.stopPropagation();
        toggleDevTools();
        return;
      }

      if (!hasElectronBridge && isPrimaryModifier && !e.shiftKey && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        printPage();
        return;
      }

      if (!isPrimaryModifier && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if ((!e.shiftKey && isSpace) || isPageDown) {
          e.preventDefault();
          e.stopPropagation();
          scrollPage('page-down');
          return;
        }

        if ((e.shiftKey && isSpace) || isPageUp) {
          e.preventDefault();
          e.stopPropagation();
          scrollPage('page-up');
          return;
        }

        if (!e.shiftKey && key === 'home') {
          e.preventDefault();
          e.stopPropagation();
          scrollPage('top');
          return;
        }

        if (!e.shiftKey && key === 'end') {
          e.preventDefault();
          e.stopPropagation();
          scrollPage('bottom');
        }
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    tabs,
    newTab,
    reopenLastClosedTab,
    openHistory,
    openDownloads,
    openNewWindow,
    closeWindow,
    closeTab,
    moveActiveTabBy,
    navigateToNewTabPage,
    goBack,
    goForward,
    reload,
    reloadIgnoringCache,
    stopLoading,
    findInPage,
    findInPageNext,
    toggleDevTools,
    printPage,
    savePage,
    openFile,
    openViewSource,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleFullScreen,
    scrollPage,
    activeId,
    setActive,
    addressInputRef,
    activateRelativeTab,
    activateTabByNumber,
  ]);

  useEffect(() => {
    const ipc = electron?.ipcRenderer;
    if (!ipc) return;

    const onShortcut = (_event: unknown, action: string, payload?: unknown) => {
      if (action === 'reload-tab') {
        reload();
        return;
      }
      if (action === 'reload-tab-ignore-cache') {
        reloadIgnoringCache();
        return;
      }
      if (action === 'stop-loading') {
        stopLoading();
        return;
      }
      if (action === 'find-in-page') {
        findInPage();
        return;
      }
      if (action === 'find-next') {
        findInPageNext(true);
        return;
      }
      if (action === 'find-previous') {
        findInPageNext(false);
        return;
      }
      if (action === 'open-window') {
        openNewWindow();
        return;
      }
      if (action === 'close-window') {
        closeWindow();
        return;
      }
      if (action === 'open-downloads') {
        openDownloads();
        return;
      }
      if (action === 'go-back') {
        goBack();
        return;
      }
      if (action === 'go-forward') {
        goForward();
        return;
      }
      if (action === 'navigate-new-tab-page') {
        navigateToNewTabPage();
        return;
      }
      if (action === 'focus-address-bar') {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }
      if (action === 'activate-next-tab') {
        activateRelativeTab(1);
        return;
      }
      if (action === 'activate-previous-tab') {
        activateRelativeTab(-1);
        return;
      }
      if (action === 'activate-tab-index') {
        if (typeof payload !== 'number') return;
        activateTabByNumber(payload);
        return;
      }
      if (action === 'move-active-tab-left') {
        moveActiveTabBy(-1);
        return;
      }
      if (action === 'move-active-tab-right') {
        moveActiveTabBy(1);
        return;
      }
      if (action === 'reopen-closed-tab') {
        const now = Date.now();
        if (now - lastReopenShortcutAtRef.current < 150) return;
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
        return;
      }
      if (action === 'save-page') {
        savePage();
        return;
      }
      if (action === 'open-file') {
        openFile();
        return;
      }
      if (action === 'view-source') {
        openViewSource();
        return;
      }
      if (action === 'zoom-in') {
        zoomIn();
        return;
      }
      if (action === 'zoom-out') {
        zoomOut();
        return;
      }
      if (action === 'zoom-reset') {
        resetZoom();
        return;
      }
      if (action === 'toggle-fullscreen') {
        toggleFullScreen();
        return;
      }
      if (action === 'scroll-page') {
        if (payload === 'page-down' || payload === 'page-up' || payload === 'top' || payload === 'bottom') {
          scrollPage(payload);
        }
      }
    };

    ipc.on('app-shortcut', onShortcut);
    return () => ipc.off('app-shortcut', onShortcut);
  }, [
    reload,
    reloadIgnoringCache,
    stopLoading,
    findInPage,
    findInPageNext,
    openDownloads,
    openNewWindow,
    closeWindow,
    goBack,
    goForward,
    navigateToNewTabPage,
    reopenLastClosedTab,
    toggleDevTools,
    printPage,
    savePage,
    openFile,
    openViewSource,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleFullScreen,
    scrollPage,
    addressInputRef,
    activateRelativeTab,
    activateTabByNumber,
    moveActiveTabBy,
  ]);
}
