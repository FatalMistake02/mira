import React, { useEffect } from 'react';
import { useTabs } from '../features/tabs/TabsProvider';
import { useBookmarks } from '../features/bookmarks/BookmarksProvider';
import { useDownloads } from '../features/downloads/DownloadProvider';

/**
 * Initializer component that loads all persisted state on app startup
 */
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loadTabs } = useTabs();
  const { loadBookmarks } = useBookmarks();
  const { loadDownloads } = useDownloads();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await Promise.all([loadTabs(), loadBookmarks(), loadDownloads()]);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  return <>{children}</>;
};

export default AppInitializer;
