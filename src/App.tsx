import { useRef } from 'react';
import { useTabs } from './features/tabs/TabsProvider';
import TabsProvider from './features/tabs/TabsProvider';
import TabBar from './features/tabs/TabBar';
import TabView from './features/tabs/TabView';
import AddressBar from './components/AddressBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import DownloadProvider from './features/downloads/DownloadProvider';

function Browser() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const { newTab, closeTab, activeId } = useTabs();

  useKeyboardShortcuts({ newTab, closeTab, activeId, addressInputRef });
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <TabBar />
      <AddressBar inputRef={addressInputRef} />
      <TabView />
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
