import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { electron } from '../electronBridge';
import { getBrowserSettings } from '../features/settings/browserSettings';

type UpdateCheckPayload = {
  mode: 'portable' | 'installer';
  currentVersion: string;
  latestVersion: string;
  latestIsPrerelease: boolean;
  hasUpdate: boolean;
  releaseName: string;
  assetName: string;
  downloadUrl: string;
};

type UpdateCheckResponse = { ok: true; data: UpdateCheckPayload } | { ok: false; error: string };
type UpdateLaunchAutoSupportResponse = { canAutoInstall: boolean };

export default function Updates() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckPayload | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isRunningUpdateAction, setIsRunningUpdateAction] = useState(false);
  const [canAutoInstallOnLaunch, setCanAutoInstallOnLaunch] = useState(false);

  useEffect(() => {
    if (!electron?.ipcRenderer) return;
    let isSubscribed = true;
    void electron.ipcRenderer
      .invoke<UpdateLaunchAutoSupportResponse>('updates-launch-auto-support')
      .then((response) => {
        if (!isSubscribed) return;
        setCanAutoInstallOnLaunch(response.canAutoInstall === true);
      })
      .catch(() => undefined);
    return () => { isSubscribed = false; };
  }, []);

  useEffect(() => {
    void checkForUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!electron?.ipcRenderer) {
      setUpdateStatus('Update checks are only available in the desktop app.');
      return;
    }
    setIsCheckingUpdates(true);
    setUpdateStatus('');
    setUpdateCheckResult(null);
    try {
      const settings = getBrowserSettings();
      const response = await electron.ipcRenderer.invoke<UpdateCheckResponse>('updates-check', {
        includePrerelease: settings.includePrereleaseUpdates,
      });
      if (!response.ok) { setUpdateStatus(response.error); return; }
      const result = response.data;
      setUpdateCheckResult(result);
      setUpdateStatus(result.hasUpdate ? 'update-available' : 'up-to-date');
    } catch {
      setUpdateStatus('failed');
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const runUpdateAction = async () => {
    if (!electron?.ipcRenderer || !updateCheckResult?.hasUpdate) return;
    setIsRunningUpdateAction(true);
    try {
      if (updateCheckResult.mode === 'portable') {
        const response = await electron.ipcRenderer.invoke<{ ok: boolean; savedPath?: string; error?: string }>(
          'updates-download-asset',
          { downloadUrl: updateCheckResult.downloadUrl, assetName: updateCheckResult.assetName }
        );
        if (!response.ok) { setUpdateStatus(response.error || 'Failed to download update.'); return; }
        setUpdateStatus(response.savedPath ? `Downloaded: ${response.savedPath}` : 'Downloaded to Downloads folder.');
        return;
      }
      const response = await electron.ipcRenderer.invoke<{ ok: boolean; error?: string }>(
        'updates-download-and-install',
        { downloadUrl: updateCheckResult.downloadUrl, assetName: updateCheckResult.assetName }
      );
      if (!response.ok) { setUpdateStatus(response.error || 'Failed to download update.'); return; }
      setUpdateStatus('installer-launched');
    } catch {
      setUpdateStatus('Failed to run update action.');
    } finally {
      setIsRunningUpdateAction(false);
    }
  };

  const isUpToDate = updateStatus === 'up-to-date';
  const hasUpdate = updateCheckResult?.hasUpdate;

  return (
    <div style={{
      padding: '48px 40px',
      maxWidth: '720px',
      margin: '0 auto',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>

      {/* Page title */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{
          fontSize: '22px',
          fontWeight: 600,
          color: 'var(--text1)',
          margin: '0 0 6px 0',
          letterSpacing: '-0.3px',
        }}>
          Updates
        </h1>
        <p style={{ margin: 0, color: 'var(--text2)', fontSize: '14px' }}>
          Keep Mira updated for the latest features and fixes.
        </p>
      </div>

      {/* Version comparison block */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '0',
        alignItems: 'center',
        background: 'var(--surfaceBg)',
        border: '1px solid var(--surfaceBorder)',
        borderRadius: '16px',
        overflow: 'hidden',
        marginBottom: '24px',
      }}>
        {/* Current version */}
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text2)',
            marginBottom: '12px',
          }}>
            Installed
          </div>
          <div style={{
            fontSize: '36px',
            fontWeight: 700,
            letterSpacing: '-1px',
            color: 'var(--text1)',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: '8px',
          }}>
            {updateCheckResult ? `v${updateCheckResult.currentVersion}` : '—'}
          </div>
          <div style={{
            fontSize: '13px',
            color: isUpToDate ? '#10b981' : 'var(--text2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}>
            {isUpToDate && <CheckCircle size={13} />}
            {isUpToDate ? 'Up to date' : 'Current version'}
          </div>
        </div>

        {/* Divider arrow */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 8px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: hasUpdate ? 'color-mix(in srgb, #f59e0b 15%, transparent)' : 'var(--surfaceBorder)',
            border: `1px solid ${hasUpdate ? '#f59e0b' : 'var(--surfaceBorder)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ArrowRight size={14} color={hasUpdate ? '#f59e0b' : 'var(--text2)'} />
          </div>
        </div>

        {/* Latest version */}
        <div style={{
          padding: '32px',
          textAlign: 'center',
          background: hasUpdate
            ? 'color-mix(in srgb, #f59e0b 5%, transparent)'
            : 'transparent',
          borderLeft: `1px solid ${hasUpdate ? 'color-mix(in srgb, #f59e0b 25%, transparent)' : 'var(--surfaceBorder)'}`,
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text2)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}>
            {hasUpdate && <Sparkles size={11} color="#f59e0b" />}
            Latest
          </div>
          <div style={{
            fontSize: '36px',
            fontWeight: 700,
            letterSpacing: '-1px',
            color: hasUpdate ? '#f59e0b' : 'var(--text1)',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: '8px',
          }}>
            {updateCheckResult ? `v${updateCheckResult.latestVersion}` : '—'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {updateCheckResult?.latestIsPrerelease && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'color-mix(in srgb, #f59e0b 15%, transparent)',
                color: '#f59e0b',
                border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
              }}>
                Pre-release
              </span>
            )}
            {hasUpdate ? 'Available' : updateCheckResult ? 'No update' : 'Not checked'}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center' }}>
        {hasUpdate && (
          <button
            onClick={runUpdateAction}
            disabled={isRunningUpdateAction}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '10px 20px',
              background: '#f59e0b',
              color: '#000',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isRunningUpdateAction ? 'not-allowed' : 'pointer',
              opacity: isRunningUpdateAction ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <Download size={15} />
            {isRunningUpdateAction
              ? 'Installing…'
              : updateCheckResult?.mode === 'portable'
                ? 'Download update'
                : 'Install update'}
          </button>
        )}

        {typeof updateStatus === 'string' && !['update-available', 'up-to-date', 'failed', 'installer-launched', ''].includes(updateStatus) && (
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{updateStatus}</span>
        )}
        {updateStatus === 'installer-launched' && (
          <span style={{ fontSize: '13px', color: '#10b981' }}>Installer launched.</span>
        )}
        {updateStatus === 'failed' && (
          <span style={{ fontSize: '13px', color: '#ef4444' }}>Failed to check for updates.</span>
        )}
      </div>

      {/* Release notes */}
      {hasUpdate && updateCheckResult && (
        <div style={{
          border: '1px solid var(--surfaceBorder)',
          borderRadius: '16px',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--surfaceBorder)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text1)', marginBottom: '2px' }}>
                What's new in v{updateCheckResult.latestVersion}
              </div>
              {updateCheckResult.releaseName && (
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  {updateCheckResult.releaseName}
                </div>
              )}
            </div>
            {updateCheckResult.downloadUrl && (
              <a
                href={updateCheckResult.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '13px',
                  color: 'var(--text2)',
                  textDecoration: 'none',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--surfaceBorder)',
                  whiteSpace: 'nowrap',
                }}
              >
                <ExternalLink size={13} />
                View on GitHub
              </a>
            )}
          </div>

          <div style={{
            padding: '20px 24px',
            fontSize: '13.5px',
            lineHeight: '1.7',
            color: 'var(--text2)',
            background: 'var(--surfaceBg)',
          }}>
            {/* Placeholder changelog — replace with real data from API if available */}
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Performance improvements and stability fixes</li>
              <li>Enhanced security across update mechanisms</li>
              <li>UI refinements and accessibility improvements</li>
              <li>Bug fixes reported since the last release</li>
            </ul>
            <p style={{
              margin: '16px 0 0 0',
              fontSize: '12px',
              fontStyle: 'italic',
              color: 'color-mix(in srgb, var(--text2) 60%, transparent)',
            }}>
              For the full changelog, view the release on GitHub.
            </p>
          </div>
        </div>
      )}



      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}