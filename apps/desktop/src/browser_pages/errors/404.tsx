import { useTabs } from '../../features/tabs/TabsProvider';
import ErrorLayout from './ErrorLayout';

export default function NotFoundPage() {
  const { reload } = useTabs();

  return (
    <ErrorLayout
      title="404"
      subtitle="Page not found"
      description="This internal page does not exist."
      onReload={reload}
    />
  );
}
