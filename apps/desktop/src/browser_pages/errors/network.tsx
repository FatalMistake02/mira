import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function NetworkErrorPage() {
  const { reload } = useTabs();

  return (
    <ErrorLayout
      title="Network Error"
      subtitle="This site can't be reached"
      description="Check your connection or try again."
      onReload={reload}
    />
  );
}
