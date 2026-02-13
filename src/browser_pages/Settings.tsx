import { useState } from 'react';
import {
  DEFAULT_BROWSER_SETTINGS,
  getBrowserSettings,
  saveBrowserSettings,
} from '../features/settings/browserSettings';

export default function Settings() {
  const [newTabPage, setNewTabPage] = useState(() => getBrowserSettings().newTabPage);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const next = saveBrowserSettings({ newTabPage });
    setNewTabPage(next.newTabPage);
    setSaved(true);
  };

  const handleReset = () => {
    const next = saveBrowserSettings({
      newTabPage: DEFAULT_BROWSER_SETTINGS.newTabPage,
    });
    setNewTabPage(next.newTabPage);
    setSaved(true);
  };

  return (
    <div style={{ padding: 20, maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Settings</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="new-tab-page" style={{ fontWeight: 600 }}>
          New Tab Page URL
        </label>
        <input
          id="new-tab-page"
          type="text"
          value={newTabPage}
          onChange={(e) => {
            setNewTabPage(e.target.value);
            setSaved(false);
          }}
          placeholder={DEFAULT_BROWSER_SETTINGS.newTabPage}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #555',
            background: '#1f1f1f',
            color: '#fff',
          }}
        />
        <div style={{ color: '#aaa', fontSize: 13 }}>
          Used when creating a new tab. Default: {DEFAULT_BROWSER_SETTINGS.newTabPage}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={handleSave} style={{ padding: '8px 12px' }}>
          Save
        </button>
        <button onClick={handleReset} style={{ padding: '8px 12px' }}>
          Reset to Default
        </button>
        {saved && <div style={{ alignSelf: 'center', color: '#67d86f' }}>Saved</div>}
      </div>
    </div>
  );
}
