export type ThemeColors = Record<string, string>;
export type ThemeMode = 'light' | 'dark';

export interface Theme {
  name: string;
  author: string;
  mode: ThemeMode;
  colors: ThemeColors;
}
