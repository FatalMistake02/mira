import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell, session } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { DownloadItem, WebContents } from 'electron';
import { promises as fs, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Store active downloads by ID
const downloadMap = new Map<string, DownloadItem>();
const downloadWindowById = new Map<string, number>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const isMacOS = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

interface TabSessionSnapshot {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  history: string[];
  historyIndex: number;
  reloadToken: number;
  isSleeping: boolean;
  lastActiveAt: number;
}

interface WindowSessionSnapshot {
  tabs: TabSessionSnapshot[];
  activeId: string;
  savedAt: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized?: boolean;
  isFullScreen?: boolean;
}

interface PersistedSessionSnapshot {
  windows: WindowSessionSnapshot[];
  savedAt: number;
}

type SessionRestoreMode = 'tabs' | 'windows';

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

interface UpdateCheckResult {
  mode: 'portable' | 'installer';
  currentVersion: string;
  latestVersion: string;
  latestIsPrerelease: boolean;
  hasUpdate: boolean;
  releaseName: string;
  assetName: string;
  downloadUrl: string;
}

let historyCache: HistoryEntry[] = [];
const OPEN_TAB_DEDUPE_WINDOW_MS = 500;
const recentOpenTabByHost = new Map<number, { url: string; openedAt: number }>();
const NEW_WINDOW_SHORTCUT_DEDUPE_MS = 250;
const recentNewWindowShortcutByWindow = new Map<number, number>();
const windowSessionCache = new Map<number, WindowSessionSnapshot>();
const bootRestoreByWindowId = new Map<number, WindowSessionSnapshot>();
let pendingRestoreSession: PersistedSessionSnapshot | null = null;
let sessionPersistTimer: NodeJS.Timeout | null = null;
const pendingClosedWindowCleanupTimers = new Map<number, NodeJS.Timeout>();
let isQuitting = false;
let adBlockEnabled = true;
let quitOnLastWindowClose = false;
const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/FatalMistake02/mira/releases?per_page=40';
const isPortableBuild = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE;
const AD_BLOCK_CACHE_FILE = 'adblock-hosts-v1.txt';
const AD_BLOCK_FETCH_TIMEOUT_MS = 15000;
const AD_BLOCK_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BLOCKED_AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adnxs.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'adsrvr.org',
  'scorecardresearch.com',
  'zedo.com',
  'adform.net',
];
const AD_BLOCK_LIST_URLS = [
  // Widely used in Pi-hole setups
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
  // Common Pi-hole community list
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/hosts/light.txt',
];
let blockedAdHosts = new Set<string>(DEFAULT_BLOCKED_AD_HOSTS);

function isRestorableSessionTabUrl(url: string): boolean {
  return url.trim().toLowerCase() !== 'mira://newtab';
}

function sanitizeUserAgent(userAgent: string): string {
  return userAgent.replace(/\sElectron\/[^\s)]+/g, '').trim();
}

function getAdBlockCachePath(): string {
  return path.join(app.getPath('userData'), AD_BLOCK_CACHE_FILE);
}

function isValidHostnameToken(token: string): boolean {
  if (!token.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(token)) return false;
  if (token.startsWith('.') || token.endsWith('.')) return false;
  if (token.includes('..')) return false;
  return true;
}

function normalizeBlockedHostToken(token: string): string | null {
  const normalized = token.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return null;
  if (normalized === 'localhost' || normalized === 'local') return null;
  if (!isValidHostnameToken(normalized)) return null;
  return normalized;
}

function extractHostFromBlocklistLine(line: string): string | null {
  const withoutComment = line.split('#', 1)[0]?.trim() ?? '';
  if (!withoutComment) return null;
  if (withoutComment.startsWith('!')) return null;

  const parts = withoutComment.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  const first = parts[0].toLowerCase();
  const hostToken =
    first === '0.0.0.0' ||
    first === '127.0.0.1' ||
    first === '::' ||
    first === '::1' ||
    first === '0:0:0:0:0:0:0:1'
      ? parts[1]
      : parts[0];
  if (!hostToken) return null;

  return normalizeBlockedHostToken(hostToken);
}

function parseHostsFromBlocklist(raw: string): Set<string> {
  const parsed = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const host = extractHostFromBlocklistLine(line);
    if (host) parsed.add(host);
  }

  return parsed;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadCachedAdBlockHosts(): Promise<void> {
  try {
    const raw = await fs.readFile(getAdBlockCachePath(), 'utf-8');
    const cachedHosts = parseHostsFromBlocklist(raw);
    if (!cachedHosts.size) return;

    blockedAdHosts = new Set([...DEFAULT_BLOCKED_AD_HOSTS, ...cachedHosts]);
  } catch {
    // No cache yet.
  }
}

async function refreshAdBlockHostsFromLists(): Promise<void> {
  const downloadedHosts = new Set<string>();

  for (const listUrl of AD_BLOCK_LIST_URLS) {
    try {
      const listText = await fetchTextWithTimeout(listUrl, AD_BLOCK_FETCH_TIMEOUT_MS);
      const parsedHosts = parseHostsFromBlocklist(listText);
      for (const host of parsedHosts) {
        downloadedHosts.add(host);
      }
    } catch {
      // Ignore single-list failures and continue with remaining lists.
    }
  }

  if (!downloadedHosts.size) return;

  blockedAdHosts = new Set([...DEFAULT_BLOCKED_AD_HOSTS, ...downloadedHosts]);
  try {
    await fs.writeFile(getAdBlockCachePath(), Array.from(downloadedHosts).join('\n'), 'utf-8');
  } catch {
    // Cache write failures should not disable blocking.
  }
}

function scheduleAdBlockListRefresh(): void {
  void refreshAdBlockHostsFromLists();
  const interval = setInterval(() => {
    void refreshAdBlockHostsFromLists();
  }, AD_BLOCK_REFRESH_INTERVAL_MS);
  interval.unref();
}

function isHostBlocked(hostname: string): boolean {
  let candidate = hostname;
  while (candidate) {
    if (blockedAdHosts.has(candidate)) return true;
    const nextDot = candidate.indexOf('.');
    if (nextDot === -1) return false;
    candidate = candidate.slice(nextDot + 1);
  }
  return false;
}

function shouldBlockRequest(url: string, resourceType: string): boolean {
  if (!adBlockEnabled) return false;
  if (resourceType === 'mainFrame') return false;

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return isHostBlocked(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getHistoryFilePath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function getSessionFilePath() {
  return path.join(app.getPath('userData'), 'session.json');
}

function pruneHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return entries
    .filter((entry) => entry.visitedAt >= cutoff)
    .sort((a, b) => b.visitedAt - a.visitedAt);
}

async function persistHistory() {
  await fs.writeFile(getHistoryFilePath(), JSON.stringify(historyCache, null, 2), 'utf-8');
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(getHistoryFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as HistoryEntry[];
    historyCache = pruneHistory(Array.isArray(parsed) ? parsed : []);
    await persistHistory();
  } catch {
    historyCache = [];
  }
}

async function addHistoryEntry(payload: { url?: string; title?: string }) {
  const url = payload.url?.trim();
  if (!url || url.startsWith('mira://')) return;

  const now = Date.now();
  const title = payload.title?.trim() || url;
  const latest = historyCache[0];

  if (latest && latest.url === url && now - latest.visitedAt < 1500) {
    return;
  }

  historyCache = pruneHistory([
    {
      id: uuidv4(),
      url,
      title,
      visitedAt: now,
    },
    ...historyCache,
  ]);

  await persistHistory();
}

async function updateHistoryEntryTitle(payload: { url?: string; title?: string }): Promise<boolean> {
  const url = payload.url?.trim();
  const title = payload.title?.trim();
  if (!url || !title || title === url) return false;

  const match = historyCache.find((entry) => entry.url === url);
  if (match) {
    if (match.title === title) return false;
    match.title = title;
  } else {
    historyCache = pruneHistory([
      {
        id: uuidv4(),
        url,
        title,
        visitedAt: Date.now(),
      },
      ...historyCache,
    ]);
  }

  await persistHistory();
  return true;
}

async function deleteHistoryEntry(id: string): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) return false;

  const next = historyCache.filter((entry) => entry.id !== normalizedId);
  if (next.length === historyCache.length) return false;

  historyCache = next;
  await persistHistory();
  return true;
}

async function clearHistory(): Promise<boolean> {
  if (!historyCache.length) return false;
  historyCache = [];
  await persistHistory();
  return true;
}

function normalizeTabSessionSnapshot(value: unknown): TabSessionSnapshot | null {
  if (typeof value !== 'object' || !value) return null;
  const candidate = value as Record<string, unknown>;

  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : url;
  const historyRaw = Array.isArray(candidate.history) ? candidate.history : [];
  const history = historyRaw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!id || !url || !history.length) return null;
  if (!isRestorableSessionTabUrl(url)) return null;

  const historyIndexRaw =
    typeof candidate.historyIndex === 'number' && Number.isFinite(candidate.historyIndex)
      ? Math.floor(candidate.historyIndex)
      : history.length - 1;
  const historyIndex = Math.min(Math.max(historyIndexRaw, 0), history.length - 1);

  return {
    id,
    url,
    title: title || url,
    favicon:
      typeof candidate.favicon === 'string' && candidate.favicon.trim()
        ? candidate.favicon.trim()
        : undefined,
    history,
    historyIndex,
    reloadToken:
      typeof candidate.reloadToken === 'number' && Number.isFinite(candidate.reloadToken)
        ? candidate.reloadToken
        : 0,
    isSleeping: candidate.isSleeping === true,
    lastActiveAt:
      typeof candidate.lastActiveAt === 'number' && Number.isFinite(candidate.lastActiveAt)
        ? candidate.lastActiveAt
        : Date.now(),
  };
}

function normalizeWindowSessionSnapshot(value: unknown): WindowSessionSnapshot | null {
  if (typeof value !== 'object' || !value) return null;
  const candidate = value as Record<string, unknown>;
  const tabsRaw = Array.isArray(candidate.tabs) ? candidate.tabs : [];
  const tabs = tabsRaw
    .map((tab) => normalizeTabSessionSnapshot(tab))
    .filter((tab): tab is TabSessionSnapshot => tab !== null);
  if (!tabs.length) return null;

  const activeIdRaw = typeof candidate.activeId === 'string' ? candidate.activeId : tabs[0].id;
  const activeId = tabs.some((tab) => tab.id === activeIdRaw) ? activeIdRaw : tabs[0].id;

  const boundsCandidate =
    typeof candidate.bounds === 'object' && candidate.bounds
      ? (candidate.bounds as Record<string, unknown>)
      : null;
  const x = typeof boundsCandidate?.x === 'number' ? boundsCandidate.x : NaN;
  const y = typeof boundsCandidate?.y === 'number' ? boundsCandidate.y : NaN;
  const width = typeof boundsCandidate?.width === 'number' ? boundsCandidate.width : NaN;
  const height = typeof boundsCandidate?.height === 'number' ? boundsCandidate.height : NaN;
  const hasValidBounds =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 320 &&
    height >= 240;

  return {
    tabs,
    activeId,
    savedAt:
      typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt)
        ? candidate.savedAt
        : Date.now(),
    bounds: hasValidBounds ? { x, y, width, height } : undefined,
    isMaximized: candidate.isMaximized === true,
    isFullScreen: candidate.isFullScreen === true,
  };
}

function mergeRestoreWindowsIntoSingleSnapshot(
  windows: WindowSessionSnapshot[],
): WindowSessionSnapshot | null {
  if (!windows.length) return null;

  const mergedTabs: TabSessionSnapshot[] = [];
  const usedIds = new Set<string>();

  for (const windowSnapshot of windows) {
    for (const tab of windowSnapshot.tabs) {
      const nextId = usedIds.has(tab.id) ? uuidv4() : tab.id;
      usedIds.add(nextId);
      mergedTabs.push({ ...tab, id: nextId });
    }
  }

  if (!mergedTabs.length) return null;

  const preferredActiveId = windows[0]?.activeId ?? mergedTabs[0].id;
  const activeId = mergedTabs.some((tab) => tab.id === preferredActiveId)
    ? preferredActiveId
    : mergedTabs[0].id;

  return {
    tabs: mergedTabs,
    activeId,
    savedAt: Date.now(),
  };
}

function collectPersistedSessionSnapshot(): PersistedSessionSnapshot | null {
  const windows = Array.from(windowSessionCache.values())
    .filter((entry) => entry.tabs.length > 0)
    .sort((a, b) => b.savedAt - a.savedAt);
  if (!windows.length) return null;
  return { windows, savedAt: Date.now() };
}

async function persistSessionSnapshot(): Promise<void> {
  const snapshot = collectPersistedSessionSnapshot();
  if (!snapshot) {
    await clearPersistedSessionSnapshot();
    return;
  }
  await fs.writeFile(getSessionFilePath(), JSON.stringify(snapshot, null, 2), 'utf-8');
}

function persistSessionSnapshotSync(): void {
  const snapshot = collectPersistedSessionSnapshot();
  if (!snapshot) {
    try {
      unlinkSync(getSessionFilePath());
    } catch {
      // Ignore missing session snapshot file.
    }
    return;
  }

  try {
    writeFileSync(getSessionFilePath(), JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch {
    // Ignore sync persistence failures during shutdown.
  }
}

function scheduleSessionPersist(): void {
  if (sessionPersistTimer) {
    clearTimeout(sessionPersistTimer);
  }
  sessionPersistTimer = setTimeout(() => {
    void persistSessionSnapshot();
    sessionPersistTimer = null;
  }, 300);
  sessionPersistTimer.unref();
}

async function loadPersistedSessionSnapshot(): Promise<void> {
  try {
    const raw = await fs.readFile(getSessionFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || !parsed) return;
    const candidate = parsed as Record<string, unknown>;
    const windowsRaw = Array.isArray(candidate.windows) ? candidate.windows : [];
    const windows = windowsRaw
      .map((entry) => normalizeWindowSessionSnapshot(entry))
      .filter((entry): entry is WindowSessionSnapshot => entry !== null);
    if (!windows.length) return;
    pendingRestoreSession = {
      windows,
      savedAt:
        typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt)
          ? candidate.savedAt
          : Date.now(),
    };
  } catch {
    pendingRestoreSession = null;
  }
}

async function clearPersistedSessionSnapshot(): Promise<void> {
  try {
    await fs.unlink(getSessionFilePath());
  } catch {
    // Ignore missing session snapshot file.
  }
}

function normalizeSemver(rawVersion: string): string {
  return rawVersion.trim().replace(/^[vV]/, '');
}

function parseSemverParts(rawVersion: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
} | null {
  const normalized = normalizeSemver(rawVersion);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function compareSemver(left: string, right: string): number {
  const a = parseSemverParts(left);
  const b = parseSemverParts(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  if (a.prerelease === b.prerelease) return 0;
  return a.prerelease > b.prerelease ? 1 : -1;
}

function pickInstallerAsset(release: GitHubRelease): GitHubReleaseAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (!assets.length) return null;

  if (process.platform === 'win32') {
    const setup = assets.find(
      (asset) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().includes('-win-setup.') &&
        asset.name.toLowerCase().endsWith('.exe'),
    );
    return setup ?? null;
  }

  if (process.platform === 'darwin') {
    const dmg = assets.find(
      (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.dmg'),
    );
    if (dmg) return dmg;
    const zip = assets.find(
      (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.zip'),
    );
    return zip ?? null;
  }

  return null;
}

function pickPortableAsset(release: GitHubRelease): GitHubReleaseAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (!assets.length) return null;

  if (process.platform === 'win32') {
    const portable = assets.find(
      (asset) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().includes('-win.') &&
        !asset.name.toLowerCase().includes('-win-setup.') &&
        asset.name.toLowerCase().endsWith('.exe'),
    );
    return portable ?? null;
  }

  return null;
}

async function fetchReleases(includePrerelease: boolean): Promise<GitHubRelease[]> {
  const response = await fetch(GITHUB_RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mira-updater',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to check updates (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];

  const releases = payload.filter((entry): entry is GitHubRelease => typeof entry === 'object' && !!entry);
  return releases
    .filter((release) => !release.draft)
    .filter((release) => includePrerelease || !release.prerelease);
}

function pickLatestRelease(releases: GitHubRelease[]): GitHubRelease | null {
  if (!releases.length) return null;

  const sorted = [...releases].sort((left, right) => {
    const leftTag = typeof left.tag_name === 'string' ? left.tag_name : '';
    const rightTag = typeof right.tag_name === 'string' ? right.tag_name : '';
    const semverComparison = compareSemver(leftTag, rightTag);
    if (semverComparison !== 0) return -semverComparison;

    const leftPublished = Date.parse(left.published_at ?? '');
    const rightPublished = Date.parse(right.published_at ?? '');
    return Number.isFinite(rightPublished) && Number.isFinite(leftPublished)
      ? rightPublished - leftPublished
      : 0;
  });
  return sorted[0] ?? null;
}

async function checkForUpdates(includePrerelease: boolean): Promise<UpdateCheckResult | null> {
  const releases = await fetchReleases(includePrerelease);
  const latestRelease = pickLatestRelease(releases);
  if (!latestRelease) return null;

  const latestTag = typeof latestRelease.tag_name === 'string' ? latestRelease.tag_name : '';
  const latestVersion = normalizeSemver(latestTag);
  const currentVersion = normalizeSemver(app.getVersion());
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

  const mode: 'portable' | 'installer' = isPortableBuild ? 'portable' : 'installer';
  const asset = mode === 'portable' ? pickPortableAsset(latestRelease) : pickInstallerAsset(latestRelease);
  if (!asset?.name || !asset.browser_download_url) {
    return null;
  }

  return {
    mode,
    currentVersion,
    latestVersion,
    latestIsPrerelease: latestRelease.prerelease === true,
    hasUpdate,
    releaseName: latestRelease.name?.trim() || latestTag || latestVersion,
    assetName: asset.name,
    downloadUrl: asset.browser_download_url,
  };
}

async function downloadAssetToDownloads(downloadUrl: string, assetName: string): Promise<string> {
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'mira-updater',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Failed to download update (HTTP ${response.status}).`);
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());
  const targetPath = path.join(app.getPath('downloads'), assetName);
  await fs.writeFile(targetPath, fileBuffer);
  return targetPath;
}

function setupHistoryHandlers() {
  ipcMain.handle('history-add', async (_, payload: { url?: string; title?: string }) => {
    await addHistoryEntry(payload ?? {});
    return true;
  });

  ipcMain.handle('history-list', async () => {
    historyCache = pruneHistory(historyCache);
    await persistHistory();
    return historyCache;
  });

  ipcMain.handle('history-update-title', async (_, payload: { url?: string; title?: string }) => {
    return updateHistoryEntryTitle(payload ?? {});
  });

  ipcMain.handle('history-delete', async (_, id: string) => {
    return deleteHistoryEntry(typeof id === 'string' ? id : '');
  });

  ipcMain.handle('history-clear', async () => {
    return clearHistory();
  });
}

function setupDownloadHandlers() {
  const ses = session.defaultSession;

  const pickTargetWindow = (downloadId: string, sourceContents?: WebContents | null): BrowserWindow | null => {
    const sourceWindowId = downloadWindowById.get(downloadId);
    const sourceWindow = sourceWindowId ? BrowserWindow.fromId(sourceWindowId) : null;
    if (sourceWindow && !sourceWindow.isDestroyed()) return sourceWindow;

    const sourceFromContents = sourceContents ? BrowserWindow.fromWebContents(sourceContents) : null;
    if (sourceFromContents && !sourceFromContents.isDestroyed()) return sourceFromContents;

    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && !focusedWindow.isDestroyed()) return focusedWindow;

    const firstAliveWindow = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null;
    return firstAliveWindow;
  };

  const sendDownloadEvent = (
    downloadId: string,
    channel: string,
    payload: Record<string, unknown>,
    sourceContents?: WebContents | null,
  ) => {
    const targetWindow = pickTargetWindow(downloadId, sourceContents);
    if (!targetWindow) return;
    targetWindow.webContents.send(channel, payload);
  };

  // Every download gets a UUID so the renderer can track it
  ses.on('will-download', (event, item, webContents) => {
    const downloadId = uuidv4(); // unique id for this download
    const filename = item.getFilename();
    const sourceWindow = BrowserWindow.fromWebContents(webContents ?? event.sender);

    // Store the download item so we can cancel it later
    downloadMap.set(downloadId, item);
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      downloadWindowById.set(downloadId, sourceWindow.id);
    }

    // Tell the renderer a new download started
    sendDownloadEvent(
      downloadId,
      'download-start',
      {
      id: downloadId,
      url: item.getURL(),
      filename,
      totalBytes: item.getTotalBytes(),
      },
      webContents ?? event.sender,
    );

    // Progress updates
    item.on('updated', (_, state) => {
      if (state === 'interrupted') {
        sendDownloadEvent(downloadId, 'download-error', {
          id: downloadId,
          error: 'interrupted',
        });
        return;
      }
      sendDownloadEvent(downloadId, 'download-progress', {
        id: downloadId,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
    });

    // Finished
    item.once('done', (e, state) => {
      // Clean up the map
      downloadMap.delete(downloadId);
      downloadWindowById.delete(downloadId);

      if (state === 'completed') {
        sendDownloadEvent(downloadId, 'download-done', {
          id: downloadId,
          savePath: item.getSavePath(),
        });
      } else {
        sendDownloadEvent(downloadId, 'download-error', {
          id: downloadId,
          error: state,
        });
      }
    });

    // Make the save dialog appear (optional)
    // item.setSaveDialogOptions({ title: 'Save file' });
  });

  // Renderer wants to cancel a download
  ipcMain.handle('download-cancel', async (_, id: string) => {
    const item = downloadMap.get(id);
    if (item && item.getState() === 'progressing') {
      item.cancel();
      downloadMap.delete(id);
      downloadWindowById.delete(id);
      return true;
    }
    return false;
  });

  // Open file/folder from renderer
  ipcMain.handle('download-open', async (_, savePath: string) => {
    await shell.showItemInFolder(savePath);
  });
}

function setupWebviewTabOpenHandler() {
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() !== 'devtools') {
      const currentUserAgent = contents.getUserAgent();
      const sanitized = sanitizeUserAgent(currentUserAgent);
      if (sanitized && sanitized !== currentUserAgent) {
        contents.setUserAgent(sanitized);
      }
    }

    const host = contents.hostWebContents;
    if (!host) return;

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      const key = input.key.toLowerCase();
      const isPrimaryChord = (input.control || input.meta) && !input.shift;
      const isNewWindowChord = isPrimaryChord && key === 'n';

      if (!isNewWindowChord) return;

      event.preventDefault();
      const hostWindow = BrowserWindow.fromWebContents(host);
      if (!hostWindow || hostWindow.isDestroyed()) return;
      triggerNewWindowFromShortcut(hostWindow);
    });

    contents.on('context-menu', (event, params) => {
      const linkUrl = (params.linkURL ?? '').trim();
      if (!linkUrl) return;

      const hostWindow = BrowserWindow.fromWebContents(host);
      if (!hostWindow || hostWindow.isDestroyed()) return;

      const menu = Menu.buildFromTemplate([
        {
          label: 'Open Link in New Window',
          click: () => {
            createWindow(hostWindow, linkUrl);
          },
        },
      ]);
      menu.popup({ window: hostWindow });
    });

    contents.setWindowOpenHandler(({ url }) => {
      const normalized = (url ?? '').trim();
      if (!normalized || normalized === 'about:blank') {
        return { action: 'deny' };
      }

      const now = Date.now();
      const last = recentOpenTabByHost.get(host.id);
      const isDuplicate =
        !!last && last.url === normalized && now - last.openedAt < OPEN_TAB_DEDUPE_WINDOW_MS;

      if (host && !host.isDestroyed() && !isDuplicate) {
        recentOpenTabByHost.set(host.id, { url: normalized, openedAt: now });
        host.send('open-url-in-new-tab', normalized);
      }
      return { action: 'deny' };
    });
  });
}

function setupSessionHandlers() {
  ipcMain.handle('session-save-window', async (event, payload: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return false;

    if (payload === null) {
      windowSessionCache.delete(sourceWindow.id);
      scheduleSessionPersist();
      return true;
    }

    const normalized = normalizeWindowSessionSnapshot(payload);
    if (!normalized) return false;

    const bounds = sourceWindow.getBounds();
    windowSessionCache.set(sourceWindow.id, {
      ...normalized,
      bounds,
      isMaximized: sourceWindow.isMaximized(),
      isFullScreen: sourceWindow.isFullScreen(),
    });
    scheduleSessionPersist();
    return true;
  });

  ipcMain.handle('session-get-restore-state', () => {
    if (!pendingRestoreSession) {
      return {
        hasPendingRestore: false,
        tabCount: 0,
        windowCount: 0,
      };
    }

    const tabCount = pendingRestoreSession.windows.reduce((sum, item) => sum + item.tabs.length, 0);
    return {
      hasPendingRestore: tabCount > 0,
      tabCount,
      windowCount: pendingRestoreSession.windows.length,
    };
  });

  ipcMain.handle('session-accept-restore', (event, mode: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return null;
    if (!pendingRestoreSession?.windows.length) return null;

    const restoreMode: SessionRestoreMode = mode === 'tabs' ? 'tabs' : 'windows';
    const [primaryWindow, ...otherWindows] = pendingRestoreSession.windows;
    pendingRestoreSession = null;

    if (restoreMode === 'tabs') {
      return mergeRestoreWindowsIntoSingleSnapshot([primaryWindow, ...otherWindows]) ?? primaryWindow;
    }

    for (const snapshot of otherWindows) {
      createWindow(undefined, undefined, snapshot);
    }

    return primaryWindow;
  });

  ipcMain.handle('session-discard-restore', async () => {
    pendingRestoreSession = null;
    await clearPersistedSessionSnapshot();
    return true;
  });

  ipcMain.handle('session-take-window-restore', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return null;
    const snapshot = bootRestoreByWindowId.get(sourceWindow.id) ?? null;
    bootRestoreByWindowId.delete(sourceWindow.id);
    return snapshot;
  });
}

function setupUpdateHandlers() {
  ipcMain.handle('updates-check', async (_event, options: { includePrerelease?: boolean } | undefined) => {
    try {
      const result = await checkForUpdates(options?.includePrerelease === true);
      if (!result) {
        return {
          ok: false,
          error: 'No compatible update asset was found for this operating system.',
        };
      }

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates.',
      };
    }
  });

  ipcMain.handle('updates-open-download', async (_event, downloadUrl: unknown) => {
    const url = typeof downloadUrl === 'string' ? downloadUrl.trim() : '';
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(
    'updates-download-and-install',
    async (_event, payload: { downloadUrl?: unknown; assetName?: unknown } | undefined) => {
      const downloadUrl = typeof payload?.downloadUrl === 'string' ? payload.downloadUrl.trim() : '';
      const assetName = typeof payload?.assetName === 'string' ? payload.assetName.trim() : '';
      if (!downloadUrl || !assetName) {
        return {
          ok: false,
          error: 'Invalid update payload.',
        };
      }

      try {
        const downloadedPath = await downloadAssetToDownloads(downloadUrl, assetName);
        const openError = await shell.openPath(downloadedPath);
        if (openError) {
          return {
            ok: false,
            error: openError,
          };
        }

        if (process.platform === 'win32') {
          setTimeout(() => app.quit(), 1000).unref();
        }

        return {
          ok: true,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to download and launch update.',
        };
      }
    },
  );
}

function triggerNewWindowFromShortcut(sourceWindow: BrowserWindow): void {
  if (sourceWindow.isDestroyed()) return;

  const now = Date.now();
  const windowId = sourceWindow.id;
  const lastTriggeredAt = recentNewWindowShortcutByWindow.get(windowId) ?? 0;
  if (now - lastTriggeredAt < NEW_WINDOW_SHORTCUT_DEDUPE_MS) return;

  recentNewWindowShortcutByWindow.set(windowId, now);
  createWindow(sourceWindow);
}

function setupAdBlocker() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldBlockRequest(details.url, details.resourceType) });
  });

  ipcMain.handle('settings-set-ad-block-enabled', async (_, enabled: unknown) => {
    adBlockEnabled = enabled !== false;
    return adBlockEnabled;
  });

  ipcMain.handle('settings-set-quit-on-last-window-close', async (_, enabled: unknown) => {
    quitOnLastWindowClose = isMacOS && enabled === true;
    return quitOnLastWindowClose;
  });
}

function setupWindowControlsHandlers() {
  ipcMain.handle('window-new', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    createWindow(sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : undefined);
    return true;
  });

  ipcMain.handle('window-new-with-url', (event, url: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    createWindow(
      sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : undefined,
      normalizedUrl || undefined,
    );
    return true;
  });

  ipcMain.handle('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    win.minimize();
    return true;
  });

  ipcMain.handle('window-maximize-toggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return true;
  });

  ipcMain.handle('window-is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    return win.isMaximized();
  });

  ipcMain.handle('window-is-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });

  ipcMain.handle('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    win.close();
    return true;
  });

  ipcMain.handle(
    'window-set-titlebar-symbol-color',
    (
      event,
      payload: unknown,
    ) => {
    if (!isWindows) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;

      let normalizedSymbolColor = '';
      let normalizedOverlayColor = '';
      if (typeof payload === 'string') {
        normalizedSymbolColor = payload.trim();
      } else if (typeof payload === 'object' && payload) {
        const candidate = payload as { symbolColor?: unknown; color?: unknown };
        normalizedSymbolColor =
          typeof candidate.symbolColor === 'string' ? candidate.symbolColor.trim() : '';
        normalizedOverlayColor = typeof candidate.color === 'string' ? candidate.color.trim() : '';
      }

      if (!normalizedSymbolColor) return false;
    win.setTitleBarOverlay({
      color: normalizedOverlayColor || '#00000000',
      symbolColor: normalizedSymbolColor,
      height: 38,
    });
    return true;
    },
  );
}

function setupGlobalShortcuts() {
  const devToolsAccelerator = isMacOS ? 'Command+Alt+I' : 'Ctrl+Shift+I';

  globalShortcut.register(devToolsAccelerator, () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow || focusedWindow.isDestroyed()) return;
    focusedWindow.webContents.send('app-shortcut', 'toggle-devtools');
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

function setupMacDockMenu() {
  if (!isMacOS) return;
  const dockMenu = Menu.buildFromTemplate([
    {
      label: 'New Window',
      click: () => createWindow(),
    },
  ]);
  app.dock.setMenu(dockMenu);
}

function createWindow(
  sourceWindow?: BrowserWindow,
  initialUrl?: string,
  restoreSnapshot?: WindowSessionSnapshot,
): BrowserWindow {
  const sourceBounds = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow.getBounds() : null;
  const restoreBounds = restoreSnapshot?.bounds;
  const win = new BrowserWindow({
    x: restoreBounds ? restoreBounds.x : sourceBounds ? sourceBounds.x + 24 : undefined,
    y: restoreBounds ? restoreBounds.y : sourceBounds ? sourceBounds.y + 24 : undefined,
    width: restoreBounds ? restoreBounds.width : 1200,
    height: restoreBounds ? restoreBounds.height : 800,
    frame: isMacOS,
    titleBarStyle: isMacOS ? 'hiddenInset' : isWindows ? 'hidden' : undefined,
    titleBarOverlay: isWindows
      ? {
          color: '#00000000',
          symbolColor: '#e8edf5',
          height: 38,
        }
      : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      // devTools: false,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isMacOS) {
    win.setWindowButtonVisibility(true);
  }

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/index.html');
  }

  if (restoreSnapshot) {
    bootRestoreByWindowId.set(win.id, restoreSnapshot);
  }

  if (restoreSnapshot?.isMaximized) {
    win.maximize();
  }
  if (restoreSnapshot?.isFullScreen) {
    win.setFullScreen(true);
  }

  const normalizedInitialUrl = initialUrl?.trim();
  if (normalizedInitialUrl) {
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.webContents.send('open-url-in-current-tab', normalizedInitialUrl);
    });
  }

  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.webContents.send('window-maximized-changed', win.isMaximized());
  win.webContents.send('window-fullscreen-changed', win.isFullScreen());

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized-changed', true);
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized-changed', false);
    }
  });

  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-fullscreen-changed', true);
    }
  });

  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-fullscreen-changed', false);
    }
  });

  win.on('closed', () => {
    bootRestoreByWindowId.delete(win.id);
    const noWindowsRemaining = BrowserWindow.getAllWindows().length === 0;

    // Do not remove this snapshot immediately. Users may be closing windows
    // in quick succession to quit the app, and we need all windows restorable.
    // If the app keeps running, remove the closed window shortly after.
    if (!isQuitting && !noWindowsRemaining) {
      const existingTimer = pendingClosedWindowCleanupTimers.get(win.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const cleanupTimer = setTimeout(() => {
        pendingClosedWindowCleanupTimers.delete(win.id);
        if (isQuitting) return;
        if (BrowserWindow.getAllWindows().length === 0) return;
        windowSessionCache.delete(win.id);
        scheduleSessionPersist();
      }, 2000);
      cleanupTimer.unref();
      pendingClosedWindowCleanupTimers.set(win.id, cleanupTimer);
      return;
    }

    scheduleSessionPersist();
  });

  const onWindowBoundsChanged = () => {
    if (isQuitting) return;
    const existing = windowSessionCache.get(win.id);
    if (!existing) return;

    windowSessionCache.set(win.id, {
      ...existing,
      bounds: win.getBounds(),
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
      savedAt: Date.now(),
    });
    scheduleSessionPersist();
  };

  win.on('move', onWindowBoundsChanged);
  win.on('resize', onWindowBoundsChanged);
  win.on('maximize', onWindowBoundsChanged);
  win.on('unmaximize', onWindowBoundsChanged);
  win.on('enter-full-screen', onWindowBoundsChanged);
  win.on('leave-full-screen', onWindowBoundsChanged);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = input.key.toLowerCase();
    const isPrimaryChord = (input.control || input.meta) && !input.shift;
    const isReloadChord = isPrimaryChord && key === 'r';
    const isFindChord = isPrimaryChord && key === 'f';
    const isNewWindowChord = isPrimaryChord && key === 'n';
    const isPrintChord = isPrimaryChord && key === 'p';
    const isReloadKey = key === 'f5';

    if (isReloadChord || isReloadKey) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'reload-tab');
      return;
    }

    if (isNewWindowChord) {
      event.preventDefault();
      triggerNewWindowFromShortcut(win);
      return;
    }

    if (isFindChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'find-in-page');
      return;
    }

    if (isPrintChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'print-page');
    }
  });

  return win;
}

app.whenReady().then(async () => {
  await loadHistory().catch(() => undefined);
  await loadCachedAdBlockHosts().catch(() => undefined);
  await loadPersistedSessionSnapshot().catch(() => undefined);
  setupHistoryHandlers();
  setupSessionHandlers();
  setupUpdateHandlers();
  setupWebviewTabOpenHandler();
  setupAdBlocker();
  setupWindowControlsHandlers();
  setupGlobalShortcuts();
  setupMacDockMenu();
  scheduleAdBlockListRefresh();
  setupDownloadHandlers();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (!isMacOS) {
    app.quit();
    return;
  }

  if (quitOnLastWindowClose) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const timer of pendingClosedWindowCleanupTimers.values()) {
    clearTimeout(timer);
  }
  pendingClosedWindowCleanupTimers.clear();
  if (sessionPersistTimer) {
    clearTimeout(sessionPersistTimer);
    sessionPersistTimer = null;
  }
  persistSessionSnapshotSync();
});
