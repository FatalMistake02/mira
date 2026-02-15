import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { electron } from '../electronBridge';
import appIcon from '../assets/mira_icon.png';
import appWordmark from '../assets/mira.png';

export default function TopBar({ children }: { children?: React.ReactNode }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMacOS = electron?.isMacOS ?? false;
  const isWindows = electron?.platform === 'win32';

  useEffect(() => {
    electron?.ipcRenderer
      .invoke<boolean>('window-is-fullscreen')
      .then((value) => setIsFullscreen(!!value))
      .catch(() => undefined);

    const onFullscreenChanged = (_event: unknown, value: boolean) => {
      setIsFullscreen(!!value);
    };

    electron?.ipcRenderer.on('window-fullscreen-changed', onFullscreenChanged);

    if (isMacOS) {
      return () => {
        electron?.ipcRenderer.off('window-fullscreen-changed', onFullscreenChanged);
      };
    }

    electron?.ipcRenderer
      .invoke<boolean>('window-is-maximized')
      .then((value) => setIsMaximized(!!value))
      .catch(() => undefined);

    const onMaximizedChanged = (_event: unknown, value: boolean) => {
      setIsMaximized(!!value);
    };

    electron?.ipcRenderer.on('window-maximized-changed', onMaximizedChanged);
    return () => {
      electron?.ipcRenderer.off('window-fullscreen-changed', onFullscreenChanged);
      electron?.ipcRenderer.off('window-maximized-changed', onMaximizedChanged);
    };
  }, [isMacOS]);

  const onMinimize = () => {
    electron?.ipcRenderer.invoke('window-minimize').catch(() => undefined);
  };

  const onToggleMaximize = () => {
    if (isMacOS) return;
    electron?.ipcRenderer.invoke('window-maximize-toggle').catch(() => undefined);
  };

  const onClose = () => {
    electron?.ipcRenderer.invoke('window-close').catch(() => undefined);
  };

  const brandSection = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: isMacOS ? 0 : 10,
        paddingRight: isMacOS ? 10 : 0,
      }}
    >
      <img src={appIcon} alt="Mira" style={{ width: 16, height: 16 }} />
      <img
        src={appWordmark}
        alt="Mira"
        style={{ height: 25, width: 'auto', marginLeft: -6, transform: 'translateY(1px)' }}
      />
    </div>
  );

  const controlsSection = isMacOS ? (
    <div
      style={{
        width: isFullscreen ? 0 : 76,
        flexShrink: 0,
        transition: 'width 140ms ease',
      }}
    />
  ) : isWindows ? (
    <div
      style={{
        width: isFullscreen ? 0 : 138,
        flexShrink: 0,
        transition: 'width 140ms ease',
      }}
    />
  ) : (
    <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' as const }}>
      <button
        title="Minimize"
        onClick={onMinimize}
        className="theme-btn topbar-window-btn"
        style={{
          width: 44,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        <Minus size={14} strokeWidth={2.1} aria-hidden="true" />
      </button>
      <button
        title={isMaximized ? 'Restore' : 'Maximize'}
        onClick={onToggleMaximize}
        className="theme-btn topbar-window-btn"
        style={{
          width: 44,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        {isMaximized ? (
          <Copy size={13} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Square size={12} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
      <button
        title="Close"
        onClick={onClose}
        className="theme-btn topbar-window-btn topbar-window-btn-close"
        style={{
          width: 48,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div
      onDoubleClick={isMacOS ? undefined : onToggleMaximize}
      style={{
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surfaceBg, var(--tabBg))',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      {isMacOS ? controlsSection : brandSection}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'stretch',
          padding: '0 8px',
          WebkitAppRegion: 'drag',
        }}
      >
        <div style={{ WebkitAppRegion: 'no-drag', minWidth: 0, display: 'flex', maxWidth: '100%' }}>
          {children}
        </div>
      </div>

      {isMacOS ? brandSection : controlsSection}
    </div>
  );
}
