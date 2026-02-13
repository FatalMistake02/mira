import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_BROWSER_SETTINGS,
  getBrowserSettings,
  saveBrowserSettings,
  type TabSleepMode,
} from '../features/settings/browserSettings';
import { applyTheme } from '../features/themes/applyTheme';
import {
  deleteCustomTheme,
  getAllThemes,
  getThemeById,
  importThemeFromJson,
  type ThemeEntry,
} from '../features/themes/themeLoader';

export default function Settings() {
  const AUTO_SAVE_DELAY_MS = 300;
  const SAVED_BADGE_MS = 1600;

  const initialSettings = getBrowserSettings();
  const [newTabPage, setNewTabPage] = useState(() => initialSettings.newTabPage);
  const [themeId, setThemeId] = useState(() => initialSettings.themeId);
  const [tabSleepValue, setTabSleepValue] = useState(() => initialSettings.tabSleepValue);
  const [tabSleepUnit, setTabSleepUnit] = useState(() => initialSettings.tabSleepUnit);
  const [tabSleepMode, setTabSleepMode] = useState(() => initialSettings.tabSleepMode);
  const [adBlockEnabled, setAdBlockEnabled] = useState(() => initialSettings.adBlockEnabled);
  const [themes, setThemes] = useState<ThemeEntry[]>(() => getAllThemes());
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isFirstAutoSaveRef = useRef(true);
  const clearSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReset = () => {
    setNewTabPage(DEFAULT_BROWSER_SETTINGS.newTabPage);
    setThemeId(DEFAULT_BROWSER_SETTINGS.themeId);
    setTabSleepValue(DEFAULT_BROWSER_SETTINGS.tabSleepValue);
    setTabSleepUnit(DEFAULT_BROWSER_SETTINGS.tabSleepUnit);
    setTabSleepMode(DEFAULT_BROWSER_SETTINGS.tabSleepMode);
    setAdBlockEnabled(DEFAULT_BROWSER_SETTINGS.adBlockEnabled);
    applyTheme(getThemeById(DEFAULT_BROWSER_SETTINGS.themeId));
    setThemes(getAllThemes());
    setImportMessage('');
    setSaveStatus('saving');
  };

  const handleThemeChange = (nextThemeId: string) => {
    setThemeId(nextThemeId);
    setSaveStatus('saving');
    applyTheme(getThemeById(nextThemeId));
  };

  const handleDeleteTheme = (deleteThemeId: string) => {
    const deleted = deleteCustomTheme(deleteThemeId);
    if (!deleted) return;

    const updatedThemes = getAllThemes();
    setThemes(updatedThemes);
    setSaveStatus('saving');

    if (themeId === deleteThemeId) {
      const fallbackThemeId = updatedThemes[0]?.id ?? DEFAULT_BROWSER_SETTINGS.themeId;
      setThemeId(fallbackThemeId);
      applyTheme(getThemeById(fallbackThemeId));
    }

    setImportMessage('Theme deleted.');
  };

  const handleImportTheme = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importThemeFromJson(text);
      const updatedThemes = getAllThemes();

      setThemes(updatedThemes);
      setThemeId(imported.id);
      applyTheme(imported.theme);
      setSaveStatus('saving');
      setImportMessage(`Imported: ${imported.theme.name} by ${imported.theme.author}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import theme JSON.';
      setImportMessage(message);
    }
  };

  useEffect(() => {
    if (isFirstAutoSaveRef.current) {
      isFirstAutoSaveRef.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveBrowserSettings({
        newTabPage,
        themeId,
        tabSleepValue,
        tabSleepUnit,
        tabSleepMode,
        adBlockEnabled,
      });
      setSaveStatus('saved');

      if (clearSavedTimerRef.current) {
        clearTimeout(clearSavedTimerRef.current);
      }
      clearSavedTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, SAVED_BADGE_MS);
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [newTabPage, themeId, tabSleepValue, tabSleepUnit, tabSleepMode, adBlockEnabled]);

  useEffect(() => {
    return () => {
      if (clearSavedTimerRef.current) {
        clearTimeout(clearSavedTimerRef.current);
      }
    };
  }, []);

  const selectedTheme = themes.find((entry) => entry.id === themeId) ?? themes[0] ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 720, background: 'var(--bg)' }}>
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
            setSaveStatus('saving');
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
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="tab-sleep-value" style={{ fontWeight: 600 }}>
          Tab Sleep Timeout
        </label>
        <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
          <input
            id="tab-sleep-value"
            type="number"
            min={1}
            step={1}
            value={tabSleepValue}
            onChange={(e) => {
              const nextValue = e.currentTarget.valueAsNumber;
              if (!Number.isFinite(nextValue)) return;
              setTabSleepValue(Math.max(1, Math.floor(nextValue)));
              setSaveStatus('saving');
            }}
            style={{
              width: 120,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #555',
              background: '#1f1f1f',
              color: '#fff',
            }}
          />
          <select
            id="tab-sleep-unit"
            value={tabSleepUnit}
            onChange={(e) => {
              const nextUnit = e.currentTarget.value;
              if (nextUnit === 'seconds' || nextUnit === 'minutes' || nextUnit === 'hours') {
                setTabSleepUnit(nextUnit);
              }
              setSaveStatus('saving');
            }}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #555',
              background: '#1f1f1f',
              color: '#fff',
            }}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
          <select
            id="tab-sleep-mode"
            value={tabSleepMode}
            onChange={(e) => {
              const nextMode = e.currentTarget.value;
              if (nextMode === 'freeze' || nextMode === 'discard') {
                setTabSleepMode(nextMode as TabSleepMode);
              }
              setSaveStatus('saving');
            }}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #555',
              background: '#1f1f1f',
              color: '#fff',
            }}
          >
            <option value="freeze">Freeze (keep page state)</option>
            <option value="discard">Discard (save more memory)</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="ad-block-enabled" style={{ fontWeight: 600 }}>
          Ad Blocker
        </label>
        <label
          htmlFor="ad-block-enabled"
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            id="ad-block-enabled"
            type="checkbox"
            checked={adBlockEnabled}
            onChange={(e) => {
              setAdBlockEnabled(e.currentTarget.checked);
              setSaveStatus('saving');
            }}
          />
          Enabled
        </label>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="theme-dropdown-button" style={{ fontWeight: 600 }}>
          Theme
        </label>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <button
            id="theme-dropdown-button"
            type="button"
            onClick={() => setThemeDropdownOpen((open) => !open)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #555',
              background: '#1f1f1f',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {selectedTheme
              ? `${selectedTheme.theme.name} - ${selectedTheme.theme.author}`
              : 'No themes available'}
          </button>

          {themeDropdownOpen && (
            <div
              style={{
                marginTop: 6,
                border: '1px solid #555',
                borderRadius: 6,
                background: '#1a1a1a',
                overflow: 'hidden',
              }}
            >
              {themes.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 6,
                    borderBottom: '1px solid #2d2d2d',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleThemeChange(entry.id);
                      setThemeDropdownOpen(false);
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: entry.id === themeId ? '1px solid #3b7cff' : '1px solid #3d3d3d',
                      background: entry.id === themeId ? '#1f2f4f' : '#242424',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {entry.theme.name} - {entry.theme.author}
                  </button>

                  {entry.source === 'custom' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTheme(entry.id)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #7a3b3b',
                        background: '#3b1f1f',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            type="button"
            style={{ padding: '8px 12px' }}
          >
            Add Theme JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportTheme}
            style={{ display: 'none' }}
          />
        </div>
        {!!importMessage && <div style={{ color: '#aaa', fontSize: 13 }}>{importMessage}</div>}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={handleReset} style={{ padding: '8px 12px' }}>
          Reset to Default
        </button>
        {saveStatus === 'saving' && <div style={{ alignSelf: 'center', color: '#f5c06a' }}>Saving...</div>}
        {saveStatus === 'saved' && <div style={{ alignSelf: 'center', color: '#67d86f' }}>Saved</div>}
      </div>
    </div>
  );
}
