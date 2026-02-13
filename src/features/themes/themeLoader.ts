import type { Theme, ThemeMode } from '../../themes/types';

const modules = import.meta.glob('../../themes/*.json', { eager: true });

const CUSTOM_THEME_STORAGE_KEY = 'mira.themes.custom.v1';
export const DEFAULT_THEME_ID = 'default_dark';
const NON_SPECIFIC_BASE_COLOR_KEYS = [
  'buttonBg',
  'buttonBgHover',
  'buttonBgActive',
  'buttonText',
  'buttonTextHover',
  'buttonTextActive',
  'buttonBorder',
  'buttonBorderHover',
  'buttonBorderActive',
  'fieldBg',
  'fieldBgHover',
  'fieldBgActive',
  'fieldText',
  'fieldTextPlaceholder',
  'fieldBorder',
  'fieldBorderHover',
  'fieldBorderActive',
  'surfaceBg',
  'surfaceBgHover',
  'surfaceBgActive',
  'surfaceText',
  'surfaceTextHover',
  'surfaceTextActive',
  'surfaceBorder',
  'surfaceBorderHover',
  'surfaceBorderActive',
] as const;

type StoredTheme = { id: string; theme: Theme };

export type ThemeEntry = {
  id: string;
  theme: Theme;
  source: 'bundled' | 'custom';
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
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }

  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }

  return null;
}

function inferThemeMode(colors: Record<string, string>): 'light' | 'dark' {
  const sample = colors.bg || colors.surfaceBg || colors.tabBg || '';
  const rgb = parseHexColor(sample);
  if (!rgb) return 'dark';

  // Relative luminance approximation (sRGB)
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.5 ? 'light' : 'dark';
}

function normalizeTheme(value: unknown): Theme | null {
  if (!isRecord(value)) return null;

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const author = typeof value.author === 'string' ? value.author.trim() : '';
  if (!name || !author) return null;

  if (!isRecord(value.colors)) return null;

  const colors: Record<string, string> = {};
  Object.entries(value.colors).forEach(([key, raw]) => {
    if (!key || typeof raw !== 'string') return;
    colors[key] = raw;
  });

  if (!Object.keys(colors).length) return null;
  const modeRaw = typeof value.mode === 'string' ? value.mode.trim().toLowerCase() : '';
  const mode = modeRaw === 'light' || modeRaw === 'dark' ? modeRaw : inferThemeMode(colors);

  return {
    name,
    author,
    mode,
    colors,
  };
}

function applyModeBaseColorFallback(
  theme: Theme,
  baseColorsByMode: Record<ThemeMode, Record<string, string>>,
): Theme {
  const base = baseColorsByMode[theme.mode] ?? {};
  const colors: Record<string, string> = { ...theme.colors };

  for (const key of NON_SPECIFIC_BASE_COLOR_KEYS) {
    const currentValue = colors[key];
    if (typeof currentValue === 'string' && currentValue.trim()) continue;

    const fallbackValue = base[key];
    if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
      colors[key] = fallbackValue;
    }
  }

  return {
    ...theme,
    colors,
  };
}

function moduleToTheme(moduleValue: unknown): Theme | null {
  if (!isRecord(moduleValue)) return normalizeTheme(moduleValue);

  if ('default' in moduleValue) {
    return normalizeTheme(moduleValue.default);
  }

  return normalizeTheme(moduleValue);
}

function pathToThemeId(path: string): string | null {
  const match = path.match(/\/([^/]+)\.json$/);
  if (!match) return null;
  return match[1].trim();
}

const bundledThemesRaw: ThemeEntry[] = Object.entries(modules).flatMap(([path, moduleValue]) => {
  const id = pathToThemeId(path);
  const theme = moduleToTheme(moduleValue);
  if (!id || !theme) return [];
  return [{ id, theme, source: 'bundled' as const }];
});

const defaultDarkBaseColors =
  bundledThemesRaw.find((entry) => entry.id === 'default_dark')?.theme.colors ?? {};
const defaultLightBaseColors =
  bundledThemesRaw.find((entry) => entry.id === 'default_light')?.theme.colors ?? {};
const baseColorsByMode: Record<ThemeMode, Record<string, string>> = {
  dark: Object.keys(defaultDarkBaseColors).length ? defaultDarkBaseColors : defaultLightBaseColors,
  light: Object.keys(defaultLightBaseColors).length ? defaultLightBaseColors : defaultDarkBaseColors,
};

const bundledThemes: ThemeEntry[] = bundledThemesRaw.map((entry) => ({
  ...entry,
  theme: applyModeBaseColorFallback(entry.theme, baseColorsByMode),
}));

function readCustomThemes(): StoredTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const theme = normalizeTheme(entry.theme);
        if (!id || !theme) return null;
        return { id, theme: applyModeBaseColorFallback(theme, baseColorsByMode) };
      })
      .filter((entry): entry is StoredTheme => entry !== null);
  } catch {
    return [];
  }
}

function writeCustomThemes(themes: StoredTheme[]) {
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // Ignore storage failures.
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createCustomThemeId(theme: Theme, existingIds: Set<string>): string {
  const base = `${slugify(theme.name)}-${slugify(theme.author)}`.replace(/^-+|-+$/g, '') || 'custom-theme';
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
    throw new Error('Theme JSON must include name, author, and a colors object with string values.');
  }
  const themeWithFallback = applyModeBaseColorFallback(theme, baseColorsByMode);

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
