import { LayoutConfig } from '../../layouts/types';

export const loadLayout = async (layoutName?: string): Promise<LayoutConfig> => {
  const defaultLayout: LayoutConfig = {
    name: 'default_standard',
    displayName: 'Standard',
    description: 'Standard layout with bottom tabs',
    config: {
      name: 'default_standard',
      tabBarPosition: 'bottom',
      addressBarPosition: 'top',
      compactMode: false,
    },
  };

  return defaultLayout;
};
