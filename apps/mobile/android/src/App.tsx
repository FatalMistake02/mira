import React, { useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import { BookmarksProvider } from './features/bookmarks/BookmarksProvider';
import { DownloadProvider } from './features/downloads/DownloadProvider';
import { TabsProvider } from './features/tabs/TabsProvider';
import { ThemeProvider, useTheme } from './features/themes/ThemeProvider';
import { LayoutProvider } from './features/layouts/LayoutProvider';

// Screens
import BrowserScreen from './browser_pages/Browser';
import BookmarksScreen from './browser_pages/Bookmarks';
import DownloadsScreen from './browser_pages/Downloads';
import HistoryScreen from './browser_pages/History';
import SettingsScreen from './browser_pages/Settings';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const BrowserStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="BrowserHome" component={BrowserScreen} />
  </Stack.Navigator>
);

const BookmarksStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="BookmarksList" component={BookmarksScreen} />
  </Stack.Navigator>
);

const DownloadsStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="DownloadsList" component={DownloadsScreen} />
  </Stack.Navigator>
);

const HistoryStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="HistoryList" component={HistoryScreen} />
  </Stack.Navigator>
);

const SettingsStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="SettingsList" component={SettingsScreen} />
  </Stack.Navigator>
);

interface TabBarIconProps {
  focused: boolean;
  color: string;
  size: number;
}

const BrowserTabIcon = ({ focused, color, size }: TabBarIconProps) => (
  <Icon name={focused ? 'globe-sharp' : 'globe-outline'} size={size} color={color} />
);

const BookmarksTabIcon = ({ focused, color, size }: TabBarIconProps) => (
  <Icon name={focused ? 'bookmark-sharp' : 'bookmark-outline'} size={size} color={color} />
);

const DownloadsTabIcon = ({ focused, color, size }: TabBarIconProps) => (
  <Icon name={focused ? 'download-sharp' : 'download-outline'} size={size} color={color} />
);

const HistoryTabIcon = ({ focused, color, size }: TabBarIconProps) => (
  <Icon name={focused ? 'history-sharp' : 'history-outline'} size={size} color={color} />
);

const SettingsTabIcon = ({ focused, color, size }: TabBarIconProps) => (
  <Icon name={focused ? 'settings-sharp' : 'settings-outline'} size={size} color={color} />
);

interface TabNavigatorProps {
  isDarkMode: boolean;
}

const TabNavigator = ({ isDarkMode }: TabNavigatorProps) => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: isDarkMode ? '#007AFF' : '#007AFF',
      tabBarInactiveTintColor: isDarkMode ? '#8E8E93' : '#C7C7CC',
      tabBarStyle: {
        backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
        borderTopColor: isDarkMode ? '#3A3A3C' : '#E5E5EA',
        borderTopWidth: 1,
      },
      tabBarLabel: route.name,
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '500',
      },
    } as any)}
  >
    <Tab.Screen
      name="Browser"
      component={BrowserStack}
      options={{
        tabBarIcon: BrowserTabIcon,
      }}
    />
    <Tab.Screen
      name="Bookmarks"
      component={BookmarksStack}
      options={{
        tabBarIcon: BookmarksTabIcon,
      }}
    />
    <Tab.Screen
      name="Downloads"
      component={DownloadsStack}
      options={{
        tabBarIcon: DownloadsTabIcon,
      }}
    />
    <Tab.Screen
      name="History"
      component={HistoryStack}
      options={{
        tabBarIcon: HistoryTabIcon,
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsStack}
      options={{
        tabBarIcon: SettingsTabIcon,
      }}
    />
  </Tab.Navigator>
);

const AppContent = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content');
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(isDarkMode ? '#1C1C1E' : '#FFFFFF');
    }
  }, [isDarkMode]);

  return (
    <NavigationContainer>
      <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF' }]}>
        <TabNavigator isDarkMode={isDarkMode} />
      </SafeAreaView>
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <LayoutProvider>
        <TabsProvider>
          <BookmarksProvider>
            <DownloadProvider>
              <AppContent />
            </DownloadProvider>
          </BookmarksProvider>
        </TabsProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
