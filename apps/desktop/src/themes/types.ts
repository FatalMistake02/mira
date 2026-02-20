export type ThemeColors = Record<string, string>;
export type ThemeFonts = Record<string, string>;
export type ThemeMode = 'light' | 'dark';
export const THEME_SCHEMA_VERSION = 'v1' as const;
export type ThemeSchemaVersion = typeof THEME_SCHEMA_VERSION;

export interface Theme {
  version: ThemeSchemaVersion;
  name: string;
  author: string;
  mode: ThemeMode;
  colors: ThemeColors;
  fonts?: ThemeFonts;
}
