import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function ExternalNetworkErrorPage() {
  const { reload, navigateToNewTabPage } = useTabs();

  return (
    <ErrorLayout
      title="Network Error"
      subtitle="This site can't be reached"
      description="Check your connection, proxy, VPN, or firewall, then try again."
      onReload={reload}
      onOpenNewTab={navigateToNewTabPage}
    />
  );
}
