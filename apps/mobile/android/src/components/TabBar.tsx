import React from 'react';
import { View, ScrollView, StyleSheet, Text } from 'react-native';
import { useTabs } from '../features/tabs/TabsProvider';
import { useTheme } from '../features/themes/ThemeProvider';

const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab } = useTabs();
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      style={[styles.container, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}
      showsHorizontalScrollIndicator={false}
    >
      {tabs.map((tab) => (
        <View
          key={tab.id}
          style={[
            styles.tab,
            {
              borderBottomColor: tab.isActive ? theme.colors.primary : theme.colors.border,
              borderBottomWidth: tab.isActive ? 3 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: tab.isActive ? theme.colors.primary : theme.colors.text,
                fontWeight: tab.isActive ? '600' : '400',
              },
            ]}
            numberOfLines={1}
          >
            {tab.title}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
  },
});

export default TabBar;
