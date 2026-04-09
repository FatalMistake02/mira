import { Linking } from 'react-native';

export const applyLayout = async (layoutName: string) => {
  // Layout configuration is handled by LayoutProvider
  console.log(`Applying layout: ${layoutName}`);
};

export const getAvailableLayouts = () => {
  return [
    {
      name: 'default_standard',
      displayName: 'Standard',
      description: 'Standard layout with bottom tabs',
    },
    {
      name: 'default_compact',
      displayName: 'Compact',
      description: 'Compact layout for smaller screens',
    },
  ];
};
