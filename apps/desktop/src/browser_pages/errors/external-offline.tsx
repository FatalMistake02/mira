import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function ExternalOfflinePage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="No Internet"
      subtitle="You're offline"
      description="Check your internet connection and try again."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    />
  );
}
