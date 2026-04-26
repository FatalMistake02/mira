import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDownloads } from '../features/downloads/DownloadProvider';
import { AppButton, type MobileTheme, stylesFor } from './shared';

export default function DownloadsPage({ theme }: { theme: MobileTheme }) {
  const styles = stylesFor(theme);
  const { downloads, clearDownloads, removeDownload } = useDownloads();

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>Downloads</Text>
      <Text style={styles.subtitle}>Downloads triggered from the Android app.</Text>
      <View style={styles.cardRow}>
        <AppButton theme={theme} label="Clear List" danger onPress={clearDownloads} />
      </View>
      {downloads.length ? (
        downloads.map((download) => (
          <View key={download.id} style={styles.listItem}>
            <Text style={styles.listItemTitle}>{download.filename}</Text>
            <Text style={styles.listItemMeta}>{download.url}</Text>
            <Text style={styles.mutedText}>
              {download.status} • {download.receivedBytes}/{download.totalBytes || 0} bytes
            </Text>
            {!!download.error && <Text style={styles.mutedText}>{download.error}</Text>}
            <AppButton theme={theme} label="Remove" onPress={() => removeDownload(download.id)} />
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No downloads yet.</Text>
      )}
    </ScrollView>
  );
}
