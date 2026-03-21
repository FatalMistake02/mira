import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { electron } from '../electronBridge';

export type UpdateCheckPayload = {
  mode: 'portable' | 'installer';
  currentVersion: string;
  latestVersion: string;
  latestIsPrerelease: boolean;
  hasUpdate: boolean;
  releaseName: string;
  assetName: string;
  downloadUrl: string;
};

type Props = {
  open: boolean;
  update: UpdateCheckPayload | null;
  onLater: () => void;
  onView?: () => void;
};

export default function UpdatePrompt({ open, update, onLater, onView }: Props) {
  const [status, setStatus] = useState('');
  const [isRunningUpdateAction, setIsRunningUpdateAction] = useState(false);

  useEffect(() => {
    if (!open) {
      setStatus('');
      setIsRunningUpdateAction(false);
    }
  }, [open, update?.latestVersion, update?.assetName]);

  if (!open || !update) return null;

  const prereleaseLabel = update.latestIsPrerelease ? ' (pre-release)' : '';
  const updateSummary = `Mira v${update.latestVersion}${prereleaseLabel} is ready to install. You're on v${update.currentVersion}.`;

  const runUpdateAction = async () => {
    if (!electron?.ipcRenderer) {
      setStatus('Updates are only available in the desktop app.');
      return;
    }
    if (isRunningUpdateAction) return;

    setIsRunningUpdateAction(true);
    setStatus('');
    try {
      if (update.mode === 'portable') {
        const response = await electron.ipcRenderer.invoke<{
          ok: boolean;
          savedPath?: string;
          error?: string;
        }>('updates-download-asset', {
          downloadUrl: update.downloadUrl,
          assetName: update.assetName,
        });
        if (!response.ok) {
          setStatus(response.error || 'Failed to download update.');
          return;
        }

        setStatus(
          response.savedPath
            ? `Portable update downloaded: ${response.savedPath}`
            : 'Portable update downloaded to your Downloads folder.',
        );
        return;
      }

      const response = await electron.ipcRenderer.invoke<{ ok: boolean; error?: string }>(
        'updates-download-and-install',
        {
          downloadUrl: update.downloadUrl,
          assetName: update.assetName,
        },
      );
      if (!response.ok) {
        setStatus(response.error || 'Failed to download update.');
        return;
      }

      setStatus('Update downloaded. Installer launched.');
    } catch {
      setStatus('Failed to run update action.');
    } finally {
      setIsRunningUpdateAction(false);
    }
  };

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
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <h3 style={{ margin: '0 0 8px 0' }} className="theme-text1">
          Update Available
        </h3>
        <p style={{ margin: '0 0 14px 0', fontSize: 13, lineHeight: 1.4 }} className="theme-text2">
          {updateSummary}
        </p>
        {!!status && (
          <div style={{ margin: '0 0 12px 0', fontSize: 12 }} className="theme-text2">
            {status}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onLater}
            className="theme-btn theme-btn-nav"
            style={{ padding: '7px 12px' }}
            disabled={isRunningUpdateAction}
          >
            Update Later
          </button>
          {onView && (
            <button
              onClick={onView}
              className="theme-btn theme-btn-nav"
              style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              disabled={isRunningUpdateAction}
            >
              <Eye size={14} />
              View
            </button>
          )}
          <button
            onClick={runUpdateAction}
            className="theme-btn theme-btn-go"
            style={{ padding: '7px 12px' }}
            disabled={isRunningUpdateAction}
          >
            {isRunningUpdateAction ? 'Working...' : 'Update Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
