import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    border: string;
  };
}

interface ThemeContextType {
  isDarkMode: boolean;
  theme: Theme;
  toggleDarkMode: () => void;
  setCustomTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const defaultLightTheme: Theme = {
  name: 'default_light',
  colors: {
    primary: '#007AFF',
    secondary: '#5AC8FA',
    background: '#F2F2F7',
    surface: '#FFFFFF',
    text: '#000000',
    border: '#E5E5EA',
  },
};

const defaultDarkTheme: Theme = {
  name: 'default_dark',
  colors: {
    primary: '#007AFF',
    secondary: '#5AC8FA',
    background: '#1C1C1E',
    surface: '#2C2C2E',
    text: '#FFFFFF',
    border: '#3A3A3C',
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [theme, setTheme] = useState<Theme>(defaultLightTheme);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme_preference');
      const dark = savedTheme === 'dark';
      setIsDarkMode(dark);
      setTheme(dark ? defaultDarkTheme : defaultLightTheme);
    } catch (error) {
      console.error('Failed to load theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDarkMode = async () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    setTheme(newDarkMode ? defaultDarkTheme : defaultLightTheme);
    try {
      await AsyncStorage.setItem('theme_preference', newDarkMode ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const setCustomTheme = async (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem('custom_theme', JSON.stringify(newTheme));
    } catch (error) {
      console.error('Failed to save custom theme:', error);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, theme, toggleDarkMode, setCustomTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
