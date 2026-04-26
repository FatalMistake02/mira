import { DEFAULT_LAYOUT_ID } from '../layouts/layoutLoader';
import { DEFAULT_THEME_ID } from '../themes/themeLoader';
import { getCachedString, setCachedString } from '../../storage/cacheStorage';

export type TabSleepUnit = 'seconds' | 'minutes' | 'hours';
export type TabSleepMode = 'freeze' | 'discard';
export type DevToolsOpenMode = 'side' | 'window';
export type StartupRestoreBehavior = 'ask' | 'windows' | 'tabs' | 'fresh';
export type TabStripPosition = 'top' | 'left' | 'right';

export type AutoUpdateMode =
  | 'off'
  | 'ask-on-launch'
  | 'ask-on-close'
  | 'auto-on-launch'
  | 'auto-on-close';

export type SearchEngine =
  | 'google'
  | 'duckduckgo'
  | 'bing'
  | 'yahoo'
  | 'startpage'
  | 'qwant'
  | 'yandex'
  | 'brave'
  | 'ecosia';

export const SEARCH_ENGINE_OPTIONS: ReadonlyArray<{
  value: SearchEngine;
  label: string;
}> = [
  { value: 'google', label: 'Google' },
  { value: 'duckduckgo', label: 'DuckDuckGo' },
  { value: 'bing', label: 'Bing' },
  { value: 'yahoo', label: 'Yahoo' },
  { value: 'startpage', label: 'Startpage' },
  { value: 'qwant', label: 'Qwant' },
  { value: 'yandex', label: 'Yandex' },
  { value: 'brave', label: 'Brave Search' },
  { value: 'ecosia', label: 'Ecosia' },
];

export type SearchEngineShortcutChars = Record<SearchEngine, string>;

export const DEFAULT_SEARCH_ENGINE_SHORTCUT_PREFIX = '!';

export const DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS: SearchEngineShortcutChars = {
  google: 'g',
  duckduckgo: 'd',
  bing: 'b',
  yahoo: 'y',
  startpage: 's',
  qwant: 'q',
  yandex: 'a',
  brave: 'r',
  ecosia: 'e',
};

export type BrowserSettings = {
  newTabPage: string;
  themeId: string;
  rawFileDarkModeEnabled: boolean;
  animationsEnabled: boolean;
  nativeTextFieldContextMenu: boolean;
  layoutId: string;
  tabSleepValue: number;
  tabSleepUnit: TabSleepUnit;
  tabSleepMode: TabSleepMode;
  devToolsOpenMode: DevToolsOpenMode;
  adBlockEnabled: boolean;
  trackerBlockEnabled: boolean;
  quitOnLastWindowClose: boolean;
  showNewTabBranding: boolean;
  disableNewTabIntro: boolean;
  includePrereleaseUpdates: boolean;
  autoUpdateOnLaunch: AutoUpdateMode;
  runOnStartup: boolean;
  startupRestoreBehavior: StartupRestoreBehavior;
  tabStripPosition: TabStripPosition;
  searchEngine: SearchEngine;
  searchEngineShortcutsEnabled: boolean;
  searchEngineShortcutPrefix: string;
  searchEngineShortcutChars: SearchEngineShortcutChars;
  showPerfOverlay: boolean;
  dev: boolean;
  showBookmarkButton: boolean;
  showBookmarksBar: boolean;
  cookiesEnabled: boolean;
};

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  newTabPage: 'mira://NewTab',
  themeId: DEFAULT_THEME_ID,
  rawFileDarkModeEnabled: true,
  animationsEnabled: true,
  nativeTextFieldContextMenu: true,
  layoutId: DEFAULT_LAYOUT_ID,
  tabSleepValue: 3,
  tabSleepUnit: 'minutes',
  tabSleepMode: 'freeze',
  devToolsOpenMode: 'side',
  adBlockEnabled: false,
  trackerBlockEnabled: false,
  quitOnLastWindowClose: false,
  showNewTabBranding: true,
  disableNewTabIntro: false,
  includePrereleaseUpdates: false,
  autoUpdateOnLaunch: 'off',
  runOnStartup: false,
  startupRestoreBehavior: 'tabs',
  tabStripPosition: 'top',
  searchEngine: 'google',
  searchEngineShortcutsEnabled: false,
  searchEngineShortcutPrefix: DEFAULT_SEARCH_ENGINE_SHORTCUT_PREFIX,
  searchEngineShortcutChars: DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS,
  showPerfOverlay: false,
  dev: true,
  showBookmarkButton: true,
  showBookmarksBar: true,
  cookiesEnabled: true,
};

const BROWSER_SETTINGS_STORAGE_KEY = 'mira.mobile.settings.browser.v1';
const TAB_SLEEP_UNIT_TO_MS: Record<TabSleepUnit, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
};

function normalizeStringWithFallback(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeInteger(value: unknown, fallback: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.floor(value));
}

function normalizeTabSleepUnit(value: unknown): TabSleepUnit {
  return value === 'seconds' || value === 'minutes' || value === 'hours'
    ? value
    : DEFAULT_BROWSER_SETTINGS.tabSleepUnit;
}

function normalizeTabSleepMode(value: unknown): TabSleepMode {
  return value === 'freeze' || value === 'discard' ? value : DEFAULT_BROWSER_SETTINGS.tabSleepMode;
}

function normalizeDevToolsOpenMode(value: unknown): DevToolsOpenMode {
  return value === 'side' || value === 'window'
    ? value
    : DEFAULT_BROWSER_SETTINGS.devToolsOpenMode;
}

function normalizeAutoUpdateOnLaunch(value: unknown): AutoUpdateMode {
  if (typeof value === 'boolean') {
    return value ? 'ask-on-launch' : 'off';
  }

  return value === 'off'
    || value === 'ask-on-launch'
    || value === 'ask-on-close'
    || value === 'auto-on-launch'
    || value === 'auto-on-close'
    ? value
    : DEFAULT_BROWSER_SETTINGS.autoUpdateOnLaunch;
}

function normalizeStartupRestoreBehavior(value: unknown): StartupRestoreBehavior {
  return value === 'ask' || value === 'windows' || value === 'tabs' || value === 'fresh'
    ? value
    : DEFAULT_BROWSER_SETTINGS.startupRestoreBehavior;
}

function normalizeTabStripPosition(value: unknown): TabStripPosition {
  return value === 'top' || value === 'left' || value === 'right'
    ? value
    : DEFAULT_BROWSER_SETTINGS.tabStripPosition;
}

function normalizeSearchEngine(value: unknown): SearchEngine {
  return SEARCH_ENGINE_OPTIONS.some((option) => option.value === value)
    ? (value as SearchEngine)
    : DEFAULT_BROWSER_SETTINGS.searchEngine;
}

function normalizeShortcutChar(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized[0] : fallback;
}

function normalizeSearchEngineShortcutChars(value: unknown): SearchEngineShortcutChars {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Partial<Record<SearchEngine, unknown>>)
      : {};

  return {
    google: normalizeShortcutChar(source.google, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.google),
    duckduckgo: normalizeShortcutChar(
      source.duckduckgo,
      DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.duckduckgo,
    ),
    bing: normalizeShortcutChar(source.bing, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.bing),
    yahoo: normalizeShortcutChar(source.yahoo, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.yahoo),
    startpage: normalizeShortcutChar(
      source.startpage,
      DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.startpage,
    ),
    qwant: normalizeShortcutChar(source.qwant, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.qwant),
    yandex: normalizeShortcutChar(source.yandex, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.yandex),
    brave: normalizeShortcutChar(source.brave, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.brave),
    ecosia: normalizeShortcutChar(source.ecosia, DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS.ecosia),
  };
}

export function normalizeBrowserSettings(value: unknown): BrowserSettings {
  const candidate =
    typeof value === 'object' && value !== null
      ? (value as Partial<BrowserSettings>)
      : {};

  return {
    newTabPage: normalizeStringWithFallback(candidate.newTabPage, DEFAULT_BROWSER_SETTINGS.newTabPage),
    themeId: normalizeStringWithFallback(candidate.themeId, DEFAULT_BROWSER_SETTINGS.themeId),
    rawFileDarkModeEnabled: normalizeBoolean(
      candidate.rawFileDarkModeEnabled,
      DEFAULT_BROWSER_SETTINGS.rawFileDarkModeEnabled,
    ),
    animationsEnabled: normalizeBoolean(
      candidate.animationsEnabled,
      DEFAULT_BROWSER_SETTINGS.animationsEnabled,
    ),
    nativeTextFieldContextMenu: normalizeBoolean(
      candidate.nativeTextFieldContextMenu,
      DEFAULT_BROWSER_SETTINGS.nativeTextFieldContextMenu,
    ),
    layoutId: normalizeStringWithFallback(candidate.layoutId, DEFAULT_BROWSER_SETTINGS.layoutId),
    tabSleepValue: normalizeInteger(candidate.tabSleepValue, DEFAULT_BROWSER_SETTINGS.tabSleepValue, 1),
    tabSleepUnit: normalizeTabSleepUnit(candidate.tabSleepUnit),
    tabSleepMode: normalizeTabSleepMode(candidate.tabSleepMode),
    devToolsOpenMode: normalizeDevToolsOpenMode(candidate.devToolsOpenMode),
    adBlockEnabled: normalizeBoolean(candidate.adBlockEnabled, DEFAULT_BROWSER_SETTINGS.adBlockEnabled),
    trackerBlockEnabled: normalizeBoolean(
      candidate.trackerBlockEnabled,
      normalizeBoolean(candidate.adBlockEnabled, DEFAULT_BROWSER_SETTINGS.adBlockEnabled),
    ),
    quitOnLastWindowClose: normalizeBoolean(
      candidate.quitOnLastWindowClose,
      DEFAULT_BROWSER_SETTINGS.quitOnLastWindowClose,
    ),
    showNewTabBranding: normalizeBoolean(
      candidate.showNewTabBranding,
      DEFAULT_BROWSER_SETTINGS.showNewTabBranding,
    ),
    disableNewTabIntro: normalizeBoolean(
      candidate.disableNewTabIntro,
      DEFAULT_BROWSER_SETTINGS.disableNewTabIntro,
    ),
    includePrereleaseUpdates: normalizeBoolean(
      candidate.includePrereleaseUpdates,
      DEFAULT_BROWSER_SETTINGS.includePrereleaseUpdates,
    ),
    autoUpdateOnLaunch: normalizeAutoUpdateOnLaunch(candidate.autoUpdateOnLaunch),
    runOnStartup: normalizeBoolean(candidate.runOnStartup, DEFAULT_BROWSER_SETTINGS.runOnStartup),
    startupRestoreBehavior: normalizeStartupRestoreBehavior(candidate.startupRestoreBehavior),
    tabStripPosition: normalizeTabStripPosition(candidate.tabStripPosition),
    searchEngine: normalizeSearchEngine(candidate.searchEngine),
    searchEngineShortcutsEnabled: normalizeBoolean(
      candidate.searchEngineShortcutsEnabled,
      DEFAULT_BROWSER_SETTINGS.searchEngineShortcutsEnabled,
    ),
    searchEngineShortcutPrefix: normalizeStringWithFallback(
      candidate.searchEngineShortcutPrefix,
      DEFAULT_BROWSER_SETTINGS.searchEngineShortcutPrefix,
    )[0],
    searchEngineShortcutChars: normalizeSearchEngineShortcutChars(
      candidate.searchEngineShortcutChars,
    ),
    showPerfOverlay: normalizeBoolean(candidate.showPerfOverlay, DEFAULT_BROWSER_SETTINGS.showPerfOverlay),
    dev: normalizeBoolean(candidate.dev, DEFAULT_BROWSER_SETTINGS.dev),
    showBookmarkButton: normalizeBoolean(
      candidate.showBookmarkButton,
      DEFAULT_BROWSER_SETTINGS.showBookmarkButton,
    ),
    showBookmarksBar: normalizeBoolean(
      candidate.showBookmarksBar,
      DEFAULT_BROWSER_SETTINGS.showBookmarksBar,
    ),
    cookiesEnabled: normalizeBoolean(candidate.cookiesEnabled, DEFAULT_BROWSER_SETTINGS.cookiesEnabled),
  };
}

export function getTabSleepAfterMs(settings: BrowserSettings): number {
  return settings.tabSleepValue * TAB_SLEEP_UNIT_TO_MS[settings.tabSleepUnit];
}

export function getSearchUrlForQuery(query: string, engine: SearchEngine): string {
  const searchQuery = new URLSearchParams({ q: query }).toString();

  switch (engine) {
    case 'duckduckgo':
      return `https://duckduckgo.com/?${searchQuery}`;
    case 'bing':
      return `https://www.bing.com/search?${searchQuery}`;
    case 'yahoo':
      return `https://search.yahoo.com/search?${searchQuery}`;
    case 'startpage':
      return `https://www.startpage.com/sp/search?${searchQuery}`;
    case 'qwant':
      return `https://www.qwant.com/?${searchQuery}&t=web`;
    case 'yandex':
      return `https://yandex.com/search/?${searchQuery}`;
    case 'brave':
      return `https://search.brave.com/search?${searchQuery}`;
    case 'ecosia':
      return `https://www.ecosia.org/search?${searchQuery}`;
    case 'google':
    default:
      return `https://www.google.com/search?${searchQuery}`;
  }
}

export function getSearchEngineShortcuts(
  shortcutPrefix: string,
  shortcutChars: SearchEngineShortcutChars,
): Array<{ shortcut: string; engine: SearchEngine; label: string }> {
  const normalizedPrefix = normalizeStringWithFallback(
    shortcutPrefix,
    DEFAULT_SEARCH_ENGINE_SHORTCUT_PREFIX,
  )[0];
  const normalizedChars = normalizeSearchEngineShortcutChars(shortcutChars);

  return SEARCH_ENGINE_OPTIONS.map((option) => ({
    shortcut: `${normalizedPrefix}${normalizedChars[option.value]}`,
    engine: option.value,
    label: option.label,
  }));
}

export function parseSearchInput(
  input: string,
  fallbackEngine: SearchEngine,
  shortcutsEnabled: boolean,
  shortcutPrefix: string,
  shortcutChars: SearchEngineShortcutChars,
): { query: string; engine: SearchEngine } {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    return {
      query: '',
      engine: fallbackEngine,
    };
  }

  if (!shortcutsEnabled) {
    return {
      query: normalizedInput,
      engine: fallbackEngine,
    };
  }

  const shortcuts = getSearchEngineShortcuts(shortcutPrefix, shortcutChars);
  const [prefix, ...rest] = normalizedInput.split(/\s+/);
  const normalizedPrefixToken = prefix.toLowerCase();
  const shortcutMatch = shortcuts.find(
    (entry) => entry.shortcut.toLowerCase() === normalizedPrefixToken,
  );

  if (!shortcutMatch) {
    return {
      query: normalizedInput,
      engine: fallbackEngine,
    };
  }

  const queryAfterShortcut = rest.join(' ').trim();
  if (!queryAfterShortcut) {
    return {
      query: normalizedInput,
      engine: fallbackEngine,
    };
  }

  return {
    query: queryAfterShortcut,
    engine: shortcutMatch.engine,
  };
}

export function getSearchUrlFromInput(
  input: string,
  fallbackEngine: SearchEngine,
  shortcutsEnabled = true,
  shortcutPrefix = DEFAULT_SEARCH_ENGINE_SHORTCUT_PREFIX,
  shortcutChars = DEFAULT_SEARCH_ENGINE_SHORTCUT_CHARS,
): string {
  const { query, engine } = parseSearchInput(
    input,
    fallbackEngine,
    shortcutsEnabled,
    shortcutPrefix,
    shortcutChars,
  );
  return getSearchUrlForQuery(query, engine);
}

export function getBrowserSettings(): BrowserSettings {
  const raw = getCachedString(BROWSER_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_BROWSER_SETTINGS;

  try {
    return normalizeBrowserSettings(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_BROWSER_SETTINGS;
  }
}

export function saveBrowserSettings(next: Partial<BrowserSettings>): BrowserSettings {
  const normalized = normalizeBrowserSettings({
    ...getBrowserSettings(),
    ...next,
  });

  setCachedString(BROWSER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
