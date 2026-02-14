import { useEffect, useState } from 'react';
import { electron } from '../electronBridge';
import appIcon from '../assets/mira_icon.png';
import appWordmark from '../assets/mira.png';

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3 1.5h5.5V7M1.5 3h5.5v5.5H1.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2 2l6 6M8 2L2 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TopBar({ children }: { children?: React.ReactNode }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const platformFromUAData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform;
    const platform = (platformFromUAData || navigator.platform || navigator.userAgent || '').toLowerCase();
    const isMac = platform.includes('mac');
    setIsMacOS(isMac);

    electron?.ipcRenderer
      .invoke<boolean>('window-is-fullscreen')
      .then((value) => setIsFullscreen(!!value))
      .catch(() => undefined);

    const onFullscreenChanged = (_event: unknown, value: boolean) => {
      setIsFullscreen(!!value);
    };

    electron?.ipcRenderer.on('window-fullscreen-changed', onFullscreenChanged);

    if (isMac) {
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
  }, []);

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
  ) : (
    <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' as const }}>
      <button
        title="Minimize"
        onClick={onMinimize}
        className="theme-btn theme-btn-nav"
        style={{
          width: 44,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        <MinimizeIcon />
      </button>
      <button
        title={isMaximized ? 'Restore' : 'Maximize'}
        onClick={onToggleMaximize}
        className="theme-btn theme-btn-nav"
        style={{
          width: 44,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        title="Close"
        onClick={onClose}
        className="theme-btn theme-btn-nav"
        style={{
          width: 48,
          height: 38,
          borderRadius: 0,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        <CloseIcon />
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
