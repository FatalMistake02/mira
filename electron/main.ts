import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell, session } from 'electron';
import { v4 as uuidv4 } from 'uuid'; // install uuid ^9
import type { DownloadItem } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Store active downloads by ID
const downloadMap = new Map<string, DownloadItem>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const isMacOS = process.platform === 'darwin';

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

let historyCache: HistoryEntry[] = [];
const OPEN_TAB_DEDUPE_WINDOW_MS = 500;
const recentOpenTabByHost = new Map<number, { url: string; openedAt: number }>();
let adBlockEnabled = true;
let quitOnLastWindowClose = false;
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

  ipcMain.handle('history-delete', async (_, id: string) => {
    return deleteHistoryEntry(typeof id === 'string' ? id : '');
  });

  ipcMain.handle('history-clear', async () => {
    return clearHistory();
  });
}

function setupDownloadHandlers() {
  const ses = session.defaultSession;

  const sendToItemWindow = (item: DownloadItem, channel: string, payload: Record<string, unknown>) => {
    const sourceContents = item.getWebContents();
    const sourceWindow = sourceContents ? BrowserWindow.fromWebContents(sourceContents) : null;
    const targetWindow = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null;
    if (!targetWindow) return;
    targetWindow.webContents.send(channel, payload);
  };

  // Every download gets a UUID so the renderer can track it
  ses.on('will-download', (event, item) => {
    const downloadId = uuidv4(); // unique id for this download
    const filename = item.getFilename();

    // Store the download item so we can cancel it later
    downloadMap.set(downloadId, item);

    // Tell the renderer a new download started
    sendToItemWindow(item, 'download-start', {
      id: downloadId,
      url: item.getURL(),
      filename,
      totalBytes: item.getTotalBytes(),
    });

    // Progress updates
    item.on('updated', (_, state) => {
      if (state === 'interrupted') {
        sendToItemWindow(item, 'download-error', {
          id: downloadId,
          error: 'interrupted',
        });
        return;
      }
      sendToItemWindow(item, 'download-progress', {
        id: downloadId,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
    });

    // Finished
    item.once('done', (e, state) => {
      // Clean up the map
      downloadMap.delete(downloadId);

      if (state === 'completed') {
        sendToItemWindow(item, 'download-done', {
          id: downloadId,
          savePath: item.getSavePath(),
        });
      } else {
        sendToItemWindow(item, 'download-error', {
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
      const key = input.key.toLowerCase();
      const isPrimaryChord = (input.control || input.meta) && !input.shift;
      const isNewWindowChord = isPrimaryChord && key === 'n';

      if (!isNewWindowChord) return;

      event.preventDefault();
      const hostWindow = BrowserWindow.fromWebContents(host);
      if (!hostWindow || hostWindow.isDestroyed()) return;
      createWindow(hostWindow);
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

function createWindow(sourceWindow?: BrowserWindow, initialUrl?: string): BrowserWindow {
  const sourceBounds = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow.getBounds() : null;
  const win = new BrowserWindow({
    x: sourceBounds ? sourceBounds.x + 24 : undefined,
    y: sourceBounds ? sourceBounds.y + 24 : undefined,
    width: 1200,
    height: 800,
    frame: !isMacOS ? false : true,
    titleBarStyle: isMacOS ? 'hiddenInset' : undefined,
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

  win.webContents.on('before-input-event', (event, input) => {
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
      createWindow(win);
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
  setupHistoryHandlers();
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
