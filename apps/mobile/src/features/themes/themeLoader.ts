import type { Theme, ThemeMode } from '../../themes/types';
import { THEME_SCHEMA_VERSION } from '../../themes/types';
import { getCachedJson, setCachedJson } from '../../storage/cacheStorage';
import defaultDarkTheme from '../../themes/default_dark.json';
import defaultLightTheme from '../../themes/default_light.json';
import miraDarkTheme from '../../themes/mira_dark.json';
import miraLightTheme from '../../themes/mira_light.json';

const CUSTOM_THEME_STORAGE_KEY = 'mira.mobile.themes.custom.v1';
export const DEFAULT_THEME_ID = 'default_dark';
export const DEFAULT_LIGHT_THEME_ID = 'default_light';

type StoredTheme = { id: string; theme: Theme };

export type ThemeEntry = {
  id: string;
  theme: Theme;
  source: 'bundled' | 'custom';
};

const bundledThemeModules = [
  ['default_dark', defaultDarkTheme],
  ['default_light', defaultLightTheme],
  ['mira_dark', miraDarkTheme],
  ['mira_light', miraLightTheme],
] as const;

const DEFAULT_THEME_FONTS: Record<string, string> = {
  fontPrimaryFamily: "'Segoe UI'",
  fontSecondaryFamily: "'Segoe UI'",
  fontPrimaryWeight: '400',
  fontSecondaryWeight: '300',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const raw = value.trim();
  if (!raw.startsWith('#')) return null;

  const hex = raw.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].some((part) => Number.isNaN(part))) return null;
    return { r, g, b };
  }

  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((part) => Number.isNaN(part))) return null;
    return { r, g, b };
  }

  return null;
}

function inferThemeMode(colors: Record<string, string>): ThemeMode {
  const sample = colors.bg || colors.tabBg || colors.urlBarBg || '#141414';
  const rgb = parseHexColor(sample);
  if (!rgb) return 'dark';

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.5 ? 'light' : 'dark';
}

function normalizeTheme(value: unknown): Theme | null {
  if (!isRecord(value)) return null;

  const versionRaw = typeof value.version === 'string' ? value.version.trim().toLowerCase() : '';
  const normalizedVersion = versionRaw.replace(/^v/, '');
  const expectedVersion = THEME_SCHEMA_VERSION.replace(/^v/, '');
  if (versionRaw && normalizedVersion !== expectedVersion) return null;

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const author = typeof value.author === 'string' ? value.author.trim() : '';
  if (!name || !author || !isRecord(value.colors)) return null;

  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value.colors)) {
    if (typeof raw === 'string' && key.trim()) {
      colors[key] = raw;
    }
  }

  if (isRecord(value.fonts)) {
    for (const [key, raw] of Object.entries(value.fonts)) {
      if (typeof raw === 'string' && key.trim()) {
        fonts[key] = raw;
      }
    }
  }

  if (!Object.keys(colors).length) return null;

  const modeRaw = typeof value.mode === 'string' ? value.mode.trim().toLowerCase() : '';
  const mode = modeRaw === 'light' || modeRaw === 'dark' ? modeRaw : inferThemeMode(colors);

  return {
    version: THEME_SCHEMA_VERSION,
    name,
    author,
    mode,
    colors,
    fonts,
  };
}

function resolveThemeWithModeFallbackInternal(
  theme: Theme,
  baseColorsByMode: Record<ThemeMode, Record<string, string>>,
  baseFontsByMode: Record<ThemeMode, Record<string, string>>,
): Theme {
  const baseColors = baseColorsByMode[theme.mode] ?? {};
  const allColorKeys = new Set([...Object.keys(baseColors), ...Object.keys(theme.colors)]);
  const colors: Record<string, string> = {};

  for (const key of allColorKeys) {
    const raw = theme.colors[key];
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (normalized) {
      colors[key] = normalized;
      continue;
    }

    const fallback = baseColors[key];
    if (typeof fallback === 'string' && fallback.trim()) {
      colors[key] = fallback.trim();
    }
  }

  const baseFonts = baseFontsByMode[theme.mode] ?? DEFAULT_THEME_FONTS;
  const themeFonts = theme.fonts ?? {};
  const allFontKeys = new Set([...Object.keys(baseFonts), ...Object.keys(themeFonts)]);
  const fonts: Record<string, string> = {};

  for (const key of allFontKeys) {
    const raw = themeFonts[key];
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (normalized) {
      fonts[key] = normalized;
      continue;
    }

    const fallback = baseFonts[key];
    if (typeof fallback === 'string' && fallback.trim()) {
      fonts[key] = fallback.trim();
    }
  }

  return {
    ...theme,
    colors,
    fonts,
  };
}

const bundledThemesRaw: ThemeEntry[] = bundledThemeModules.flatMap(([id, value]) => {
  const theme = normalizeTheme(value);
  if (!theme) return [];
  return [{ id, theme, source: 'bundled' as const }];
});

const defaultDarkBaseColors =
  bundledThemesRaw.find((entry) => entry.id === 'default_dark')?.theme.colors ?? {};
const defaultLightBaseColors =
  bundledThemesRaw.find((entry) => entry.id === 'default_light')?.theme.colors ?? {};
const defaultDarkBaseFonts =
  bundledThemesRaw.find((entry) => entry.id === 'default_dark')?.theme.fonts ?? {};
const defaultLightBaseFonts =
  bundledThemesRaw.find((entry) => entry.id === 'default_light')?.theme.fonts ?? {};

const baseColorsByMode: Record<ThemeMode, Record<string, string>> = {
  dark: Object.keys(defaultDarkBaseColors).length ? defaultDarkBaseColors : defaultLightBaseColors,
  light: Object.keys(defaultLightBaseColors).length
    ? defaultLightBaseColors
    : defaultDarkBaseColors,
};

const baseFontsByMode: Record<ThemeMode, Record<string, string>> = {
  dark: {
    ...DEFAULT_THEME_FONTS,
    ...(Object.keys(defaultDarkBaseFonts).length ? defaultDarkBaseFonts : defaultLightBaseFonts),
  },
  light: {
    ...DEFAULT_THEME_FONTS,
    ...(Object.keys(defaultLightBaseFonts).length ? defaultLightBaseFonts : defaultDarkBaseFonts),
  },
};

export function resolveThemeWithModeFallback(theme: Theme): Theme {
  return resolveThemeWithModeFallbackInternal(theme, baseColorsByMode, baseFontsByMode);
}

const bundledThemes: ThemeEntry[] = bundledThemesRaw.map((entry) => ({
  ...entry,
  theme: resolveThemeWithModeFallback(entry.theme),
}));

function readCustomThemes(): StoredTheme[] {
  const parsed = getCachedJson<StoredTheme[]>(CUSTOM_THEME_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      const theme = normalizeTheme(entry.theme);
      if (!id || !theme) return null;
      return { id, theme: resolveThemeWithModeFallback(theme) };
    })
    .filter((entry): entry is StoredTheme => entry !== null);
}

function writeCustomThemes(themes: StoredTheme[]) {
  setCachedJson(CUSTOM_THEME_STORAGE_KEY, themes);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createCustomThemeId(theme: Theme, existingIds: Set<string>): string {
  const base =
    `${slugify(theme.name)}-${slugify(theme.author)}`.replace(/^-+|-+$/g, '') || 'custom-theme';
  let candidate = base;
  let counter = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

export function getAllThemes(): ThemeEntry[] {
  const customEntries: ThemeEntry[] = readCustomThemes().map((entry) => ({
    id: entry.id,
    theme: entry.theme,
    source: 'custom',
  }));

  const byId = new Map<string, ThemeEntry>();
  bundledThemes.forEach((entry) => byId.set(entry.id, entry));
  customEntries.forEach((entry) => byId.set(entry.id, entry));
  return Array.from(byId.values());
}

export function getThemeById(themeId: string | null | undefined): Theme | null {
  const allThemes = getAllThemes();
  const selected = allThemes.find((entry) => entry.id === themeId);
  if (selected) return selected.theme;

  const fallback = allThemes.find((entry) => entry.id === DEFAULT_THEME_ID) ?? allThemes[0];
  return fallback?.theme ?? null;
}

export function importThemeFromJson(jsonText: string): ThemeEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Theme JSON is invalid.');
  }

  const theme = normalizeTheme(parsed);
  if (!theme) {
    throw new Error(
      'Theme JSON must be version v1 and include name, author, and a colors object with string values. Fonts are optional.',
    );
  }

  const themeWithFallback = resolveThemeWithModeFallback(theme);
  const customThemes = readCustomThemes();
  const existingIds = new Set(getAllThemes().map((entry) => entry.id));
  const id = createCustomThemeId(themeWithFallback, existingIds);
  const storedTheme: StoredTheme = { id, theme: themeWithFallback };

  customThemes.push(storedTheme);
  writeCustomThemes(customThemes);

  return {
    id,
    theme: themeWithFallback,
    source: 'custom',
  };
}

export function deleteCustomTheme(themeId: string): boolean {
  const customThemes = readCustomThemes();
  const nextCustomThemes = customThemes.filter((entry) => entry.id !== themeId);
  if (nextCustomThemes.length === customThemes.length) {
    return false;
  }

  writeCustomThemes(nextCustomThemes);
  return true;
}
