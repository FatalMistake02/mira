import { useEffect, useState } from 'react';
import { useTabs } from '../features/tabs/TabsProvider';
import DownloadButton from './DownloadButton';
import { getBrowserSettings } from '../features/settings/browserSettings';

function ReloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13 3v4H9M3 13v-4h4M4.2 6.1A5 5 0 0 1 13 7M12 9a5 5 0 0 1-8.8 2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M10.5 3.5L5.5 8l5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5.5 3.5L10.5 8l-5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AddressBarProps = {
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export default function AddressBar({ inputRef }: AddressBarProps) {
  const { tabs, activeId, navigate, goBack, goForward, reload } = useTabs();
  const [input, setInput] = useState('');

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

      <button
        onClick={go}
        className="theme-btn theme-btn-go"
        style={{
          padding: '6px 12px',
          fontSize: 16,
        }}
      >
        Go
      </button>

      <DownloadButton />
    </div>
  );
}
