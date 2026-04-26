import React from 'react';
import { View, Text } from 'react-native';
import { useTabs } from '../features/tabs/TabsProvider';
import { AppButton, type MobileTheme, stylesFor } from './shared';

export default function ErrorPage({
  theme,
  title,
  description,
  children,
}: {
  theme: MobileTheme;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const styles = stylesFor(theme);
  const { navigateToNewTabPage, reload } = useTabs();

  return (
    <View
      style={[
        styles.page,
        {
          padding: theme.metrics.spacing * 1.5,
          justifyContent: 'center',
          gap: theme.metrics.spacing,
        },
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{description}</Text>
      <View style={styles.cardRow}>
        <AppButton theme={theme} label="Reload" onPress={reload} />
        <AppButton theme={theme} label="New Tab" onPress={navigateToNewTabPage} />
      </View>
      {children}
    </View>
  );
}
