import React from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { AppButton, type MobileTheme, stylesFor } from './shared';

export default function MailtoPage({
  theme,
  mailtoUrl,
}: {
  theme: MobileTheme;
  mailtoUrl: string;
}) {
  const styles = stylesFor(theme);
  const options = [
    {
      label: 'Device Email App',
      action: async () => Linking.openURL(mailtoUrl),
    },
    {
      label: 'Gmail Web',
      action: async () =>
        Linking.openURL(
          `https://mail.google.com/mail/?extsrc=mailto&url=${encodeURIComponent(mailtoUrl)}`,
        ),
    },
    {
      label: 'Outlook Web',
      action: async () =>
        Linking.openURL(
          `https://outlook.office.com/mail/deeplink/compose?mailtouri=${encodeURIComponent(mailtoUrl)}`,
        ),
    },
    {
      label: 'Proton Mail',
      action: async () =>
        Linking.openURL(
          `https://mail.proton.me/u/0/inbox?compose=${encodeURIComponent(mailtoUrl)}`,
        ),
    },
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>Open Email Link</Text>
      <Text style={styles.subtitle}>Choose how Mira should handle this `mailto:` link.</Text>
      <View style={styles.card}>
        <Text style={styles.bodyText}>{mailtoUrl}</Text>
      </View>
      {options.map((option) => (
        <AppButton
          key={option.label}
          theme={theme}
          label={option.label}
          onPress={() => {
            option.action().catch(() => {
              Alert.alert('Unable to open email app');
            });
          }}
        />
      ))}
    </ScrollView>
  );
}
