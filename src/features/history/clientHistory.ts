import { electron } from '../../electronBridge';

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_HISTORY_KEY = 'mira_history';

function prune(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return entries
    .filter((entry) => entry.visitedAt >= cutoff)
    .sort((a, b) => b.visitedAt - a.visitedAt);
}

function loadLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(DEV_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return prune(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function saveLocal(entries: HistoryEntry[]) {
  localStorage.setItem(DEV_HISTORY_KEY, JSON.stringify(prune(entries)));
}

export async function addHistoryEntry(url: string, title: string): Promise<void> {
  const normalized = url.trim();
  if (!normalized || normalized.startsWith('mira://')) return;

  if (electron?.ipcRenderer) {
    await electron.ipcRenderer.invoke('history-add', {
      url: normalized,
      title: title.trim() || normalized,
    });
    return;
  }

  const now = Date.now();
  const entries = loadLocal();
  const latest = entries[0];
  if (latest && latest.url === normalized && now - latest.visitedAt < 1500) {
    return;
  }

  saveLocal([
    {
      id: crypto.randomUUID(),
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

  if (electron?.ipcRenderer) {
    return !!(
      await electron.ipcRenderer.invoke<boolean>('history-update-title', {
        url: normalizedUrl,
        title: normalizedTitle,
      })
    );
  }

  const entries = loadLocal();
  const match = entries.find((entry) => entry.url === normalizedUrl);
  if (match) {
    if (match.title === normalizedTitle) return false;
    match.title = normalizedTitle;
    saveLocal(entries);
  } else {
    saveLocal([
      {
        id: crypto.randomUUID(),
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
  if (electron?.ipcRenderer) {
    const list = await electron.ipcRenderer.invoke<HistoryEntry[]>('history-list');
    return prune(Array.isArray(list) ? list : []);
  }

  const entries = loadLocal();
  saveLocal(entries);
  return entries;
}

export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) return false;

  if (electron?.ipcRenderer) {
    return !!(await electron.ipcRenderer.invoke<boolean>('history-delete', normalizedId));
  }

  const entries = loadLocal();
  const next = entries.filter((entry) => entry.id !== normalizedId);
  if (next.length === entries.length) return false;
  saveLocal(next);
  return true;
}

export async function clearHistoryEntries(): Promise<boolean> {
  if (electron?.ipcRenderer) {
    return !!(await electron.ipcRenderer.invoke<boolean>('history-clear'));
  }

  const entries = loadLocal();
  if (!entries.length) return false;
  saveLocal([]);
  return true;
}
