import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  session,
  webContents as electronWebContents,
} from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { DownloadItem, WebContents } from 'electron';
import { appendFileSync, promises as fs, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Store active downloads by ID
const downloadMap = new Map<string, DownloadItem>();
const downloadWindowById = new Map<string, number>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const isMacOS = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const ENABLE_APP_DEBUG_LOGS = true; // Set to false for shipping builds.
const incomingBrowserUrlQueue: string[] = [];
const APP_STATE_FILE = 'app-state.json';

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

interface PersistedAppState {
  onboardingCompleted?: boolean;
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
const SHORTCUT_DEVTOOLS_SUPPRESS_MS = 500;
const suppressHostDevToolsUntilByWindowId = new Map<number, number>();
const windowSessionCache = new Map<number, WindowSessionSnapshot>();
const bootRestoreByWindowId = new Map<number, WindowSessionSnapshot>();
let pendingRestoreSession: PersistedSessionSnapshot | null = null;
let sessionPersistTimer: NodeJS.Timeout | null = null;
const pendingClosedWindowCleanupTimers = new Map<number, NodeJS.Timeout>();
const onboardingWindowIds = new Set<number>();
let isQuitting = false;
let adBlockEnabled = true;
let trackerBlockEnabled = false;
let quitOnLastWindowClose = false;
let hasAttemptedLaunchAutoUpdate = false;
let onboardingCompleted = false;
const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/FatalMistake02/mira/releases?per_page=40';
const isPortableBuild = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE;
const AD_BLOCK_CACHE_FILE = 'adblock-hosts-v1.txt';
const AD_BLOCK_FETCH_TIMEOUT_MS = 15000;
const AD_BLOCK_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TRACKER_BLOCK_LOCAL_FILE = path.join('src', 'assets', 'trackers.txt');

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
  "googleads.g.doubleclick.net",
  "adservice.google.com",
  "pagead2.googlesyndication.com",
  "ads.google.com",
  "ads.youtube.com",
  "ads.mopub.com",
];
const DEFAULT_BLOCKED_TRACKER_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'googletagservices.com',
  'cdn.segment.com',
  'api.segment.io',
  'mixpanel.com',
  'amplitude.com',
  'hotjar.com',
  'clarity.ms',
  'app-measurement.com',
  'connect.facebook.net',
  'fullstory.com',
  'js-agent.newrelic.com',
  'bam.nr-data.net',
  'datadoghq-browser-agent.com',
  'bat.bing.com',
  'snap.licdn.com',
  'ads-twitter.com',
  'static.ads-twitter.com',
  'branch.io',
  'app.adjust.com',
];
let blockedTrackerHosts = new Set<string>(DEFAULT_BLOCKED_TRACKER_HOSTS);
const AD_BLOCK_LIST_URLS = [
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/hosts/light.txt',
];
let blockedAdHosts = new Set<string>(DEFAULT_BLOCKED_AD_HOSTS);

interface WindowTitleBarOverlayState {
  color: string;
  symbolColor: string;
  height: number;
  preferNativeOverlay: boolean;
  suppressForDockedDevToolsCount: number;
}

const DEFAULT_TITLEBAR_OVERLAY_COLOR = '#00000000';
const DEFAULT_TITLEBAR_SYMBOL_COLOR = '#e8edf5';
const DEFAULT_TITLEBAR_OVERLAY_HEIGHT = 38;
const windowTitleBarOverlayState = new Map<number, WindowTitleBarOverlayState>();

function getOrCreateTitleBarOverlayState(win: BrowserWindow): WindowTitleBarOverlayState {
  const existing = windowTitleBarOverlayState.get(win.id);
  if (existing) return existing;

  const created: WindowTitleBarOverlayState = {
    color: DEFAULT_TITLEBAR_OVERLAY_COLOR,
    symbolColor: DEFAULT_TITLEBAR_SYMBOL_COLOR,
    height: DEFAULT_TITLEBAR_OVERLAY_HEIGHT,
    preferNativeOverlay: isWindows,
    suppressForDockedDevToolsCount: 0,
  };
  windowTitleBarOverlayState.set(win.id, created);
  return created;
}

function isTitleBarOverlayActive(win: BrowserWindow): boolean {
  if (!isWindows || win.isDestroyed()) return false;
  const overlayState = getOrCreateTitleBarOverlayState(win);
  return overlayState.preferNativeOverlay && overlayState.suppressForDockedDevToolsCount === 0;
}

function applyWindowTitleBarOverlay(win: BrowserWindow): boolean {
  if (!isWindows || win.isDestroyed()) return false;

  const overlayState = getOrCreateTitleBarOverlayState(win);
  const shouldEnable = overlayState.preferNativeOverlay && overlayState.suppressForDockedDevToolsCount === 0;

  if (shouldEnable) {
    win.setTitleBarOverlay({
      color: overlayState.color,
      symbolColor: overlayState.symbolColor,
      height: overlayState.height,
    });
  } else {
    win.setTitleBarOverlay(false);
  }

  if (!win.webContents.isDestroyed()) {
    win.webContents.send('window-titlebar-overlay-changed', shouldEnable);
  }
  return shouldEnable;
}

function suppressTitleBarOverlayForDockedDevTools(win: BrowserWindow): () => void {
  const overlayState = getOrCreateTitleBarOverlayState(win);
  overlayState.suppressForDockedDevToolsCount += 1;
  applyWindowTitleBarOverlay(win);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const latest = windowTitleBarOverlayState.get(win.id);
    if (!latest) return;

    latest.suppressForDockedDevToolsCount = Math.max(0, latest.suppressForDockedDevToolsCount - 1);
    if (!win.isDestroyed()) {
      applyWindowTitleBarOverlay(win);
    }
  };
}

function isRestorableSessionTabUrl(url: string): boolean {
  return url.trim().toLowerCase() !== 'mira://newtab';
}

function sanitizeUserAgent(userAgent: string): string {
  return userAgent.replace(/\sElectron\/[^\s)]+/g, '').trim();
}

function sanitizeFileNameFragment(value: string): string {
  const withoutReservedChars = value.replace(/[<>:"/\\|?*]+/g, ' ');
  const withoutControlChars = Array.from(withoutReservedChars)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('');
  return withoutControlChars.replace(/\s+/g, ' ').trim();
}

function getPageSaveDefaultFileName(target: WebContents): string {
  const titleCandidate = sanitizeFileNameFragment(target.getTitle?.() ?? '');
  if (titleCandidate) {
    return `${titleCandidate}.html`;
  }

  const urlCandidate = (target.getURL?.() ?? '').trim();
  if (!urlCandidate) return 'page.html';

  try {
    const parsed = new URL(urlCandidate);
    const hostname = sanitizeFileNameFragment(parsed.hostname || '');
    const pathname = sanitizeFileNameFragment(parsed.pathname.split('/').filter(Boolean).join('-'));
    if (hostname && pathname) return `${hostname}-${pathname}.html`;
    if (hostname) return `${hostname}.html`;
  } catch {
    const fallback = sanitizeFileNameFragment(urlCandidate);
    if (fallback) return `${fallback}.html`;
  }

  return 'page.html';
}

function getAdBlockCachePath(): string {
  return path.join(app.getPath('userData'), AD_BLOCK_CACHE_FILE);
}

function getBundledTrackerListPath(): string {
  return path.join(app.getAppPath(), TRACKER_BLOCK_LOCAL_FILE);
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

async function loadBundledTrackerBlockHosts(): Promise<void> {
  try {
    const raw = await fs.readFile(getBundledTrackerListPath(), 'utf-8');
    const parsedHosts = parseHostsFromBlocklist(raw);
    if (!parsedHosts.size) return;

    blockedTrackerHosts = new Set([...DEFAULT_BLOCKED_TRACKER_HOSTS, ...parsedHosts]);
  } catch {
    // Missing local tracker list should not disable default tracker blocking.
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
  if (resourceType === 'mainFrame') return false;

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    const adBlocked = adBlockEnabled && isHostBlocked(host);
    const trackerBlocked = trackerBlockEnabled && isTrackerHostBlocked(host);
    return adBlocked || trackerBlocked;
  } catch {
    return false;
  }
}

function isTrackerHostBlocked(hostname: string): boolean {
  let candidate = hostname;
  while (candidate) {
    if (blockedTrackerHosts.has(candidate)) return true;
    const nextDot = candidate.indexOf('.');
    if (nextDot === -1) return false;
    candidate = candidate.slice(nextDot + 1);
  }
  return false;
}

function getHistoryFilePath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function normalizeIncomingBrowserUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'file:' && protocol !== 'about:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractIncomingBrowserUrlFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i -= 1) {
    const candidate = normalizeIncomingBrowserUrl(argv[i] ?? '');
    if (candidate) return candidate;
  }
  return null;
}

function enqueueIncomingBrowserUrl(rawUrl: string): void {
  const normalized = normalizeIncomingBrowserUrl(rawUrl);
  if (!normalized) return;
  incomingBrowserUrlQueue.push(normalized);
}

function takeQueuedIncomingBrowserUrls(): string[] {
  if (!incomingBrowserUrlQueue.length) return [];
  return incomingBrowserUrlQueue.splice(0, incomingBrowserUrlQueue.length);
}

function getDefaultProtocolRegistrationContext():
  | {
      executable: string;
      args: string[];
    }
  | null {
  if (!process.defaultApp) return null;
  const appEntrypoint = process.argv[1];
  if (!appEntrypoint) return null;

  return {
    executable: process.execPath,
    args: [path.resolve(appEntrypoint)],
  };
}

function logDebug(scope: string, message: string, details?: Record<string, unknown>): void {
  if (!ENABLE_APP_DEBUG_LOGS) return;
  const payload = details ? `${message} ${JSON.stringify(details)}` : message;
  const line = `[${scope}-debug] ${payload}`;
  console.info(line);

  try {
    appendFileSync(
      path.join(app.getPath('userData'), 'app-debug.log'),
      `${new Date().toISOString()} ${line}\n`,
      'utf8',
    );
  } catch (error) {
    console.error('[debug-log-write-failed]', error);
  }
}

function logDefaultBrowserDebug(message: string, details?: Record<string, unknown>): void {
  logDebug('default-browser', message, details);
}

function getSafeUserDataPath(): string {
  try {
    return app.getPath('userData');
  } catch {
    return '(userData unavailable)';
  }
}

function isDefaultForProtocol(protocol: string): boolean {
  try {
    const registrationContext = getDefaultProtocolRegistrationContext();
    const hasRegistrationContext = !!registrationContext;
    if (!registrationContext) {
      const result = app.isDefaultProtocolClient(protocol);
      logDefaultBrowserDebug('isDefaultForProtocol', {
        protocol,
        result,
        hasRegistrationContext,
      });
      return result;
    }

    const result = app.isDefaultProtocolClient(
      protocol,
      registrationContext.executable,
      registrationContext.args,
    );
    logDefaultBrowserDebug('isDefaultForProtocol', {
      protocol,
      result,
      hasRegistrationContext,
      executable: registrationContext.executable,
      args: registrationContext.args,
    });
    return result;
  } catch (error) {
    logDefaultBrowserDebug('isDefaultForProtocol-error', {
      protocol,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function setAsDefaultForProtocol(protocol: string): boolean {
  try {
    const registrationContext = getDefaultProtocolRegistrationContext();
    const hasRegistrationContext = !!registrationContext;
    if (!registrationContext) {
      const result = app.setAsDefaultProtocolClient(protocol);
      logDefaultBrowserDebug('setAsDefaultForProtocol', {
        protocol,
        result,
        hasRegistrationContext,
      });
      return result;
    }

    const result = app.setAsDefaultProtocolClient(
      protocol,
      registrationContext.executable,
      registrationContext.args,
    );
    logDefaultBrowserDebug('setAsDefaultForProtocol', {
      protocol,
      result,
      hasRegistrationContext,
      executable: registrationContext.executable,
      args: registrationContext.args,
    });
    return result;
  } catch (error) {
    logDefaultBrowserDebug('setAsDefaultForProtocol-error', {
      protocol,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function isDefaultBrowser(): boolean {
  return isDefaultForProtocol('http') && isDefaultForProtocol('https');
}

type DefaultBrowserSupportCode =
  | 'ok'
  | 'dev-build'
  | 'windows-portable'
  | 'manual-confirmation-required'
  | 'registration-failed';

type DefaultBrowserSupportInfo = {
  code: DefaultBrowserSupportCode;
  canAttemptRegistration: boolean;
  requiresUserAction: boolean;
  message: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  isPortableBuild: boolean;
  processDefaultApp: boolean;
};

type RunOnStartupSupportCode = 'ok' | 'unsupported-platform' | 'dev-build' | 'read-failed';

type RunOnStartupSupportInfo = {
  code: RunOnStartupSupportCode;
  canConfigure: boolean;
  message: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  processDefaultApp: boolean;
  isEnabled: boolean;
};

function getDefaultBrowserSupportInfo(): DefaultBrowserSupportInfo {
  if (!app.isPackaged || process.defaultApp) {
    return {
      code: 'dev-build',
      canAttemptRegistration: false,
      requiresUserAction: true,
      message:
        'Default browser registration is unavailable in development mode. Use an installed packaged build and set Mira in your OS default apps settings.',
      platform: process.platform,
      isPackaged: app.isPackaged,
      isPortableBuild,
      processDefaultApp: !!process.defaultApp,
    };
  }

  if (isWindows && isPortableBuild) {
    return {
      code: 'windows-portable',
      canAttemptRegistration: false,
      requiresUserAction: true,
      message:
        'Portable builds cannot reliably own HTTP/HTTPS defaults on Windows. Install the NSIS build, then select Mira in Default apps.',
      platform: process.platform,
      isPackaged: app.isPackaged,
      isPortableBuild,
      processDefaultApp: !!process.defaultApp,
    };
  }

  return {
    code: 'ok',
    canAttemptRegistration: true,
    requiresUserAction: false,
    message: '',
    platform: process.platform,
    isPackaged: app.isPackaged,
    isPortableBuild,
    processDefaultApp: !!process.defaultApp,
  };
}

function getRunOnStartupSupportInfo(): RunOnStartupSupportInfo {
  if (!isWindows && !isMacOS) {
    return {
      code: 'unsupported-platform',
      canConfigure: false,
      message: 'Run on startup is only supported on Windows and macOS.',
      platform: process.platform,
      isPackaged: app.isPackaged,
      processDefaultApp: !!process.defaultApp,
      isEnabled: false,
    };
  }

  if (!app.isPackaged || process.defaultApp) {
    return {
      code: 'dev-build',
      canConfigure: false,
      message: 'Run on startup is unavailable in development mode. Use an installed packaged build.',
      platform: process.platform,
      isPackaged: app.isPackaged,
      processDefaultApp: !!process.defaultApp,
      isEnabled: false,
    };
  }

  try {
    const loginItemSettings = app.getLoginItemSettings();
    return {
      code: 'ok',
      canConfigure: true,
      message: '',
      platform: process.platform,
      isPackaged: app.isPackaged,
      processDefaultApp: !!process.defaultApp,
      isEnabled: loginItemSettings.openAtLogin === true,
    };
  } catch (error) {
    return {
      code: 'read-failed',
      canConfigure: false,
      message: error instanceof Error ? error.message : 'Failed to read startup settings.',
      platform: process.platform,
      isPackaged: app.isPackaged,
      processDefaultApp: !!process.defaultApp,
      isEnabled: false,
    };
  }
}

function getSessionFilePath() {
  return path.join(app.getPath('userData'), 'session.json');
}

function getAppStateFilePath() {
  return path.join(app.getPath('userData'), APP_STATE_FILE);
}

function normalizeAppState(value: unknown): PersistedAppState {
  if (typeof value !== 'object' || value === null) return {};
  const candidate = value as PersistedAppState;
  return {
    onboardingCompleted: candidate.onboardingCompleted === true,
  };
}

async function loadPersistedAppState(): Promise<void> {
  try {
    const raw = await fs.readFile(getAppStateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeAppState(parsed);
    onboardingCompleted = normalized.onboardingCompleted === true;
  } catch {
    onboardingCompleted = false;
  }
}

async function persistAppState(): Promise<void> {
  const payload: PersistedAppState = {
    onboardingCompleted,
  };
  await fs.writeFile(getAppStateFilePath(), JSON.stringify(payload), 'utf-8');
}

function shouldShowOnboarding(): boolean {
  if (!app.isPackaged || process.defaultApp) return false;
  return onboardingCompleted !== true;
}

function pruneHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return entries
    .filter((entry) => entry.visitedAt >= cutoff)
    .sort((a, b) => b.visitedAt - a.visitedAt);
}

async function persistHistory() {
  await fs.writeFile(getHistoryFilePath(), JSON.stringify(historyCache, null, 0), 'utf-8');
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
    const archToken = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : '';
    const hasMacArchToken = (assetName: string): boolean => {
      if (!archToken) return false;
      const normalized = assetName.toLowerCase();
      return normalized.includes(`-mac-${archToken}.`);
    };

    const macArchDmg = assets.find(
      (asset) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().endsWith('.dmg') &&
        hasMacArchToken(asset.name),
    );
    if (macArchDmg) return macArchDmg;

    const macArchZip = assets.find(
      (asset) =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().endsWith('.zip') &&
        hasMacArchToken(asset.name),
    );
    if (macArchZip) return macArchZip;

    // Fallback for older/renamed assets that do not include explicit arch tokens.
    const dmg = assets.find(
      (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.dmg'),
    );
    if (dmg) return dmg;
    const zip = assets.find(
      (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.zip'),
    );
    return zip ?? null;
  }

  if (process.platform === 'linux') {
    const archTokens =
      process.arch === 'arm64'
        ? ['arm64', 'aarch64']
        : process.arch === 'x64'
          ? ['x86_64', 'amd64', 'x64']
          : [];

    const hasArchToken = (assetName: string): boolean => {
      if (!archTokens.length) return false;
      const normalized = assetName.toLowerCase();
      return archTokens.some((token) => normalized.includes(token));
    };

    const pickByExtension = (extension: string): GitHubReleaseAsset | null => {
      const archMatch = assets.find(
        (asset) =>
          typeof asset.name === 'string' &&
          asset.name.toLowerCase().endsWith(extension) &&
          hasArchToken(asset.name),
      );
      if (archMatch) return archMatch;

      const genericMatch = assets.find(
        (asset) => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith(extension),
      );
      return genericMatch ?? null;
    };

    return pickByExtension('.appimage') ?? pickByExtension('.deb') ?? pickByExtension('.rpm');
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

function canAutoInstallUpdatesOnLaunch(): boolean {
  const isSupportedPlatform =
    process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
  if (!isSupportedPlatform) return false;
  if (!app.isPackaged || process.defaultApp) return false;
  if (isPortableBuild) return false;
  return true;
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
      const hasPrimaryModifier = input.control || input.meta;
      const isPrimaryChord = hasPrimaryModifier && !input.shift;
      const isNewWindowChord = isPrimaryChord && key === 'n';
      const isFindChord = isPrimaryChord && key === 'f';
      const isNextTabChord = isPrimaryChord && key === 'tab';
      const isPreviousTabChord = hasPrimaryModifier && input.shift && key === 'tab';
      const tabNumberShortcut = isPrimaryChord && /^[1-9]$/.test(key)
        ? Number.parseInt(key, 10)
        : null;
      const isAppDevToolsChord = hasPrimaryModifier && input.shift && key === 'j';
      const isDevToolsChord = isMacOS
        ? input.meta && input.alt && key === 'i'
        : (input.meta && input.shift && key === 'i') || (input.control && input.shift && key === 'i');

      const hostWindow = BrowserWindow.fromWebContents(host);
      if (!hostWindow || hostWindow.isDestroyed()) return;

      if (
        !isNewWindowChord
        && !isFindChord
        && !isNextTabChord
        && !isPreviousTabChord
        && tabNumberShortcut === null
        && !isDevToolsChord
        && !isAppDevToolsChord
      ) return;

      event.preventDefault();

      if (isAppDevToolsChord) {
        logDebug('shortcut', 'app-devtools-shortcut-from-webview', {
          windowId: hostWindow.id,
          key,
          control: input.control,
          meta: input.meta,
          shift: input.shift,
        });
        toggleWindowDevTools(hostWindow);
        return;
      }

      if (isDevToolsChord) {
        if (toggleFocusedBrowserDevTools()) {
          return;
        }
        markHostDevToolsSuppressedForShortcut(hostWindow);
        hostWindow.webContents.send('app-shortcut', 'toggle-devtools');
        return;
      }

      if (isFindChord) {
        hostWindow.webContents.send('app-shortcut', 'find-in-page');
        return;
      }

      if (isNextTabChord) {
        hostWindow.webContents.send('app-shortcut', 'activate-next-tab');
        return;
      }

      if (isPreviousTabChord) {
        hostWindow.webContents.send('app-shortcut', 'activate-previous-tab');
        return;
      }

      if (tabNumberShortcut !== null) {
        hostWindow.webContents.send('app-shortcut', 'activate-tab-index', tabNumberShortcut);
        return;
      }

      triggerNewWindowFromShortcut(hostWindow);
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

    applyWindowStateFromSnapshot(sourceWindow, primaryWindow);
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

function applyWindowStateFromSnapshot(
  win: BrowserWindow,
  snapshot: WindowSessionSnapshot | undefined,
): void {
  if (!snapshot || win.isDestroyed()) return;

  if (snapshot.bounds) {
    win.setBounds(snapshot.bounds);
  }
  if (snapshot.isMaximized) {
    win.maximize();
  }
  if (snapshot.isFullScreen) {
    win.setFullScreen(true);
  }
}

function setupUpdateHandlers() {
  ipcMain.handle('updates-launch-auto-support', () => {
    return {
      canAutoInstall: canAutoInstallUpdatesOnLaunch(),
    };
  });

  ipcMain.handle(
    'updates-run-launch-auto',
    async (_event, options: { includePrerelease?: boolean } | undefined) => {
      if (hasAttemptedLaunchAutoUpdate) {
        return {
          ok: true,
          skipped: true,
          reason: 'already-attempted',
        };
      }
      hasAttemptedLaunchAutoUpdate = true;

      if (!canAutoInstallUpdatesOnLaunch()) {
        return {
          ok: true,
          skipped: true,
          reason: 'unsupported-build',
        };
      }

      try {
        const result = await checkForUpdates(options?.includePrerelease === true);
        if (!result) {
          return {
            ok: true,
            skipped: true,
            reason: 'no-compatible-asset',
          };
        }

        if (!result.hasUpdate) {
          return {
            ok: true,
            skipped: true,
            reason: 'up-to-date',
          };
        }

        if (result.mode !== 'installer') {
          return {
            ok: true,
            skipped: true,
            reason: 'non-installer-build',
          };
        }

        const downloadedPath = await downloadAssetToDownloads(result.downloadUrl, result.assetName);
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
          skipped: false,
          launchedInstaller: true,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to run launch update check.',
        };
      }
    },
  );

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

  ipcMain.handle(
    'updates-download-asset',
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
        const savedPath = await downloadAssetToDownloads(downloadUrl, assetName);
        return {
          ok: true,
          savedPath,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to download update.',
        };
      }
    },
  );

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

function markHostDevToolsSuppressedForShortcut(win: BrowserWindow): void {
  suppressHostDevToolsUntilByWindowId.set(win.id, Date.now() + SHORTCUT_DEVTOOLS_SUPPRESS_MS);
}

function shouldSuppressHostDevTools(win: BrowserWindow): boolean {
  const suppressUntil = suppressHostDevToolsUntilByWindowId.get(win.id) ?? 0;
  if (Date.now() > suppressUntil) {
    suppressHostDevToolsUntilByWindowId.delete(win.id);
    return false;
  }
  return true;
}

function toggleFocusedBrowserDevTools(): boolean {
  const focused = electronWebContents.getFocusedWebContents();
  if (!focused || focused.isDestroyed()) return false;
  if (!focused.hostWebContents) return false;

  if (focused.isDevToolsOpened()) {
    focused.closeDevTools();
  } else {
    focused.openDevTools();
  }
  return true;
}

function toggleWindowDevTools(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  try {
    const wasOpen = win.webContents.isDevToolsOpened();
    if (wasOpen) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    logDebug('shortcut', 'toggleWindowDevTools', {
      windowId: win.id,
      wasOpen,
      nowOpen: !wasOpen,
    });
    return true;
  } catch (error) {
    logDebug('shortcut', 'toggleWindowDevTools-error', {
      windowId: win.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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

  ipcMain.handle('settings-set-tracker-block-enabled', async (_, enabled: unknown) => {
    trackerBlockEnabled = enabled !== false;
    return trackerBlockEnabled;
  });

  ipcMain.handle('settings-set-quit-on-last-window-close', async (_, enabled: unknown) => {
    quitOnLastWindowClose = isMacOS && enabled === true;
    return quitOnLastWindowClose;
  });

  ipcMain.handle('settings-run-on-startup-status', async () => {
    const support = getRunOnStartupSupportInfo();
    return {
      ok: support.code === 'ok',
      canConfigure: support.canConfigure,
      isEnabled: support.isEnabled,
      message: support.message,
      support,
    };
  });

  ipcMain.handle('settings-set-run-on-startup', async (_, enabled: unknown) => {
    const supportBefore = getRunOnStartupSupportInfo();
    if (!supportBefore.canConfigure) {
      return {
        ok: false,
        canConfigure: false,
        isEnabled: supportBefore.isEnabled,
        message: supportBefore.message,
        support: supportBefore,
      };
    }

    const shouldEnable = enabled === true;
    try {
      if (isMacOS) {
        app.setLoginItemSettings({
          openAtLogin: shouldEnable,
          openAsHidden: false,
        });
      } else {
        app.setLoginItemSettings({
          openAtLogin: shouldEnable,
        });
      }
    } catch (error) {
      const supportFailed = getRunOnStartupSupportInfo();
      return {
        ok: false,
        canConfigure: supportFailed.canConfigure,
        isEnabled: supportFailed.isEnabled,
        message: error instanceof Error ? error.message : 'Failed to update startup setting.',
        support: supportFailed,
      };
    }

    const supportAfter = getRunOnStartupSupportInfo();
    const didApply = supportAfter.canConfigure && supportAfter.isEnabled === shouldEnable;
    return {
      ok: didApply,
      canConfigure: supportAfter.canConfigure,
      isEnabled: supportAfter.isEnabled,
      message: didApply ? '' : 'Startup setting may require additional OS permissions.',
      support: supportAfter,
    };
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

  ipcMain.handle('tab-open-url-in-new-tab', (event, url: unknown) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) return false;

    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    if (!normalizedUrl) return false;
    sourceWindow.webContents.send('open-url-in-new-tab', normalizedUrl);
    return true;
  });

  ipcMain.handle('webview-open-devtools', (event, payload: unknown) => {
    if (typeof payload !== 'object' || !payload) return false;

    const candidate = payload as {
      webContentsId?: unknown;
      mode?: unknown;
      activate?: unknown;
    };
    const webContentsId =
      typeof candidate.webContentsId === 'number' && Number.isFinite(candidate.webContentsId)
        ? Math.floor(candidate.webContentsId)
        : -1;
    if (webContentsId <= 0) return false;

    const target = electronWebContents.fromId(webContentsId);
    if (!target || target.isDestroyed()) return false;

    const host = target.hostWebContents;
    if (!host || host.id !== event.sender.id) return false;
    const hostWindow = BrowserWindow.fromWebContents(host);
    if (!hostWindow || hostWindow.isDestroyed()) return false;

    const nextMode =
      candidate.mode === 'left' ||
      candidate.mode === 'right' ||
      candidate.mode === 'bottom' ||
      candidate.mode === 'undocked' ||
      candidate.mode === 'detach'
        ? candidate.mode
        : 'right';

    const wantsDockedMode = nextMode === 'left' || nextMode === 'right' || nextMode === 'bottom';
    let releaseOverlaySuppression: (() => void) | null = null;
    if (isWindows && wantsDockedMode) {
      releaseOverlaySuppression = suppressTitleBarOverlayForDockedDevTools(hostWindow);
      const cleanupSuppression = () => {
        if (!releaseOverlaySuppression) return;
        releaseOverlaySuppression();
        releaseOverlaySuppression = null;
      };
      target.once('devtools-closed', cleanupSuppression);
      target.once('destroyed', cleanupSuppression);
    }

    try {
      target.openDevTools({
        mode: nextMode,
        activate: candidate.activate !== false,
      });
      return true;
    } catch {
      if (releaseOverlaySuppression) {
        releaseOverlaySuppression();
      }
      return false;
    }
  });

  ipcMain.handle('webview-context-action', async (event, payload: unknown) => {
    if (typeof payload !== 'object' || !payload) return false;

    const candidate = payload as {
      webContentsId?: unknown;
      action?: unknown;
      x?: unknown;
      y?: unknown;
      url?: unknown;
      text?: unknown;
    };
    const webContentsId =
      typeof candidate.webContentsId === 'number' && Number.isFinite(candidate.webContentsId)
        ? Math.floor(candidate.webContentsId)
        : -1;
    if (webContentsId <= 0) return false;

    const action = typeof candidate.action === 'string' ? candidate.action.trim() : '';
    if (!action) return false;

    const target = electronWebContents.fromId(webContentsId);
    if (!target || target.isDestroyed()) return false;

    const host = target.hostWebContents;
    if (!host || host.id !== event.sender.id) return false;
    const hostWindow = BrowserWindow.fromWebContents(host);
    if (!hostWindow || hostWindow.isDestroyed()) return false;

    const x = typeof candidate.x === 'number' && Number.isFinite(candidate.x) ? Math.floor(candidate.x) : 0;
    const y = typeof candidate.y === 'number' && Number.isFinite(candidate.y) ? Math.floor(candidate.y) : 0;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    const text = typeof candidate.text === 'string' ? candidate.text : '';

    try {
      switch (action) {
        case 'save-page-as': {
          const defaultPath = path.join(app.getPath('downloads'), getPageSaveDefaultFileName(target));
          const saveResult = await dialog.showSaveDialog(hostWindow, {
            title: 'Save Page As',
            defaultPath,
            filters: [
              { name: 'Web Page', extensions: ['html', 'htm'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });
          if (saveResult.canceled || !saveResult.filePath) return false;
          await target.savePage(saveResult.filePath, 'HTMLComplete');
          return true;
        }
        case 'download-url':
          if (!url) return false;
          {
            const targetSession = target.session;
            const cleanupDelayMs = 15000;
            let removed = false;
            const detachListener = () => {
              if (removed) return;
              removed = true;
              targetSession.removeListener('will-download', onWillDownload);
            };
            const onWillDownload = (
              _event: Electron.Event,
              item: DownloadItem,
              downloadContents: WebContents | undefined,
            ) => {
              if (downloadContents?.id !== target.id) return;
              if (item.getURL() !== url) return;
              item.setSaveDialogOptions({ title: 'Save As' });
              detachListener();
            };

            targetSession.on('will-download', onWillDownload);
            setTimeout(detachListener, cleanupDelayMs);
          }
          target.downloadURL(url);
          return true;
        case 'copy-text':
          clipboard.writeText(text);
          return true;
        case 'copy-image-at':
          target.copyImageAt(x, y);
          return true;
        case 'inspect-element':
          target.inspectElement(x, y);
          return true;
        case 'edit-undo':
          target.undo();
          return true;
        case 'edit-redo':
          target.redo();
          return true;
        case 'edit-cut':
          target.cut();
          return true;
        case 'edit-copy':
          target.copy();
          return true;
        case 'edit-paste':
          target.paste();
          return true;
        case 'edit-paste-as-plain-text':
          target.pasteAndMatchStyle();
          return true;
        case 'edit-select-all':
          target.selectAll();
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
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

  ipcMain.handle('window-is-titlebar-overlay-enabled', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    return isTitleBarOverlayActive(win);
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

      const overlayState = getOrCreateTitleBarOverlayState(win);
      overlayState.symbolColor = normalizedSymbolColor;
      overlayState.color = normalizedOverlayColor || DEFAULT_TITLEBAR_OVERLAY_COLOR;
      overlayState.height = DEFAULT_TITLEBAR_OVERLAY_HEIGHT;
      overlayState.preferNativeOverlay = true;
      applyWindowTitleBarOverlay(win);
      return true;
    },
  );
}

function setupDefaultBrowserHandlers() {
  ipcMain.handle('default-browser-status', () => {
    const support = getDefaultBrowserSupportInfo();
    const isDefault = isDefaultBrowser();
    logDefaultBrowserDebug('default-browser-status', {
      isDefault,
      support,
    });
    return {
      isDefault,
      support,
      message: !isDefault ? support.message : '',
    };
  });

  ipcMain.handle('default-browser-set', () => {
    const support = getDefaultBrowserSupportInfo();
    const isDefaultBeforeSet = isDefaultBrowser();
    if (!support.canAttemptRegistration) {
      logDefaultBrowserDebug('default-browser-set-blocked', {
        isDefaultBeforeSet,
        support,
      });
      return {
        ok: false,
        isDefault: isDefaultBeforeSet,
        requiresUserAction: support.requiresUserAction,
        message: support.message,
        support,
      };
    }

    const didSetHttp = setAsDefaultForProtocol('http');
    const didSetHttps = setAsDefaultForProtocol('https');
    const ok = didSetHttp && didSetHttps;
    const isDefault = isDefaultBrowser();
    const requiresUserAction = ok && !isDefault;

    let message = '';
    if (!ok) {
      message = 'Could not register Mira for http/https. Check your OS default apps settings.';
    } else if (requiresUserAction) {
      message = isMacOS
        ? 'Mira was registered for http/https. If it is still not default, set Mira in macOS System Settings > Desktop & Dock > Default web browser, then refresh.'
        : isWindows
          ? 'Mira was registered for http/https. Windows may require confirmation in Settings before default status updates. Confirm Mira in Default apps or refresh status in a moment.'
          : 'Mira was registered for http/https. Confirm Mira in your OS default apps settings, then refresh status.';
    }

    logDefaultBrowserDebug('default-browser-set', {
      didSetHttp,
      didSetHttps,
      ok,
      isDefault,
      requiresUserAction,
      message,
      platform: process.platform,
      support,
    });

    return {
      ok,
      isDefault,
      requiresUserAction,
      message,
      support: {
        ...support,
        code: ok ? (requiresUserAction ? 'manual-confirmation-required' : 'ok') : 'registration-failed',
        canAttemptRegistration: ok,
        requiresUserAction,
        message,
      },
    };
  });
}

function setupIncomingUrlHandlers() {
  ipcMain.handle('incoming-urls-consume', () => {
    return takeQueuedIncomingBrowserUrls();
  });
}

function setupOnboardingHandlers() {
  ipcMain.handle('onboarding-complete', async (event) => {
    onboardingCompleted = true;
    await persistAppState().catch(() => undefined);

    let browserWindow = getFirstBrowserWindow();
    if (!browserWindow) {
      browserWindow = createWindow();
    }

    if (browserWindow && !browserWindow.isDestroyed()) {
      if (browserWindow.isMinimized()) browserWindow.restore();
      browserWindow.focus();
    }

    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.close();
    }

    return true;
  });

  ipcMain.handle('onboarding-reset', async () => {
    onboardingCompleted = false;
    await persistAppState().catch(() => undefined);
    return true;
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

function setupApplicationMenu() {
  const template = [
    ...(isMacOS
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            createWindow(focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : undefined);
          },
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow || focusedWindow.isDestroyed()) return;
            focusedWindow.webContents.send('app-shortcut', 'reopen-closed-tab');
          },
        },
        { type: 'separator' },
        {
          label: 'Downloads',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow || focusedWindow.isDestroyed()) return;
            focusedWindow.webContents.send('app-shortcut', 'open-downloads');
          },
        },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow || focusedWindow.isDestroyed()) return;
            focusedWindow.webContents.send('app-shortcut', 'print-page');
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Browser DevTools',
          accelerator: 'Command+Alt+I',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow || focusedWindow.isDestroyed()) return;
            if (toggleFocusedBrowserDevTools()) return;
            markHostDevToolsSuppressedForShortcut(focusedWindow);
            focusedWindow.webContents.send('app-shortcut', 'toggle-devtools');
          },
        },
        {
          label: 'Toggle App DevTools',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow || focusedWindow.isDestroyed()) return;
            logDebug('shortcut', 'menu-toggle-app-devtools', {
              windowId: focusedWindow.id,
            });
            toggleWindowDevTools(focusedWindow);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getFirstBrowserWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && !onboardingWindowIds.has(win.id))
    ?? null;
}

function loadRendererShell(win: BrowserWindow, options?: { onboarding?: boolean }): void {
  const onboarding = options?.onboarding === true;
  if (!app.isPackaged) {
    const onboardingQuery = onboarding ? '?onboarding=1' : '';
    win.loadURL(`http://localhost:5173${onboardingQuery}`);
    return;
  }

  if (onboarding) {
    win.loadFile('dist/index.html', {
      query: {
        onboarding: '1',
      },
    });
    return;
  }

  win.loadFile('dist/index.html');
}

function createOnboardingWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find(
    (win) => !win.isDestroyed() && onboardingWindowIds.has(win.id),
  );
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 760,
    height: 540,
    minWidth: 760,
    minHeight: 540,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#12161d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  onboardingWindowIds.add(win.id);
  loadRendererShell(win, { onboarding: true });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });
  win.setMenuBarVisibility(false);

  win.on('closed', () => {
    onboardingWindowIds.delete(win.id);
  });

  return win;
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
    backgroundColor: '#12161d',
    show: false,
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
  if (isWindows) {
    const overlayState = getOrCreateTitleBarOverlayState(win);
    overlayState.color = DEFAULT_TITLEBAR_OVERLAY_COLOR;
    overlayState.symbolColor = DEFAULT_TITLEBAR_SYMBOL_COLOR;
    overlayState.height = DEFAULT_TITLEBAR_OVERLAY_HEIGHT;
    overlayState.preferNativeOverlay = true;
    overlayState.suppressForDockedDevToolsCount = 0;
    applyWindowTitleBarOverlay(win);
  }

  loadRendererShell(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  if (restoreSnapshot) {
    bootRestoreByWindowId.set(win.id, restoreSnapshot);
  }

  applyWindowStateFromSnapshot(win, restoreSnapshot);
  if (!restoreSnapshot) {
    win.maximize();
  }

  const normalizedInitialUrl = initialUrl?.trim();
  if (normalizedInitialUrl) {
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.webContents.send('open-url-in-current-tab', normalizedInitialUrl);
    });
  }

  win.setMenuBarVisibility(false);
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
    windowTitleBarOverlayState.delete(win.id);
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

    if (!isQuitting) {
      scheduleSessionPersist();
    }
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
  win.webContents.on('devtools-opened', () => {
    if (!shouldSuppressHostDevTools(win)) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = input.key.toLowerCase();
    const hasPrimaryModifier = input.control || input.meta;
    const isPrimaryChord = hasPrimaryModifier && !input.shift;
    const isReloadChord = isPrimaryChord && key === 'r';
    const isFindChord = isPrimaryChord && key === 'f';
    const isNewWindowChord = isPrimaryChord && key === 'n';
    const isNextTabChord = isPrimaryChord && key === 'tab';
    const isPreviousTabChord = hasPrimaryModifier && input.shift && key === 'tab';
    const tabNumberShortcut = isPrimaryChord && /^[1-9]$/.test(key)
      ? Number.parseInt(key, 10)
      : null;
    const isDownloadsChord = isPrimaryChord && key === 'j';
    const isPrintChord = isPrimaryChord && key === 'p';
    const isReopenClosedTabChord = hasPrimaryModifier && input.shift && key === 't';
    const isAppDevToolsChord = hasPrimaryModifier && input.shift && key === 'j';
    const isReloadKey = key === 'f5';
    const isDevToolsChord = key === 'f12' || (isMacOS
      ? input.meta && input.alt && key === 'i'
      : (input.meta && input.shift && key === 'i') || (input.control && input.shift && key === 'i'));

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

    if (isNextTabChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'activate-next-tab');
      return;
    }

    if (isPreviousTabChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'activate-previous-tab');
      return;
    }

    if (tabNumberShortcut !== null) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'activate-tab-index', tabNumberShortcut);
      return;
    }

    if (isFindChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'find-in-page');
      return;
    }

    if (isDownloadsChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'open-downloads');
      return;
    }

    if (isPrintChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'print-page');
      return;
    }

    if (isReopenClosedTabChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'reopen-closed-tab');
      return;
    }

    if (isAppDevToolsChord) {
      event.preventDefault();
      logDebug('shortcut', 'app-devtools-shortcut-from-window', {
        windowId: win.id,
        key,
        control: input.control,
        meta: input.meta,
        shift: input.shift,
      });
      toggleWindowDevTools(win);
      return;
    }

    if (isDevToolsChord) {
      event.preventDefault();
      if (toggleFocusedBrowserDevTools()) {
        return;
      }
      markHostDevToolsSuppressedForShortcut(win);
      win.webContents.send('app-shortcut', 'toggle-devtools');
    }
  });

  return win;
}

function routeIncomingBrowserUrl(rawUrl: string): void {
  const normalized = normalizeIncomingBrowserUrl(rawUrl);
  if (!normalized) return;

  const focusedWindow = BrowserWindow.getFocusedWindow();
  const focusedBrowserWindow =
    focusedWindow && !focusedWindow.isDestroyed() && !onboardingWindowIds.has(focusedWindow.id)
      ? focusedWindow
      : null;
  const fallbackWindow = getFirstBrowserWindow();
  const targetWindow = focusedBrowserWindow ?? fallbackWindow;

  if (targetWindow && !targetWindow.isDestroyed()) {
    if (targetWindow.isMinimized()) targetWindow.restore();
    targetWindow.focus();
    if (targetWindow.webContents.isLoadingMainFrame()) {
      enqueueIncomingBrowserUrl(normalized);
      return;
    }
    targetWindow.webContents.send('open-url-in-new-tab', normalized);
    return;
  }

  enqueueIncomingBrowserUrl(normalized);
  createWindow();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const launchUrlFromArgs = extractIncomingBrowserUrlFromArgv(process.argv);
  if (launchUrlFromArgs) {
    enqueueIncomingBrowserUrl(launchUrlFromArgs);
  }

  app.on('second-instance', (_event, commandLine) => {
    const incomingUrl = extractIncomingBrowserUrlFromArgv(commandLine);
    if (incomingUrl) {
      if (app.isReady()) {
        routeIncomingBrowserUrl(incomingUrl);
      } else {
        enqueueIncomingBrowserUrl(incomingUrl);
      }
      return;
    }

    const firstWindow =
      getFirstBrowserWindow()
      ?? BrowserWindow.getAllWindows().find((win) => !win.isDestroyed())
      ?? null;
    if (!firstWindow) return;
    if (firstWindow.isMinimized()) firstWindow.restore();
    firstWindow.focus();
  });

  if (isMacOS) {
    app.on('open-url', (event, url) => {
      event.preventDefault();
      if (app.isReady()) {
        routeIncomingBrowserUrl(url);
        return;
      }
      enqueueIncomingBrowserUrl(url);
    });

    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      const fileUrl = pathToFileURL(filePath).toString();
      if (app.isReady()) {
        routeIncomingBrowserUrl(fileUrl);
        return;
      }
      enqueueIncomingBrowserUrl(fileUrl);
    });
  }
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  logDebug('startup', 'logger-ready', {
    packaged: app.isPackaged,
    platform: process.platform,
    userData: getSafeUserDataPath(),
    pid: process.pid,
  });

  await loadHistory().catch(() => undefined);
  await loadCachedAdBlockHosts().catch(() => undefined);
  await loadBundledTrackerBlockHosts().catch(() => undefined);
  await loadPersistedAppState().catch(() => undefined);
  await loadPersistedSessionSnapshot().catch(() => undefined);
  setupHistoryHandlers();
  setupSessionHandlers();
  setupUpdateHandlers();
  setupWebviewTabOpenHandler();
  setupAdBlocker();
  setupWindowControlsHandlers();
  setupDefaultBrowserHandlers();
  setupIncomingUrlHandlers();
  setupOnboardingHandlers();
  setupApplicationMenu();
  setupMacDockMenu();
  scheduleAdBlockListRefresh();
  setupDownloadHandlers();

  if (shouldShowOnboarding()) {
    createOnboardingWindow();
  } else {
    createWindow();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (shouldShowOnboarding()) {
      createOnboardingWindow();
    } else {
      createWindow();
    }
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
