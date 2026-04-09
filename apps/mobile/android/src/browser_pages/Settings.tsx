import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  SectionList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../features/themes/ThemeProvider';
import { useTabs } from '../features/tabs/TabsProvider';

const Settings = () => {
  const { theme, isDarkMode, toggleDarkMode } = useTheme();
  const { closeTabs } = useTabs();
  const [notifications, setNotifications] = useState(true);
  const [doNotTrack, setDoNotTrack] = useState(false);
  const [autoSave, setAutoSave] = useState(true);

  const handleClearData = () => {
    Alert.alert('Clear All Data', 'This will delete all browsing data, bookmarks, and history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove(['bookmarks', 'history', 'downloads', 'tabs', 'layout']);
            await closeTabs();
            Alert.alert('Success', 'All data has been cleared.');
          } catch (error) {
            Alert.alert('Error', 'Failed to clear data.');
          }
        },
      },
    ]);
  };

  const settingsSections = [
    {
      title: 'APPEARANCE',
      data: [
        {
          id: '1',
          label: 'Dark Mode',
          value: isDarkMode,
          onChange: toggleDarkMode,
          icon: 'moon-outline',
        },
      ],
    },
    {
      title: 'PRIVACY & SECURITY',
      data: [
        {
          id: '3',
          label: 'Do Not Track',
          value: doNotTrack,
          onChange: () => setDoNotTrack(!doNotTrack),
          icon: 'shield-outline',
        },
        {
          id: '4',
          label: 'Notifications',
          value: notifications,
          onChange: () => setNotifications(!notifications),
          icon: 'notifications-outline',
        },
      ],
    },
    {
      title: 'DATA & STORAGE',
      data: [
        {
          id: '5',
          label: 'Auto Save',
          value: autoSave,
          onChange: () => setAutoSave(!autoSave),
          icon: 'save-outline',
        },
      ],
    },
  ];

  const renderToggleItem = ({ item }: any) => (
    <View style={[styles.settingItem, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
      <View style={styles.settingContent}>
        <Icon name={item.icon} size={24} color={theme.colors.primary} style={styles.settingIcon} />
        <Text style={[styles.settingLabel, { color: theme.colors.text }]}>{item.label}</Text>
      </View>
      <Switch
        value={item.value}
        onValueChange={item.onChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      />
    </View>
  );

  const renderSectionHeader = ({ section }: any) => (
    <Text style={[styles.sectionHeader, { color: theme.colors.primary }]}>{section.title}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SectionList
        sections={settingsSections}
        keyExtractor={(item) => item.id}
        renderItem={renderToggleItem}
        renderSectionHeader={renderSectionHeader}
        scrollEnabled={true}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.dangerButton, { backgroundColor: theme.colors.surface, borderColor: '#FF3B30' }]}
          onPress={handleClearData}
        >
          <Icon name="warning-outline" size={20} color="#FF3B30" style={styles.buttonIcon} />
          <Text style={styles.dangerButtonText}>Clear All Data</Text>
        </TouchableOpacity>

        <View style={styles.versionInfo}>
          <Text style={[styles.versionText, { color: theme.colors.text }]}>Mira Browser v1.0.0</Text>
          <Text style={[styles.copyrightText, { color: theme.colors.primary }]}>
            © 2024 Mira Community
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  bottomSection: {
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  dangerButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  versionInfo: {
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
  },
});

export default Settings;
