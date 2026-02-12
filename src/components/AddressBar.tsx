import { useState, useEffect } from 'react';
import { useTabs } from '../features/tabs/TabsProvider';

export default function AddressBar() {
  const { tabs, activeId, navigate, goBack, goForward, reload } = useTabs();

  const [input, setInput] = useState('');

  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeId);
    if (!activeTab) return;

    if (activeTab.url === 'mira://NewTab') {
      setInput('');
    } else {
      setInput(activeTab.url);
    }
  }, [tabs, activeId]);

  const go = () => {
    let url = input.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mira://')) {
      url = 'https://' + url;
    }

    navigate(url);
  };

  const activeTab = tabs.find((t) => t.id === activeId);
  const canGoBack = activeTab && activeTab.historyIndex > 0;
  const canGoForward = activeTab && activeTab.historyIndex < activeTab.history.length - 1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: 4,
        background: 'var(--address-bar-bg, #222)',
      }}
    >
      {/* ← Back */}
      <button
        onClick={goBack}
        disabled={!canGoBack}
        title="Back"
        style={{
          marginRight: 4,
          padding: '4px 8px',
          cursor: canGoBack ? 'pointer' : 'default',
        }}
      >
        ◀︎
      </button>

      {/* → Forward */}
      <button
        onClick={goForward}
        disabled={!canGoForward}
        title="Forward"
        style={{
          marginRight: 4,
          padding: '4px 8px',
          cursor: canGoForward ? 'pointer' : 'default',
        }}
      >
        ▶︎
      </button>

      {/* ↻ Refresh */}
      <button onClick={reload} title="Refresh" style={{ marginRight: 4, padding: '4px 8px' }}>
        ⟳
      </button>

      {/* URL input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="Enter URL"
        style={{
          flex: 1,
          padding: '6px 10px',
          fontSize: 16,
          borderRadius: 4,
          border: '1px solid #555',
          outline: 'none',
          background: 'var(--input-bg, #333)',
          color: 'var(--input-fg, #fff)',
        }}
      />

      {/* Go button */}
      <button
        onClick={go}
        style={{
          marginLeft: 4,
          padding: '6px 12px',
          fontSize: 16,
          borderRadius: 4,
          border: '1px solid #555',
          background: '#4285F4',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Go
      </button>
    </div>
  );
}
