import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  clearHistoryEntries,
  deleteHistoryEntry,
  listHistoryEntries,
  type HistoryEntry,
} from '../features/history/clientHistory';
import { useTabs } from '../features/tabs/TabsProvider';
import { AppButton, type MobileTheme, stylesFor } from './shared';

export default function HistoryPage({ theme }: { theme: MobileTheme }) {
  const styles = stylesFor(theme);
  const { navigate } = useTabs();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const load = () => {
    listHistoryEntries().then(setEntries);
  };

  useEffect(load, []);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.subtitle}>Everything you visited recently in Mira.</Text>
      <View style={styles.cardRow}>
        <AppButton theme={theme} label="Refresh" onPress={load} />
        <AppButton
          theme={theme}
          label="Clear History"
          danger
          onPress={() => {
            clearHistoryEntries().then(load);
          }}
        />
      </View>
      {entries.length ? (
        entries.map((entry) => (
          <View key={entry.id} style={styles.listItem}>
            <Text style={styles.listItemTitle} onPress={() => navigate(entry.url)}>
              {entry.title}
            </Text>
            <Text style={styles.listItemMeta}>{entry.url}</Text>
            <AppButton
              theme={theme}
              label="Remove"
              danger
              onPress={() => {
                deleteHistoryEntry(entry.id).then(load);
              }}
            />
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No history yet.</Text>
      )}
    </ScrollView>
  );
}
