import { useEffect, useRef } from 'react';
import { useTabs } from './features/tabs/TabsProvider';
import TabsProvider from './features/tabs/TabsProvider';
import TabBar from './features/tabs/TabBar';
import TabView from './features/tabs/TabView';
import AddressBar from './components/AddressBar';
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

function Browser() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const { newTab, openHistory, closeTab, reload, findInPage, toggleDevTools, activeId } = useTabs();
  const openNewWindow = () => {
    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('window-new').catch(() => undefined);
      return;
    }
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  useKeyboardShortcuts({
    newTab,
    openHistory,
    openNewWindow,
    closeTab,
    reload,
    findInPage,
    toggleDevTools,
    activeId,
    addressInputRef,
  });

  useEffect(() => {
    const applyRuntimeSettings = () => {
      const settings = getBrowserSettings();
      applyTheme(getThemeById(settings.themeId));
      electron?.ipcRenderer
        .invoke('settings-set-ad-block-enabled', settings.adBlockEnabled)
        .catch(() => undefined);
    };

    applyRuntimeSettings();

    window.addEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
    return () => window.removeEventListener(BROWSER_SETTINGS_CHANGED_EVENT, applyRuntimeSettings);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <TopBar>
        <TabBar />
      </TopBar>
      <AddressBar inputRef={addressInputRef} />
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
