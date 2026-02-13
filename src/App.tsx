import { useRef } from 'react';
import { useTabs } from './features/tabs/TabsProvider';
import TabsProvider from './features/tabs/TabsProvider';
import TabBar from './features/tabs/TabBar';
import TabView from './features/tabs/TabView';
import AddressBar from './components/AddressBar';
import RestoreTabsPrompt from './components/RestoreTabsPrompt';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import DownloadProvider from './features/downloads/DownloadProvider';

function Browser() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const { newTab, closeTab, reload, findInPage, activeId } = useTabs();

  useKeyboardShortcuts({ newTab, closeTab, reload, findInPage, activeId, addressInputRef });
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <TabBar />
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
