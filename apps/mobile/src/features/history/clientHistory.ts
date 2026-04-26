import { createId } from '../../app/ids';
import { getCachedJson, setCachedJson } from '../../storage/cacheStorage';

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_STORAGE_KEY = 'mira.mobile.history.v1';

function prune(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return entries
    .filter((entry) => entry.visitedAt >= cutoff)
    .sort((left, right) => right.visitedAt - left.visitedAt);
}

function loadLocal(): HistoryEntry[] {
  const parsed = getCachedJson<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);
  return prune(Array.isArray(parsed) ? parsed : []);
}

function saveLocal(entries: HistoryEntry[]) {
  setCachedJson(HISTORY_STORAGE_KEY, prune(entries));
}

export async function addHistoryEntry(url: string, title: string): Promise<void> {
  const normalized = url.trim();
  if (!normalized || normalized.startsWith('mira://')) return;

  const now = Date.now();
  const entries = loadLocal();
  const latest = entries[0];
  if (latest && latest.url === normalized && now - latest.visitedAt < 1500) {
    return;
  }

  saveLocal([
    {
      id: createId('history'),
      url: normalized,
      title: title.trim() || normalized,
      visitedAt: now,
    },
    ...entries,
  ]);
}

export async function updateHistoryEntryTitle(url: string, title: string): Promise<boolean> {
  const normalizedUrl = url.trim();
  const normalizedTitle = title.trim();
  if (!normalizedUrl || normalizedUrl.startsWith('mira://') || !normalizedTitle) return false;
  if (normalizedTitle === normalizedUrl) return false;

  const entries = loadLocal();
  const match = entries.find((entry) => entry.url === normalizedUrl);
  if (match) {
    if (match.title === normalizedTitle) return false;
    match.title = normalizedTitle;
    saveLocal(entries);
  } else {
    saveLocal([
      {
        id: createId('history'),
        url: normalizedUrl,
        title: normalizedTitle,
        visitedAt: Date.now(),
      },
      ...entries,
    ]);
  }

  return true;
}

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  const entries = loadLocal();
  saveLocal(entries);
  return entries;
}

export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) return false;

  const entries = loadLocal();
  const next = entries.filter((entry) => entry.id !== normalizedId);
  if (next.length === entries.length) return false;
  saveLocal(next);
  return true;
}

export async function clearHistoryEntries(): Promise<boolean> {
  const entries = loadLocal();
  if (!entries.length) return false;
  saveLocal([]);
  return true;
}
