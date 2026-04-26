import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { type MobileTheme, stylesFor } from './shared';

export default function UpdatesPage({ theme }: { theme: MobileTheme }) {
  const styles = stylesFor(theme);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>Updates</Text>
      <Text style={styles.subtitle}>
        Mobile Mira is checked into this repo as a full Android app under `apps/mobile`. For now, updates
        are handled by rebuilding and reinstalling the APK rather than the desktop auto-updater.
      </Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What&apos;s preserved</Text>
        <Text style={styles.bodyText}>
          Themes, layouts, bookmarks, history, settings, and internal pages all live inside the mobile
          folder.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Current mobile path</Text>
        <Text style={styles.bodyText}>Build with `npm run mobile:android` from the repo root.</Text>
      </View>
    </ScrollView>
  );
}
