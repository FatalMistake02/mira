import { DEFAULT_THEME_ID } from '../themes/themeLoader';
import { DEFAULT_LAYOUT_ID } from '../layouts/layoutLoader';

export type TabSleepUnit = 'seconds' | 'minutes' | 'hours';
export type TabSleepMode = 'freeze' | 'discard';
export type DevToolsOpenMode = 'side' | 'window';

export type BrowserSettings = {
  newTabPage: string;
  themeId: string;
  rawFileDarkModeEnabled: boolean;
  layoutId: string;
  tabSleepValue: number;
  tabSleepUnit: TabSleepUnit;
  tabSleepMode: TabSleepMode;
  devToolsOpenMode: DevToolsOpenMode;
  adBlockEnabled: boolean;
  quitOnLastWindowClose: boolean;
  showNewTabBranding: boolean;
  disableNewTabIntro: boolean;
  includePrereleaseUpdates: boolean;
  autoUpdateOnLaunch: boolean;
  runOnStartup: boolean;
};

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  newTabPage: 'mira://NewTab',
  themeId: DEFAULT_THEME_ID,
  rawFileDarkModeEnabled: true,
  layoutId: DEFAULT_LAYOUT_ID,
  tabSleepValue: 10,
  tabSleepUnit: 'minutes',
  tabSleepMode: 'freeze',
  devToolsOpenMode: 'side',
  adBlockEnabled: false,
  quitOnLastWindowClose: false,
  showNewTabBranding: false,
  disableNewTabIntro: false,
  includePrereleaseUpdates: false,
  autoUpdateOnLaunch: false,
  runOnStartup: false,
};

const BROWSER_SETTINGS_STORAGE_KEY = 'mira.settings.browser.v1';
export const BROWSER_SETTINGS_CHANGED_EVENT = 'mira:settings-changed';

const TAB_SLEEP_UNIT_TO_MS: Record<TabSleepUnit, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
};

function normalizeNewTabPage(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BROWSER_SETTINGS.newTabPage;

  const normalized = value.trim();
  if (!normalized) return DEFAULT_BROWSER_SETTINGS.newTabPage;

  return normalized;
}

function normalizeThemeId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BROWSER_SETTINGS.themeId;

  const normalized = value.trim();
  if (!normalized) return DEFAULT_BROWSER_SETTINGS.themeId;

  return normalized;
}

function normalizeRawFileDarkModeEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.rawFileDarkModeEnabled;
  }

  return value;
}

function normalizeTabSleepValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BROWSER_SETTINGS.tabSleepValue;
  }

  const normalized = Math.max(1, Math.floor(value));
  return normalized;
}

function normalizeTabSleepUnit(value: unknown): TabSleepUnit {
  if (value === 'seconds' || value === 'minutes' || value === 'hours') {
    return value;
  }

  return DEFAULT_BROWSER_SETTINGS.tabSleepUnit;
}

function normalizeTabSleepMode(value: unknown): TabSleepMode {
  if (value === 'freeze' || value === 'discard') {
    return value;
  }

  return DEFAULT_BROWSER_SETTINGS.tabSleepMode;
}

function normalizeDevToolsOpenMode(value: unknown): DevToolsOpenMode {
  if (value === 'side' || value === 'window') {
    return value;
  }

  return DEFAULT_BROWSER_SETTINGS.devToolsOpenMode;
}

function normalizeAdBlockEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.adBlockEnabled;
  }

  return value;
}

function normalizeQuitOnLastWindowClose(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.quitOnLastWindowClose;
  }

  return value;
}

function normalizeLayoutId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BROWSER_SETTINGS.layoutId;

  const normalized = value.trim();
  if (!normalized) return DEFAULT_BROWSER_SETTINGS.layoutId;

  return normalized;
}

function normalizeDisableNewTabIntro(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.disableNewTabIntro;
  }

  return value;
}

function normalizeShowNewTabBranding(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.showNewTabBranding;
  }

  return value;
}

function normalizeIncludePrereleaseUpdates(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.includePrereleaseUpdates;
  }

  return value;
}

function normalizeAutoUpdateOnLaunch(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.autoUpdateOnLaunch;
  }

  return value;
}

function normalizeRunOnStartup(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return DEFAULT_BROWSER_SETTINGS.runOnStartup;
  }

  return value;
}

export function normalizeBrowserSettings(value: unknown): BrowserSettings {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_BROWSER_SETTINGS;
  }

  const candidate = value as Partial<BrowserSettings>;
  return {
    newTabPage: normalizeNewTabPage(candidate.newTabPage),
    themeId: normalizeThemeId(candidate.themeId),
    rawFileDarkModeEnabled: normalizeRawFileDarkModeEnabled(candidate.rawFileDarkModeEnabled),
    layoutId: normalizeLayoutId(candidate.layoutId),
    tabSleepValue: normalizeTabSleepValue(candidate.tabSleepValue),
    tabSleepUnit: normalizeTabSleepUnit(candidate.tabSleepUnit),
    tabSleepMode: normalizeTabSleepMode(candidate.tabSleepMode),
    devToolsOpenMode: normalizeDevToolsOpenMode(candidate.devToolsOpenMode),
    adBlockEnabled: normalizeAdBlockEnabled(candidate.adBlockEnabled),
    quitOnLastWindowClose: normalizeQuitOnLastWindowClose(candidate.quitOnLastWindowClose),
    showNewTabBranding: normalizeShowNewTabBranding(candidate.showNewTabBranding),
    disableNewTabIntro: normalizeDisableNewTabIntro(candidate.disableNewTabIntro),
    includePrereleaseUpdates: normalizeIncludePrereleaseUpdates(
      candidate.includePrereleaseUpdates,
    ),
    autoUpdateOnLaunch: normalizeAutoUpdateOnLaunch(candidate.autoUpdateOnLaunch),
    runOnStartup: normalizeRunOnStartup(candidate.runOnStartup),
  };
}

export function getTabSleepAfterMs(settings: BrowserSettings): number {
  return settings.tabSleepValue * TAB_SLEEP_UNIT_TO_MS[settings.tabSleepUnit];
}

export function getBrowserSettings(): BrowserSettings {
  try {
    const raw = localStorage.getItem(BROWSER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_BROWSER_SETTINGS;

    const parsed = JSON.parse(raw) as unknown;
    return normalizeBrowserSettings(parsed);
  } catch {
    return DEFAULT_BROWSER_SETTINGS;
  }
}

export function saveBrowserSettings(next: Partial<BrowserSettings>): BrowserSettings {
  const merged = {
    ...getBrowserSettings(),
    ...next,
  };
  const normalized = normalizeBrowserSettings(merged);

  try {
    localStorage.setItem(BROWSER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures and still return normalized values.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BROWSER_SETTINGS_CHANGED_EVENT, { detail: normalized }));
  }

  return normalized;
}
