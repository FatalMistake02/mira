import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function InternalNotFoundPage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="404"
      subtitle="Internal page not found"
      description="The mira:// page you requested does not exist."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    />
  );
}
