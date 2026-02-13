import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
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

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

let historyCache: HistoryEntry[] = [];
const OPEN_TAB_DEDUPE_WINDOW_MS = 500;
const recentOpenTabByHost = new Map<number, { url: string; openedAt: number }>();

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
}

function setupDownloadHandlers(win: BrowserWindow) {
  const ses = session.defaultSession;

  // Every download gets a UUID so the renderer can track it
  ses.on('will-download', (event, item) => {
    const downloadId = uuidv4(); // unique id for this download
    const filename = item.getFilename();

    // Store the download item so we can cancel it later
    downloadMap.set(downloadId, item);

    // Tell the renderer a new download started
    win.webContents.send('download-start', {
      id: downloadId,
      url: item.getURL(),
      filename,
      totalBytes: item.getTotalBytes(),
    });

    // Progress updates
    item.on('updated', (_, state) => {
      if (state === 'interrupted') {
        win.webContents.send('download-error', {
          id: downloadId,
          error: 'interrupted',
        });
        return;
      }
      win.webContents.send('download-progress', {
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
        win.webContents.send('download-done', {
          id: downloadId,
          savePath: item.getSavePath(),
        });
      } else {
        win.webContents.send('download-error', {
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
    const host = contents.hostWebContents;
    if (!host) return;

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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/index.html');
  }

  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const isPrimaryChord = (input.control || input.meta) && !input.shift;
    const isReloadChord = isPrimaryChord && key === 'r';
    const isFindChord = isPrimaryChord && key === 'f';
    const isReloadKey = key === 'f5';
    if (isReloadChord || isReloadKey) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'reload-tab');
      return;
    }

    if (isFindChord) {
      event.preventDefault();
      win.webContents.send('app-shortcut', 'find-in-page');
    }
  });

  return win;
}

app.whenReady().then(async () => {
  await loadHistory().catch(() => undefined);
  setupHistoryHandlers();
  setupWebviewTabOpenHandler();
  const win = createWindow();
  setupDownloadHandlers(win);
});
