import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
import { v4 as uuidv4 } from 'uuid'; // install uuid ^9
import type { DownloadItem } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Store active downloads by ID
const downloadMap = new Map<string, DownloadItem>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  setupDownloadHandlers(win);
});