import React, { useState } from 'react';
import {
  ScrollView,
  Switch as RNSwitch,
  Text,
  TextInput,
  View,
  Pressable,
  Modal,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import type {
  BrowserSettings,
  SearchEngine,
  TabSleepUnit,
  TabSleepMode,
} from '../features/settings/browserSettings';
import {
  SEARCH_ENGINE_OPTIONS,
  DEFAULT_BROWSER_SETTINGS,
  getSearchEngineShortcuts,
} from '../features/settings/browserSettings';
import { getAllLayouts } from '../features/layouts/layoutLoader';
import { getAllThemes } from '../features/themes/themeLoader';
import { useTabs } from '../features/tabs/TabsProvider';
import { type MobileTheme, stylesFor } from './shared';

type SettingsSectionId = 'general' | 'search' | 'appearance' | 'privacy-security' | 'app';
type SettingsRouteSection = SettingsSectionId | '';

interface SettingRowProps {
  theme: MobileTheme;
  label: string;
  description?: string;
  children: React.ReactNode;
  compact?: boolean;
}

function SettingRow({ theme, label, description, children, compact }: SettingRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: compact ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        paddingVertical: compact ? 8 : 8,
        paddingHorizontal: 10,
        borderRadius: theme.metrics.radius,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
        marginBottom: 8,
        minHeight: compact ? theme.metrics.controlHeight : theme.metrics.controlHeight,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, lineHeight: 18 }}>
          {label}
        </Text>
        {description && (
          <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 }}>
            {description}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function SettingsToggle({
  value,
  onValueChange,
  theme,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: MobileTheme;
}) {
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
      thumbColor={value ? theme.colors.accent : theme.colors.textMuted}
      ios_backgroundColor={theme.colors.border}
    />
  );
}

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

function SettingsDropdown<T extends string>({
  value,
  options,
  onChange,
  theme,
  placeholder = 'Select...',
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  theme: MobileTheme;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: theme.metrics.radius,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.inputBackground,
          minWidth: 160,
          minHeight: theme.metrics.controlHeight,
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '500',
              color: selected ? theme.colors.text : theme.colors.textDim,
              paddingRight: 10,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {selected?.label ?? placeholder}
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>▾</Text>
        </View>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 320,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.metrics.panelRadius,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 8,
            }}
          >
            {options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setVisible(false);
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: theme.metrics.radius,
                  backgroundColor: option.value === value ? theme.colors.accentSoft : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: option.value === value ? '600' : '400',
                    color: option.value === value ? theme.colors.accent : theme.colors.text,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function SettingsPage({
  theme,
  settings,
  updateSettings,
  section,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
  section?: string;
}) {
  const styles = stylesFor(theme);
  const { navigate } = useTabs();
  const themes = getAllThemes();
  const layouts = getAllLayouts();

  const normalizedSection = (section ?? '').toLowerCase() as SettingsRouteSection;
  const activeSection: SettingsRouteSection =
    normalizedSection === 'general' ||
    normalizedSection === 'search' ||
    normalizedSection === 'appearance' ||
    normalizedSection === 'privacy-security' ||
    normalizedSection === 'app'
      ? normalizedSection
      : (normalizedSection as string) === 'privacy'
        ? 'privacy-security'
        : ''

  const toggle = (key: keyof BrowserSettings) => {
    updateSettings({ [key]: !settings[key] } as Partial<BrowserSettings>);
  };

  const searchShortcuts = getSearchEngineShortcuts(
    settings.searchEngineShortcutPrefix,
    settings.searchEngineShortcutChars,
  );
  const shortcutExample = searchShortcuts[0]?.shortcut ?? '!g';
  const secondShortcutExample = searchShortcuts[1]?.shortcut ?? '!d';

  const tabSleepUnitOptions: DropdownOption<TabSleepUnit>[] = [
    { value: 'seconds', label: 'Seconds' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
  ];

  const tabSleepModeOptions: DropdownOption<TabSleepMode>[] = [
    { value: 'freeze', label: 'Freeze (keep state)' },
    { value: 'discard', label: 'Discard (save memory)' },
  ];

  const renderHeader = (title: string, showBack: boolean) => (
    <View style={{ marginBottom: 16 }}>
      {showBack && (
        <Pressable
          onPress={() => navigate('mira://settings', undefined, { skipInputNormalization: true })}
          style={{ paddingVertical: 6, paddingRight: 12, paddingLeft: 2, marginBottom: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.accent }}>← Back</Text>
        </Pressable>
      )}
      <Text style={{ fontSize: 30, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>{title}</Text>
      {!showBack && (
        <Text style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 }}>
          Customize your browsing experience
        </Text>
      )}
    </View>
  );

  const openSection = (id: SettingsSectionId) => {
    navigate(`mira://settings?section=${encodeURIComponent(id)}`, undefined, { skipInputNormalization: true });
  };

  const SectionPage = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16 }}>
      {renderHeader(title, true)}
      {children}
    </ScrollView>
  );

  const SettingsCard = ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <View
      style={{
        borderRadius: theme.metrics.panelRadius,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, lineHeight: 20 }}>
          {title}
        </Text>
        {!!description && (
          <Text style={{ marginTop: 4, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 }}>
            {description}
          </Text>
        )}
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );

  const openDefaultBrowserSettings = async () => {
    if (Platform.OS !== 'android') {
      await Linking.openSettings();
      return;
    }

    // Prefer explicit "Default apps" / "Browser app" settings on Android.
    // Fallback to generic system settings, then finally app settings.
    try {
      // RN Android-only API
      await (Linking as any).sendIntent('android.settings.MANAGE_DEFAULT_APPS_SETTINGS');
      return;
    } catch {
      // ignore
    }

    try {
      // RN Android-only API
      await (Linking as any).sendIntent('android.settings.SETTINGS');
      return;
    } catch {
      // ignore
    }

    await Linking.openSettings();
  };

  if (!activeSection) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 16 }}>
        {renderHeader('Settings', false)}

        <View
          style={{
            borderRadius: theme.metrics.panelRadius,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 6,
          }}
        >
          {(
            [
              { id: 'general', label: 'General' },
              { id: 'search', label: 'Search' },
              { id: 'appearance', label: 'Appearance' },
              { id: 'privacy-security', label: 'Privacy & Security' },
              { id: 'app', label: 'App' },
            ] as const
          ).map((entry, index, all) => (
            <Pressable
              key={entry.id}
              onPress={() => openSection(entry.id)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: theme.metrics.radius,
                backgroundColor: theme.colors.background,
                borderWidth: 1,
                borderColor: theme.colors.border,
                marginBottom: index === all.length - 1 ? 0 : 6,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, lineHeight: 18 }}>
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (activeSection === 'general') {
    return (
      <SectionPage title="General">
        <SettingsCard title="New Tab">
          <SettingRow theme={theme} label="New Tab URL">
            <TextInput
              value={settings.newTabPage}
              onChangeText={(value) => updateSettings({ newTabPage: value })}
              placeholder={DEFAULT_BROWSER_SETTINGS.newTabPage}
              placeholderTextColor={theme.colors.textDim}
              style={{ ...styles.textInput, minWidth: 160, maxWidth: 220 }}
              autoCapitalize="none"
            />
          </SettingRow>

          {settings.newTabPage === DEFAULT_BROWSER_SETTINGS.newTabPage && (
            <>
              <SettingRow theme={theme} label="Show New Tab branding" description="Display Mira logo and welcome message">
                <SettingsToggle
                  value={settings.showNewTabBranding}
                  onValueChange={() => toggle('showNewTabBranding')}
                  theme={theme}
                />
              </SettingRow>
              <SettingRow theme={theme} label="Disable intro animation" description="Skip the new-tab intro animation">
                <SettingsToggle
                  value={settings.disableNewTabIntro}
                  onValueChange={() => toggle('disableNewTabIntro')}
                  theme={theme}
                />
              </SettingRow>
            </>
          )}
        </SettingsCard>

        <SettingsCard title="Tab Sleep">
          <SettingRow theme={theme} label="Sleep timeout">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={String(settings.tabSleepValue)}
                onChangeText={(value) => {
                  const num = parseInt(value, 10);
                  if (!Number.isNaN(num)) {
                    updateSettings({ tabSleepValue: Math.max(1, num) });
                  }
                }}
                keyboardType="number-pad"
                style={{
                  ...styles.textInput,
                  width: 116,
                  textAlign: 'center',
                  marginRight: 8,
                }}
              />
              <SettingsDropdown
                value={settings.tabSleepUnit}
                options={tabSleepUnitOptions}
                onChange={(value) => updateSettings({ tabSleepUnit: value })}
                theme={theme}
              />
            </View>
          </SettingRow>
          <SettingRow theme={theme} label="Sleep behavior">
            <SettingsDropdown
              value={settings.tabSleepMode}
              options={tabSleepModeOptions}
              onChange={(value) => updateSettings({ tabSleepMode: value })}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Browsing">
          <SettingRow theme={theme} label="Enable ad blocking" description="Block known ad and marketing hosts">
            <SettingsToggle
              value={settings.adBlockEnabled}
              onValueChange={() => toggle('adBlockEnabled')}
              theme={theme}
            />
          </SettingRow>
          <SettingRow theme={theme} label="Enable tracker blocking" description="Blocks analytics trackers">
            <SettingsToggle
              value={settings.trackerBlockEnabled}
              onValueChange={() => toggle('trackerBlockEnabled')}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>
      </SectionPage>
    );
  }

  if (activeSection === 'search') {
    return (
      <SectionPage title="Search">
        <SettingsCard title="Search">
          <SettingRow theme={theme} label="Default search engine">
            <SettingsDropdown
              value={settings.searchEngine}
              options={SEARCH_ENGINE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(value) => updateSettings({ searchEngine: value as SearchEngine })}
              theme={theme}
            />
          </SettingRow>

          <SettingRow
            theme={theme}
            label="Enable engine shortcuts"
            description={`Use ${shortcutExample} or ${secondShortcutExample} to switch engines`}
          >
            <SettingsToggle
              value={settings.searchEngineShortcutsEnabled}
              onValueChange={() => toggle('searchEngineShortcutsEnabled')}
              theme={theme}
            />
          </SettingRow>

          {settings.searchEngineShortcutsEnabled && (
            <>
              <SettingRow theme={theme} label="Shortcut prefix" description="Character before each engine shortcut">
                <TextInput
                  value={settings.searchEngineShortcutPrefix}
                  onChangeText={(value) =>
                    updateSettings({ searchEngineShortcutPrefix: value.replace(/\s+/g, '').slice(-1) })
                  }
                  placeholder="!"
                  placeholderTextColor={theme.colors.textDim}
                  style={{ ...styles.textInput, width: 60, textAlign: 'center' }}
                  maxLength={1}
                  autoCapitalize="none"
                />
              </SettingRow>

              <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 8, marginTop: 8 }}>
                Engine shortcuts
              </Text>
              {searchShortcuts.map((entry) => (
                <View
                  key={entry.engine}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: theme.metrics.radius,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                    marginBottom: 6,
                    minHeight: theme.metrics.controlHeight,
                  }}
                >
                  <Text style={{ fontSize: 13, color: theme.colors.text, fontWeight: '600' }}>{entry.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: theme.colors.textDim }}>{entry.shortcut}</Text>
                    <TextInput
                      value={settings.searchEngineShortcutChars[entry.engine]}
                      onChangeText={(value) =>
                        updateSettings({
                          searchEngineShortcutChars: {
                            ...settings.searchEngineShortcutChars,
                            [entry.engine]: value.replace(/\s+/g, '').toLowerCase().slice(-1),
                          },
                        })
                      }
                      style={{
                        ...styles.textInput,
                        width: 60,
                        textAlign: 'center',
                        paddingHorizontal: 4,
                        marginLeft: 8,
                        minHeight: theme.metrics.controlHeight,
                      }}
                      maxLength={1}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}
            </>
          )}
        </SettingsCard>
      </SectionPage>
    );
  }

  if (activeSection === 'appearance') {
    return (
      <SectionPage title="Appearance">
        <SettingsCard title="Theme" description="Choose a color scheme for Mira.">
          <SettingRow theme={theme} label="Active theme">
            <SettingsDropdown
              value={settings.themeId}
              options={themes.map((entry) => ({ value: entry.id, label: entry.theme.name }))}
              onChange={(value) => updateSettings({ themeId: value })}
              theme={theme}
            />
          </SettingRow>
          <SettingRow theme={theme} label="Dark mode raw files" description="White text on black background for plain text">
            <SettingsToggle
              value={settings.rawFileDarkModeEnabled}
              onValueChange={() => toggle('rawFileDarkModeEnabled')}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Layout" description="Spacing, density, and proportions.">
          <SettingRow theme={theme} label="Active layout">
            <SettingsDropdown
              value={settings.layoutId}
              options={layouts.map((entry) => ({ value: entry.id, label: entry.layout.name }))}
              onChange={(value) => updateSettings({ layoutId: value })}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Animations">
          <SettingRow theme={theme} label="Animations" description="Enable animations.">
            <SettingsToggle
              value={settings.animationsEnabled}
              onValueChange={() => toggle('animationsEnabled')}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>
      </SectionPage>
    );
  }

  if (activeSection === 'privacy-security') {
    return (
      <SectionPage title="Privacy & Security">
        <SettingsCard title="Cookies and Site Data">
          <SettingRow theme={theme} label="Allow cookies" description="Allow websites to store cookies and site data.">
            <SettingsToggle
              value={settings.cookiesEnabled}
              onValueChange={() => toggle('cookiesEnabled')}
              theme={theme}
            />
          </SettingRow>
        </SettingsCard>
      </SectionPage>
    );
  }

  return (
    <SectionPage title="App">
      <SettingsCard
        title="Default Browser"
        description="Set Mira as the default app for opening links."
      >
        <Pressable
          onPress={() => {
            openDefaultBrowserSettings().catch(() => undefined);
          }}
          style={[styles.button, styles.buttonPrimary]}
        >
          <Text style={[styles.buttonText, styles.buttonPrimaryText]}>Open System Settings</Text>
        </Pressable>
      </SettingsCard>

      <SettingsCard
        title="Updates"
        description="Check for app updates."
      >
        <Pressable
          onPress={async () => {
            // Detect installation source and route accordingly
            if (Platform.OS === 'ios') {
              // Open Apple App Store
              await Linking.openURL('https://apps.apple.com/app/mira-browser/id1234567890').catch(() => {
                // Fallback to website if App Store fails
                Linking.openURL('https://mira.fatalmistake02.com/mobile').catch(() => undefined);
              });
            } else if (Platform.OS === 'android') {
              // Try Play Store first (market:// scheme)
              const playStoreUrl = 'market://details?id=com.fatalmistake02.mira.mobile';
              const webPlayUrl = 'https://play.google.com/store/apps/details?id=com.fatalmistake02.mira.mobile';

              try {
                const canOpenPlay = await Linking.canOpenURL(playStoreUrl);
                if (canOpenPlay) {
                  await Linking.openURL(playStoreUrl);
                } else {
                  // Likely APK install, go to website
                  await Linking.openURL('https://mira.fatalmistake02.com/mobile');
                }
              } catch {
                // Fallback: try web Play Store, then website
                try {
                  await Linking.openURL(webPlayUrl);
                } catch {
                  await Linking.openURL('https://mira.fatalmistake02.com/mobile').catch(() => undefined);
                }
              }
            } else {
              // Unknown platform, go to website
              await Linking.openURL('https://mira.fatalmistake02.com/mobile').catch(() => undefined);
            }
          }}
          style={[styles.button, styles.buttonPrimary]}
        >
          <Text style={[styles.buttonText, styles.buttonPrimaryText]}>Check for Updates</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Linking.openURL('https://github.com/FatalMistake02/mira/releases').catch(() => undefined);
          }}
          style={[styles.button, { marginTop: 8 }]}
        >
          <Text style={styles.buttonText}>Open GitHub Releases</Text>
        </Pressable>
      </SettingsCard>
    </SectionPage>
  );
}
