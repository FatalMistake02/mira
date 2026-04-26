import { getCachedJson, setCachedJson } from '../storage/cacheStorage';

export type AppState = {
  onboardingCompleted: boolean;
  lastOpenedAt: number | null;
};

const APP_STATE_STORAGE_KEY = 'mira.mobile.app-state.v1';

const DEFAULT_APP_STATE: AppState = {
  onboardingCompleted: false,
  lastOpenedAt: null,
};

export function getAppState(): AppState {
  const value = getCachedJson<AppState>(APP_STATE_STORAGE_KEY, DEFAULT_APP_STATE);
  return {
    onboardingCompleted: value.onboardingCompleted === true,
    lastOpenedAt:
      typeof value.lastOpenedAt === 'number' && Number.isFinite(value.lastOpenedAt)
        ? value.lastOpenedAt
        : null,
  };
}

export function saveAppState(next: Partial<AppState>): AppState {
  const merged: AppState = {
    ...getAppState(),
    ...next,
  };
  setCachedJson(APP_STATE_STORAGE_KEY, merged);
  return merged;
}
