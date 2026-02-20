import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Plus,
  Printer,
  RotateCw,
  Settings2,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { useTabs } from '../features/tabs/TabsProvider';
import DownloadButton from './DownloadButton';
import { getBrowserSettings, getSearchUrlFromInput } from '../features/settings/browserSettings';
import { electron } from '../electronBridge';

function ReloadIcon() {
  return <RotateCw size={16} strokeWidth={1.9} aria-hidden="true" />;
}

function BackIcon() {
  return <ChevronLeft size={16} strokeWidth={2.1} aria-hidden="true" />;
}

function ForwardIcon() {
  return <ChevronRight size={16} strokeWidth={2.1} aria-hidden="true" />;
}

type AddressBarProps = {
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

type AddressMenuAction = {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  danger?: boolean;
  onSelect: () => void;
};

export default function AddressBar({ inputRef }: AddressBarProps) {
  const {
    tabs,
    activeId,
    navigate,
    goBack,
    goForward,
    reload,
    newTab,
    openHistory,
    openDownloads,
    setActive,
    printPage,
  } = useTabs();
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeId);
    if (!activeTab) return;

    if (activeTab.url === getBrowserSettings().newTabPage) {
      setInput('');
    } else {
      setInput(activeTab.url);
    }
  }, [tabs, activeId]);

  const isSupportedProtocol = (value: string) => {
    const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*:)/i);
    if (!schemeMatch) return false;
    const scheme = schemeMatch[1].toLowerCase();
    return (
      scheme === 'http:' ||
      scheme === 'https:' ||
      scheme === 'file:' ||
      scheme === 'about:' ||
      scheme === 'mira:' ||
      scheme === 'data:' ||
      scheme === 'view-source:'
    );
  };

  const isIpv4Host = (hostname: string) => {
    const parts = hostname.split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const value = Number.parseInt(part, 10);
      return value >= 0 && value <= 255;
    });
  };

  const isLikelyDomainOrHost = (hostname: string) => {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'localhost') return true;
    if (isIpv4Host(normalized)) return true;
    if (normalized.includes(':')) return true; // IPv6 style host
    if (!normalized.includes('.')) return false;

    const labels = normalized.split('.');
    return labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/i.test(label) &&
        !label.startsWith('-') &&
        !label.endsWith('-'),
    );
  };

  const isLikelyDomainOrUrl = (value: string) => {
    if (/\s/.test(value)) return false;
    if (isSupportedProtocol(value)) return true;

    // Unknown explicit schemes (for example "javascript:") should be searched.
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;

    const candidate = value.startsWith('//') ? `https:${value}` : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return isLikelyDomainOrHost(parsed.hostname);
    } catch {
      return false;
    }
  };

  const go = () => {
    const raw = input.trim();
    if (!raw) return;

    let finalUrl: string;
    if (isSupportedProtocol(raw)) {
      finalUrl = raw;
    } else if (isLikelyDomainOrUrl(raw)) {
      finalUrl = raw.startsWith('//') ? `https:${raw}` : `https://${raw}`;
    } else {
      const settings = getBrowserSettings();
      finalUrl = getSearchUrlFromInput(
        raw,
        settings.searchEngine,
        settings.searchEngineShortcutsEnabled,
        settings.searchEngineShortcutPrefix,
        settings.searchEngineShortcutChars,
      );
    }

    navigate(finalUrl);
  };

  const activeTab = tabs.find((t) => t.id === activeId);
  const canGoBack = activeTab && activeTab.historyIndex > 0;
  const canGoForward = activeTab && activeTab.historyIndex < activeTab.history.length - 1;
  const newTabPage = getBrowserSettings().newTabPage;
  const primaryModifierLabel = electron?.isMacOS ? 'Cmd' : 'Ctrl';
  const openNewWindow = () => {
    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('window-new').catch(() => undefined);
      return;
    }
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };
  const closeWindow = () => {
    if (electron?.ipcRenderer) {
      electron.ipcRenderer.invoke('window-close').catch(() => undefined);
      return;
    }
    window.close();
  };

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const openSettings = () => {
    const existingSettingsTab = tabs.find((tab) => tab.url === 'mira://Settings');

    if (existingSettingsTab) {
      setActive(existingSettingsTab.id);
    } else if (activeTab?.url === newTabPage) {
      navigate('mira://Settings');
    } else {
      newTab('mira://Settings');
    }
  };

  const menuActions: AddressMenuAction[] = [
    {
      id: 'new-tab',
      label: 'New Tab',
      shortcut: `${primaryModifierLabel}+T`,
      icon: Plus,
      onSelect: () => newTab(),
    },
    {
      id: 'new-window',
      label: 'New Window',
      shortcut: `${primaryModifierLabel}+N`,
      icon: SquareArrowOutUpRight,
      onSelect: openNewWindow,
    },
    {
      id: 'history',
      label: 'History',
      shortcut: `${primaryModifierLabel}+${electron?.isMacOS ? 'Y' : 'H'}`,
      icon: History,
      onSelect: openHistory,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      shortcut: `${primaryModifierLabel}+J`,
      icon: Download,
      onSelect: openDownloads,
    },
    {
      id: 'print',
      label: 'Print...',
      shortcut: `${primaryModifierLabel}+P`,
      icon: Printer,
      onSelect: printPage,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings2,
      onSelect: openSettings,
    },
    {
      id: 'close-window',
      label: 'Close Window',
      icon: X,
      danger: true,
      onSelect: closeWindow,
    },
  ];

  const onSelectMenuAction = (action: AddressMenuAction) => {
    action.onSelect();
    setMenuOpen(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--layoutAddressBarPaddingY, 6px)',
        gap: 4,
        background: 'var(--surfaceBgHover, var(--tabBgHover))',
        borderTop: '1px solid var(--surfaceBorder, var(--tabBorder))',
      }}
    >
      <button
        onClick={goBack}
        disabled={!canGoBack}
        title="Back"
        className="theme-btn theme-btn-nav nav-icon-btn"
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BackIcon />
      </button>

      <button
        onClick={goForward}
        disabled={!canGoForward}
        title="Forward"
        className="theme-btn theme-btn-nav nav-icon-btn"
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ForwardIcon />
      </button>

      <button
        onClick={reload}
        title="Refresh"
        className="theme-btn theme-btn-nav nav-icon-btn"
        style={{
          padding: '4px 8px',
          height: 'var(--layoutNavButtonHeight, 30px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ReloadIcon />
      </button>

      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onContextMenu={(e) => {
          const settings = getBrowserSettings();
          if (!settings.nativeTextFieldContextMenu) return;
          const ipc = electron?.ipcRenderer;
          if (!ipc) return;

          e.preventDefault();
          e.currentTarget.focus();
          void ipc
            .invoke('renderer-show-native-text-context-menu', {
              x: e.clientX,
              y: e.clientY,
            })
            .catch(() => undefined);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          go();
          e.currentTarget.blur();
        }}
        placeholder="Enter URL"
        className="theme-input"
        style={{
          flex: 1,
          padding: '6px 10px',
          minHeight: 'var(--layoutNavButtonHeight, 30px)',
          fontSize: 16,
        }}
      />

      <DownloadButton />

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          title="Menu"
          className={`theme-btn theme-btn-nav nav-icon-btn address-menu-trigger ${
            menuOpen ? 'address-menu-trigger-open' : ''
          }`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={{
            padding: '4px 8px',
            height: 'var(--layoutNavButtonHeight, 30px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 2,
          }}
        >
          <ChevronDown
            size={16}
            strokeWidth={2.1}
            aria-hidden="true"
            className="address-menu-trigger-icon"
          />
        </button>

        {menuOpen && (
          <div
            className="theme-panel address-menu-panel"
            role="menu"
            aria-label="Browser menu"
            style={{ zIndex: 1200 }}
          >
            {menuActions.slice(0, 6).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={`theme-btn address-menu-item ${action.danger ? 'address-menu-item-danger' : ''}`}
                  onClick={() => onSelectMenuAction(action)}
                >
                  <Icon size={14} className="address-menu-item-icon" />
                  <span className="address-menu-item-label">{action.label}</span>
                  {action.shortcut ? (
                    <span className="address-menu-item-shortcut">{action.shortcut}</span>
                  ) : (
                    <span className="address-menu-item-shortcut address-menu-item-shortcut-empty" />
                  )}
                </button>
              );
            })}
            <hr className="address-menu-divider" />
            {menuActions.slice(6).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={`theme-btn address-menu-item ${action.danger ? 'address-menu-item-danger' : ''}`}
                  onClick={() => onSelectMenuAction(action)}
                >
                  <Icon size={14} className="address-menu-item-icon" />
                  <span className="address-menu-item-label">{action.label}</span>
                  {action.shortcut ? (
                    <span className="address-menu-item-shortcut">{action.shortcut}</span>
                  ) : (
                    <span className="address-menu-item-shortcut address-menu-item-shortcut-empty" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
