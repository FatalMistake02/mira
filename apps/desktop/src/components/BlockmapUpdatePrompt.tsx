import { useEffect, useState } from 'react';
import { electron } from '../electronBridge';

interface BlockmapUpdateInfo {
  hasDifferentialUpdate: boolean;
  differentialSavings: number;
  version: string;
  releaseName: string;
  releaseNotes: string;
}

type Props = {
  open: boolean;
  onLater: () => void;
};

export default function BlockmapUpdatePrompt({ open, onLater }: Props) {
  const [status, setStatus] = useState('');
  const [isRunningUpdateAction, setIsRunningUpdateAction] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<BlockmapUpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ percent: 0, transferred: 0, total: 0 });

  useEffect(() => {
    if (!open) {
      setStatus('');
      setIsRunningUpdateAction(false);
      setUpdateInfo(null);
      setDownloadProgress({ percent: 0, transferred: 0, total: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!electron?.ipcRenderer) return;

    const handleUpdateAvailable = (data: BlockmapUpdateInfo) => {
      setUpdateInfo(data);
    };

    const handleDownloadProgress = (progress: { percent: number; transferred: number; total: number }) => {
      setDownloadProgress(progress);
    };

    const handleUpdateDownloaded = () => {
      setStatus('Update downloaded! Ready to install.');
      setIsRunningUpdateAction(false);
    };

    const handleUpdateError = (error: { message: string }) => {
      setStatus(error.message);
      setIsRunningUpdateAction(false);
    };

    electron.ipcRenderer.on('update-available', handleUpdateAvailable);
    electron.ipcRenderer.on('download-progress', handleDownloadProgress);
    electron.ipcRenderer.on('update-downloaded', handleUpdateDownloaded);
    electron.ipcRenderer.on('update-error', handleUpdateError);

    return () => {
      electron.ipcRenderer.off('update-available', handleUpdateAvailable);
      electron.ipcRenderer.off('download-progress', handleDownloadProgress);
      electron.ipcRenderer.off('update-downloaded', handleUpdateDownloaded);
      electron.ipcRenderer.off('update-error', handleUpdateError);
    };
  }, []);

  if (!open || !updateInfo) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const runUpdateAction = async () => {
    if (!electron?.ipcRenderer) {
      setStatus('Updates are only available in the desktop app.');
      return;
    }
    if (isRunningUpdateAction) return;

    setIsRunningUpdateAction(true);
    setStatus('Checking for updates...');
    
    try {
      // Check for updates
      const checkResponse = await electron.ipcRenderer.invoke('updates-check-blockmap');
      if (!checkResponse.ok) {
        setStatus(checkResponse.error || 'Failed to check for updates.');
        return;
      }

      setStatus('Downloading update...');
      
      // Download update (will use differential if available)
      const downloadResponse = await electron.ipcRenderer.invoke('updates-download-blockmap');
      if (!downloadResponse.ok) {
        setStatus(downloadResponse.error || 'Failed to download update.');
        return;
      }

      // The download progress and completion will be handled by event listeners
    } catch (error) {
      setStatus('Failed to run update action.');
      setIsRunningUpdateAction(false);
    }
  };

  const installUpdate = async () => {
    if (!electron?.ipcRenderer) {
      setStatus('Updates are only available in the desktop app.');
      return;
    }

    try {
      const response = await electron.ipcRenderer.invoke('updates-install-blockmap');
      if (!response.ok) {
        setStatus(response.error || 'Failed to install update.');
        return;
      }

      setStatus('Installing update and restarting...');
    } catch (error) {
      setStatus('Failed to install update.');
    }
  };

  const updateSummary = `Mira v${updateInfo.version} is ready to install.`;
  const differentialInfo = updateInfo.hasDifferentialUpdate 
    ? `🚀 Incremental update available - saving ${formatBytes(updateInfo.differentialSavings)}`
    : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        className="theme-panel"
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h3 style={{ margin: '0 0 8px 0' }} className="theme-text1">
          {updateInfo.hasDifferentialUpdate ? '🚀 Smart Update Available' : 'Update Available'}
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, lineHeight: 1.4 }} className="theme-text2">
          {updateSummary}
        </p>
        
        {differentialInfo && (
          <div style={{ 
            margin: '0 0 12px 0', 
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500
          }} className="theme-text1">
            {differentialInfo}
          </div>
        )}

        {updateInfo.releaseNotes && (
          <div style={{ 
            margin: '0 0 12px 0', 
            padding: '8px 12px',
            background: 'var(--bg2)',
            borderRadius: 6,
            fontSize: 12,
            maxHeight: 100,
            overflow: 'auto'
          }} className="theme-text2">
            <strong>Release Notes:</strong><br />
            <div dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }} />
          </div>
        )}

        {downloadProgress.percent > 0 && downloadProgress.percent < 100 && (
          <div style={{ margin: '0 0 12px 0' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: 12,
              marginBottom: 4
            }} className="theme-text2">
              <span>Downloading... {Math.round(downloadProgress.percent)}%</span>
              <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
            </div>
            <div style={{
              width: '100%',
              height: 4,
              background: 'var(--bg3)',
              borderRadius: 2,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${downloadProgress.percent}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {!!status && (
          <div style={{ margin: '0 0 16px 0', fontSize: 12 }} className="theme-text2">
            {status}
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onLater}
            className="theme-btn theme-btn-nav"
            style={{ padding: '8px 16px' }}
            disabled={isRunningUpdateAction}
          >
            Later
          </button>
          
          {!status.includes('downloaded') ? (
            <button
              onClick={runUpdateAction}
              className="theme-btn theme-btn-go"
              style={{ padding: '8px 16px' }}
              disabled={isRunningUpdateAction}
            >
              {isRunningUpdateAction ? 'Working...' : 'Download Update'}
            </button>
          ) : (
            <button
              onClick={installUpdate}
              className="theme-btn theme-btn-go"
              style={{ padding: '8px 16px' }}
              disabled={isRunningUpdateAction}
            >
              Install & Restart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
