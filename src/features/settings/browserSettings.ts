export type BrowserSettings = {
  newTabPage: string;
};

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  newTabPage: 'mira://NewTab',
};

const BROWSER_SETTINGS_STORAGE_KEY = 'mira.settings.browser.v1';

function normalizeNewTabPage(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BROWSER_SETTINGS.newTabPage;

  const normalized = value.trim();
  if (!normalized) return DEFAULT_BROWSER_SETTINGS.newTabPage;

  return normalized;
}

export function normalizeBrowserSettings(value: unknown): BrowserSettings {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_BROWSER_SETTINGS;
  }

  const candidate = value as Partial<BrowserSettings>;
  return {
    newTabPage: normalizeNewTabPage(candidate.newTabPage),
  };
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

  return normalized;
}

