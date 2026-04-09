import { useEffect } from 'react';
import { useTheme } from '../features/themes/ThemeProvider';

export const useTheming = () => {
  const theme = useTheme();
  return theme;
};
