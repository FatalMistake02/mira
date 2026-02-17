import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabs } from './features/tabs/TabsProvider';
import TabsProvider from './features/tabs/TabsProvider';
import TabBar from './features/tabs/TabBar';
import TabView from './features/tabs/TabView';
import AddressBar from './components/AddressBar';
import FindBar from './components/FindBar';
import TopBar from './components/TopBar';
import RestoreTabsPrompt from './components/RestoreTabsPrompt';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import DownloadProvider from './features/downloads/DownloadProvider';
import { electron } from './electronBridge';
import {
  BROWSER_SETTINGS_CHANGED_EVENT,
  getBrowserSettings,
} from './features/settings/browserSettings';
import { applyTheme } from './features/themes/applyTheme';
import { getThemeById } from './features/themes/themeLoader';
import { applyLayout } from './features/layouts/applyLayout';
import { getLayoutById } from './features/layouts/layoutLoader';

function Browser() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const previousTabIdsRef = useRef<string[] | null>(null);
  const didRequestLaunchAutoUpdateRef = useRef(false);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findBarFocusToken, setFindBarFocusToken] = useState(0);
  const {
    tabs,
    newTab,
    reopenLastClosedTab,
    openHistory,
    openDownloads,
    closeTab,
    reload,
    setActive,
    toggleDevTools,
    printPage,
    activeId,
  } =
    useTabs();
  const openFindBar = useCallback(() => {
    setFindBarOpen(true);
    setFindBarFocusToken((token) => token + 1);
  }, []);
  const closeFindBar = useCallback(() => {
    setFindBarOpen(false);
  }, []);
  const openNewWindow = () => {
    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('window-new').catch(() => undefined);
      return;
    }
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  useKeyboardShortcuts({
    newTab,
    reopenLastClosedTab,
    openHistory,
    openDownloads,
    openNewWindow,
    closeTab,
    reload,
    findInPage: openFindBar,
    printPage,
    toggleDevTools,
    activeId,
    tabs,
    setActive,
    addressInputRef,
  });

  useEffect(() => {
    const applyRuntimeSettings = () => {
      const settings = getBrowserSettings();
      applyTheme(getThemeById(settings.themeId));
      applyLayout(getLayoutById(settings.layoutId));
      if (!electron?.ipcRenderer) return;

      const rootStyles = getComputedStyle(document.documentElement);
      const symbolColor = rootStyles.getPropertyValue('--text1').trim() || '#e8edf5';
      const overlayColor = rootStyles.getPropertyValue('--surfaceBg').trim() || '#1a2029';

      void Promise.allSettled([
        electron.ipcRenderer.invoke('settings-set-ad-block-enabled', settings.adBlockEnabled),
        electron.ipcRenderer.invoke(
          'settings-set-quit-on-last-window-close',
          settings.quitOnLastWindowClose,
        ),
        electron.ipcRenderer.invoke('settings-set-run-on-startup', settings.runOnStartup),
        electron.ipcRenderer.invoke('window-set-titlebar-symbol-color', {
          symbolColor,
          color: overlayColor,
        }),
      ]);
    };

    applyRuntimeSettings();

    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
  }, []);

  useEffect(() => {
    if (!electron?.ipcRenderer || didRequestLaunchAutoUpdateRef.current) return;

    const settings = getBrowserSettings();
    if (!settings.autoUpdateOnLaunch) return;

    didRequestLaunchAutoUpdateRef.current = true;
    void electron.ipcRenderer
      .invoke('updates-run-launch-auto', {
        includePrerelease: settings.includePrereleaseUpdates,
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const previousTabIds = previousTabIdsRef.current;
    const currentTabIds = tabs.map((tab) => tab.id);
    if (!previousTabIds) {
      previousTabIdsRef.current = currentTabIds;
      return;
    }

    const hasAddedTab = currentTabIds.length > previousTabIds.length;
    const activeTabIsNewlyCreated = !previousTabIds.includes(activeId);
    const activeTab = tabs.find((tab) => tab.id === activeId);
    const normalizedActiveUrl = activeTab?.url.trim().toLowerCase();
    const normalizedNewTabUrl = getBrowserSettings().newTabPage.trim().toLowerCase();
    const isNewTabUrl =
      normalizedActiveUrl === normalizedNewTabUrl || normalizedActiveUrl === 'mira://newtab';

    if (hasAddedTab && activeTabIsNewlyCreated && isNewTabUrl) {
      window.requestAnimationFrame(() => {
        const addressInput = addressInputRef.current;
        if (!addressInput) return;
        addressInput.focus();
        addressInput.select();
      });
    }

    previousTabIdsRef.current = currentTabIds;
  }, [tabs, activeId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <TopBar>
        <TabBar />
      </TopBar>
      <AddressBar inputRef={addressInputRef} />
      <FindBar open={findBarOpen} focusToken={findBarFocusToken} onClose={closeFindBar} />
      <TabView />
      <RestoreTabsPrompt />
    </div>
  );
}

export default function App() {
  return (
    <TabsProvider>
      <DownloadProvider>
        <Browser />
      </DownloadProvider>
    </TabsProvider>
  );
}
