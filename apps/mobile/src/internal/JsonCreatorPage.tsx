import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton, type MobileTheme, stylesFor } from './shared';

type JsonCreatorPageProps = {
  theme: MobileTheme;
  title: string;
  initialJson: string;
  onImport: (jsonText: string) => string;
  getCustomItems: () => Array<{ id: string; label: string; onDelete: () => void }>;
};

export default function JsonCreatorPage({
  theme,
  title,
  initialJson,
  onImport,
  getCustomItems,
}: JsonCreatorPageProps) {
  const styles = stylesFor(theme);
  const [jsonText, setJsonText] = useState(initialJson);
  const [message, setMessage] = useState('');
  const [customItems, setCustomItems] = useState<
    Array<{ id: string; label: string; onDelete: () => void }>
  >([]);

  useEffect(() => {
    setJsonText(initialJson);
    setCustomItems(getCustomItems());
  }, [getCustomItems, initialJson]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        Paste a Mira JSON preset here, load it into the Android app, and it will stay inside this mobile
        project without depending on desktop files at runtime.
      </Text>
      <View style={styles.card}>
        <TextInput
          value={jsonText}
          onChangeText={setJsonText}
          multiline
          placeholder="Paste theme or layout JSON"
          placeholderTextColor={theme.colors.textDim}
          style={[styles.textInput, styles.multilineInput]}
        />
        <AppButton
          theme={theme}
          label="Import and Select"
          primary
          onPress={() => {
            try {
              const label = onImport(jsonText);
              setMessage(`Loaded ${label}`);
              setCustomItems(getCustomItems());
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Import failed.');
            }
          }}
        />
        {!!message && <Text style={styles.mutedText}>{message}</Text>}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Custom Presets</Text>
        {customItems.length ? (
          customItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowGrow}>
                <Text style={styles.listItemTitle}>{item.label}</Text>
              </View>
              <AppButton
                theme={theme}
                label="Delete"
                danger
                onPress={() => {
                  item.onDelete();
                  setCustomItems(getCustomItems());
                }}
              />
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No custom presets yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}
