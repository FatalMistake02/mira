import React from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { BrowserSettings, SearchEngine } from '../features/settings/browserSettings';
import { SEARCH_ENGINE_OPTIONS } from '../features/settings/browserSettings';
import { getAllLayouts } from '../features/layouts/layoutLoader';
import { getAllThemes } from '../features/themes/themeLoader';
import { useTabs } from '../features/tabs/TabsProvider';
import { AppButton, ChoiceChips, type MobileTheme, stylesFor } from './shared';

export default function SettingsPage({
  theme,
  settings,
  updateSettings,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
}) {
  const styles = stylesFor(theme);
  const { openLayoutCreator, openThemeCreator, openUpdates } = useTabs();
  const themes = getAllThemes();
  const layouts = getAllLayouts();

  const toggle = (key: keyof BrowserSettings) => {
    updateSettings({ [key]: !settings[key] } as Partial<BrowserSettings>);
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Desktop Mira&apos;s appearance and browsing controls, adapted for Android.</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.sectionCaption}>Theme, layout, new tab branding, and chrome density.</Text>
        <ChoiceChips
          theme={theme}
          value={settings.themeId}
          options={themes.map((entry) => ({ value: entry.id, label: entry.theme.name }))}
          onChange={(value) => updateSettings({ themeId: value })}
        />
        <ChoiceChips
          theme={theme}
          value={settings.layoutId}
          options={layouts.map((entry) => ({ value: entry.id, label: entry.layout.name }))}
          onChange={(value) => updateSettings({ layoutId: value })}
        />
        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Text style={styles.listItemTitle}>Show branding on new tab</Text>
            <Text style={styles.listItemMeta}>Keeps Mira&apos;s logo and welcome copy visible.</Text>
          </View>
          <Switch value={settings.showNewTabBranding} onValueChange={() => toggle('showNewTabBranding')} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Text style={styles.listItemTitle}>Animations</Text>
            <Text style={styles.listItemMeta}>Subtle motion for sheets and controls.</Text>
          </View>
          <Switch value={settings.animationsEnabled} onValueChange={() => toggle('animationsEnabled')} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Text style={styles.listItemTitle}>Show bookmarks bar</Text>
            <Text style={styles.listItemMeta}>Keeps favorites available under the address bar.</Text>
          </View>
          <Switch value={settings.showBookmarksBar} onValueChange={() => toggle('showBookmarksBar')} />
        </View>
        <AppButton theme={theme} label="Theme Creator" onPress={openThemeCreator} />
        <AppButton theme={theme} label="Layout Creator" onPress={openLayoutCreator} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Browsing</Text>
        <TextInput
          value={settings.newTabPage}
          onChangeText={(value) => updateSettings({ newTabPage: value })}
          placeholder="New tab URL"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
          autoCapitalize="none"
        />
        <ChoiceChips
          theme={theme}
          value={settings.searchEngine}
          options={SEARCH_ENGINE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => updateSettings({ searchEngine: value as SearchEngine })}
        />
        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Text style={styles.listItemTitle}>Search shortcuts</Text>
            <Text style={styles.listItemMeta}>Use tokens like !g or !d in the address bar.</Text>
          </View>
          <Switch
            value={settings.searchEngineShortcutsEnabled}
            onValueChange={() => toggle('searchEngineShortcutsEnabled')}
          />
        </View>
        <TextInput
          value={settings.searchEngineShortcutPrefix}
          onChangeText={(value) => updateSettings({ searchEngineShortcutPrefix: value })}
          placeholder="Shortcut prefix"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        {[
          ['adBlockEnabled', 'Ad blocker'],
          ['trackerBlockEnabled', 'Tracker blocker'],
          ['cookiesEnabled', 'Cookies and site data'],
          ['rawFileDarkModeEnabled', 'Prefer dark raw files'],
        ].map(([key, label]) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowGrow}>
              <Text style={styles.listItemTitle}>{label}</Text>
              <Text style={styles.listItemMeta}>Mobile-safe toggle preserved from desktop Mira.</Text>
            </View>
            <Switch
              value={settings[key as keyof BrowserSettings] as boolean}
              onValueChange={() => toggle(key as keyof BrowserSettings)}
            />
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Updates</Text>
        <Text style={styles.subtitle}>
          Android builds currently rely on manual installs. The same update settings are preserved here
          so the behavior can grow into parity later.
        </Text>
        <AppButton theme={theme} label="Updates Page" onPress={openUpdates} />
      </View>
    </ScrollView>
  );
}
