import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useTabs } from '../features/tabs/TabsProvider';
import DownloadButton from './DownloadButton';
import { getBrowserSettings } from '../features/settings/browserSettings';

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

export default function AddressBar({ inputRef }: AddressBarProps) {
  const { tabs, activeId, navigate, goBack, goForward, reload, newTab, setActive } = useTabs();
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

  const isSupportedProtocol = (url: string) => {
    const normalized = url.toLowerCase();
    return (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('file://') ||
      normalized.startsWith('mira://') ||
      normalized.startsWith('data:')
    );
  };

  const go = () => {
    const raw = input.trim();
    if (!raw) return;

    let finalUrl: string;
    if (isSupportedProtocol(raw)) {
      finalUrl = raw;
    } else if (raw.includes('.')) {
      finalUrl = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    } else {
      const query = encodeURIComponent(raw);
      finalUrl = `https://www.google.com/search?q=${query}`;
    }

    navigate(finalUrl);
  };

  const activeTab = tabs.find((t) => t.id === activeId);
  const canGoBack = activeTab && activeTab.historyIndex > 0;
  const canGoForward = activeTab && activeTab.historyIndex < activeTab.history.length - 1;
  const newTabPage = getBrowserSettings().newTabPage;

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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: 6,
        gap: 4,
        background: 'var(--surfaceBgHover, var(--tabBgHover))',
        borderTop: '1px solid var(--surfaceBorder, var(--tabBorder))',
      }}
    >
      <button
        onClick={goBack}
        disabled={!canGoBack}
        title="Back"
        className="theme-btn theme-btn-nav"
        style={{
          padding: '4px 8px',
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
        className="theme-btn theme-btn-nav"
        style={{
          padding: '4px 8px',
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
        className="theme-btn theme-btn-nav"
        style={{
          padding: '4px 8px',
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
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="Enter URL"
        className="theme-input"
        style={{
          flex: 1,
          padding: '6px 10px',
          fontSize: 16,
        }}
      />

      <DownloadButton />

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          title="Menu"
          className="theme-btn theme-btn-nav"
          style={{
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 2,
          }}
        >
          <ChevronDown size={16} strokeWidth={2.1} aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            className="theme-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 160,
              borderRadius: 8,
              overflow: 'hidden',
              zIndex: 1200,
              padding: 6,
            }}
          >
            <button
              type="button"
              className="theme-btn theme-btn-nav"
              style={{ width: '100%', textAlign: 'left', padding: '6px 8px' }}
              onClick={() => {
                const existingSettingsTab = tabs.find((tab) => tab.url === 'mira://Settings');

                if (existingSettingsTab) {
                  setActive(existingSettingsTab.id);
                } else if (activeTab?.url === newTabPage) {
                  navigate('mira://Settings');
                } else {
                  newTab('mira://Settings');
                }
                setMenuOpen(false);
              }}
            >
              Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
