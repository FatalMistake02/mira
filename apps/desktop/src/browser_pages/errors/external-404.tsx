import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function ExternalNotFoundPage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="404"
      subtitle="Page not found"
      description="The website responded, but this page does not exist."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    />
  );
}
