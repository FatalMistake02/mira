import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function CrashPage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="Tab Crashed"
      subtitle="Something went wrong"
      description="The page crashed unexpectedly."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    />
  );
}
