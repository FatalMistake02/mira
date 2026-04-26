import AsyncStorage from '@react-native-async-storage/async-storage';

const storageCache = new Map<string, string>();
let initialized = false;
let initPromise: Promise<void> | null = null;

async function hydrateAllKeys(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  if (!keys.length) {
    initialized = true;
    return;
  }

  const entries = await AsyncStorage.multiGet(keys);
  storageCache.clear();
  for (const [key, value] of entries) {
    if (value !== null) {
      storageCache.set(key, value);
    }
  }

  initialized = true;
}

export async function initializeStorageCache(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = hydrateAllKeys().finally(() => {
      initPromise = null;
    });
  }

  await initPromise;
}

export function isStorageCacheReady(): boolean {
  return initialized;
}

export function getCachedString(key: string): string | null {
  return storageCache.get(key) ?? null;
}

export function setCachedString(key: string, value: string): void {
  storageCache.set(key, value);
  AsyncStorage.setItem(key, value).catch(() => undefined);
}

export function removeCachedString(key: string): void {
  storageCache.delete(key);
  AsyncStorage.removeItem(key).catch(() => undefined);
}

export function getCachedJson<T>(key: string, fallback: T): T {
  const raw = getCachedString(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setCachedJson(key: string, value: unknown): void {
  try {
    setCachedString(key, JSON.stringify(value));
  } catch {
    // Ignore serialization failures.
  }
}
