import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron/main';

// Configure electron-updater for blockmap updates
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'FatalMistake02',
  repo: 'mira'
});

// Enable blockmap for differential updates
autoUpdater.checkForUpdatesAndNotify = false; // Disable built-in notifications
autoUpdater.autoDownload = false; // We'll handle downloads manually

export class UpdateManager {
  private mainWindow: BrowserWindow | null = null;
  private updateInfo: unknown = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // When checking for updates
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      this.sendToRenderer('update-status', { status: 'checking' });
    });

    // When update available (this includes blockmap info)
    autoUpdater.on('update-available', (info: unknown) => {
      const updateInfo = info as any;
      console.log('Update available:', updateInfo.version);
      this.updateInfo = info;
      
      // Check if differential update is available
      const hasDifferential = !!(updateInfo.updateInfo?.hasDifferentialUpdate);
      const differentialSize = updateInfo.updateInfo?.differentialPackage?.size || 0;
      const fullSize = updateInfo.files?.[0]?.size || 0;

      this.sendToRenderer('update-available', {
        version: updateInfo.version,
        releaseName: updateInfo.releaseName,
        releaseNotes: updateInfo.releaseNotes,
        hasDifferentialUpdate: hasDifferential,
        differentialSize,
        fullSize,
        savings: fullSize - differentialSize
      });
    });

    // When no update available
    autoUpdater.on('update-not-available', (info: unknown) => {
      const updateInfo = info as any;
      console.log('Update not available');
      this.sendToRenderer('update-not-available', { version: updateInfo.version });
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj: unknown) => {
      const progress = progressObj as any;
      const { percent, transferred, total } = progress;
      console.log(`Download progress: ${percent}%`);
      this.sendToRenderer('download-progress', {
        percent,
        transferred,
        total
      });
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info: unknown) => {
      const updateInfo = info as any;
      console.log('Update downloaded');
      this.sendToRenderer('update-downloaded', { version: updateInfo.version });
    });

    // Error handling
    autoUpdater.on('error', (error: unknown) => {
      const err = error as any;
      console.error('Update error:', error);
      this.sendToRenderer('update-error', { 
        message: err.message || 'Unknown update error' 
      });
    });
  }

  // Check for updates (will automatically use blockmap if available)
  async checkForUpdates(includePrerelease = false): Promise<void> {
    try {
      // Set channel for prerelease if needed
      if (includePrerelease) {
        autoUpdater.allowPrerelease = true;
      }

      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
      this.sendToRenderer('update-error', { 
        message: error instanceof Error ? error.message : 'Failed to check updates' 
      });
    }
  }

  // Download update (will use differential if available)
  async downloadUpdate(): Promise<void> {
    try {
      if (!this.updateInfo) {
        throw new Error('No update available to download');
      }

      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      this.sendToRenderer('update-error', { 
        message: error instanceof Error ? error.message : 'Failed to download update' 
      });
    }
  }

  // Install update and restart
  installUpdate(): void {
    if (autoUpdater.isUpdateDownloaded()) {
      autoUpdater.quitAndInstall();
    } else {
      this.sendToRenderer('update-error', { 
        message: 'Update not downloaded yet' 
      });
    }
  }

  // Get current update info
  getUpdateInfo(): unknown {
    return this.updateInfo;
  }

  // Check if differential update is available
  hasDifferentialUpdate(): boolean {
    const info = this.updateInfo as any;
    return !!(info?.updateInfo?.hasDifferentialUpdate);
  }

  // Get size savings from differential update
  getDifferentialSavings(): number {
    const info = this.updateInfo as any;
    const differentialSize = info?.updateInfo?.differentialPackage?.size || 0;
    const fullSize = info?.files?.[0]?.size || 0;
    return fullSize - differentialSize;
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export default UpdateManager;
