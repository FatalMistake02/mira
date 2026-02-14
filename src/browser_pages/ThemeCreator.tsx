import { useEffect, useMemo, useState } from 'react';
import { applyTheme } from '../features/themes/applyTheme';
import {
  getAllThemes,
  getThemeById,
  importThemeFromJson,
  type ThemeEntry,
} from '../features/themes/themeLoader';
import { getBrowserSettings, saveBrowserSettings } from '../features/settings/browserSettings';
import type { Theme, ThemeMode } from '../themes/types';
import { getThemeColorDisplayName } from '../themes/colorVariableToDisplayName';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CSS_VAR_PATTERN = /^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/;

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;

  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function resolveColorValue(
  key: string,
  colors: Record<string, string>,
  fallbackColors: Record<string, string>,
  visited: Set<string>,
): string | null {
  if (visited.has(key)) return null;
  visited.add(key);

  const candidate = (colors[key] ?? fallbackColors[key] ?? '').trim();
  const normalizedHex = normalizeHexColor(candidate);
  if (normalizedHex) return normalizedHex;

  const varMatch = candidate.match(CSS_VAR_PATTERN);
  if (varMatch) {
    return resolveColorValue(varMatch[1], colors, fallbackColors, visited);
  }

  return null;
}

function createEditableColors(baseTheme: Theme, fallbackTheme: Theme): Record<string, string> {
  const allKeys = Array.from(
    new Set([...Object.keys(fallbackTheme.colors), ...Object.keys(baseTheme.colors)]),
  ).sort();

  const result: Record<string, string> = {};
  allKeys.forEach((key) => {
    const resolved =
      resolveColorValue(key, baseTheme.colors, fallbackTheme.colors, new Set<string>()) ??
      normalizeHexColor(fallbackTheme.colors[key]) ??
      '#000000';
    result[key] = resolved;
  });
  return result;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ThemeCreator() {
  const [themes, setThemes] = useState<ThemeEntry[]>(() => getAllThemes());
  const fallbackTheme = themes.find((entry) => entry.id === 'default_dark')?.theme ?? themes[0]?.theme;
  const initialThemeEntry = themes[0] ?? null;

  const [baseThemeId, setBaseThemeId] = useState<string>(initialThemeEntry?.id ?? '');
  const [themeName, setThemeName] = useState('My Theme');
  const [themeAuthor, setThemeAuthor] = useState('Me');
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    initialThemeEntry?.theme.mode ?? fallbackTheme?.mode ?? 'dark',
  );
  const [colors, setColors] = useState<Record<string, string>>(() =>
    initialThemeEntry && fallbackTheme
      ? createEditableColors(initialThemeEntry.theme, fallbackTheme)
      : {},
  );
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true);
  const [exportMessage, setExportMessage] = useState('');

  const selectedThemeEntry: ThemeEntry | null =
    themes.find((entry) => entry.id === baseThemeId) ?? initialThemeEntry;

  useEffect(() => {
    if (!selectedThemeEntry || !fallbackTheme) return;

    setThemeMode(selectedThemeEntry.theme.mode);
    setColors(createEditableColors(selectedThemeEntry.theme, fallbackTheme));
  }, [baseThemeId, fallbackTheme, selectedThemeEntry]);

  const editableKeys = useMemo(() => Object.keys(colors).sort(), [colors]);

  useEffect(() => {
    if (!livePreviewEnabled) return;

    const previewTheme: Theme = {
      name: themeName.trim() || 'My Theme',
      author: themeAuthor.trim() || 'Me',
      mode: themeMode,
      colors,
    };
    applyTheme(previewTheme);
  }, [themeName, themeAuthor, themeMode, colors, livePreviewEnabled]);

  useEffect(() => {
    if (livePreviewEnabled) return;

    const settingsThemeId = getBrowserSettings().themeId;
    applyTheme(getThemeById(settingsThemeId));
  }, [livePreviewEnabled]);

  const handleExport = () => {
    const trimmedName = themeName.trim() || 'My Theme';
    const trimmedAuthor = themeAuthor.trim() || 'Me';
    const payload: Theme = {
      name: trimmedName,
      author: trimmedAuthor,
      mode: themeMode,
      colors,
    };
    const filename = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
    setExportMessage(`Exported ${filename}`);
  };

  const handleExportLoadAndSelect = () => {
    try {
      const trimmedName = themeName.trim() || 'My Theme';
      const trimmedAuthor = themeAuthor.trim() || 'Me';
      const payload: Theme = {
        name: trimmedName,
        author: trimmedAuthor,
        mode: themeMode,
        colors,
      };
      const json = JSON.stringify(payload, null, 2);
      const imported = importThemeFromJson(json);
      saveBrowserSettings({ themeId: imported.id });
      applyTheme(imported.theme);
      setThemes(getAllThemes());
      setBaseThemeId(imported.id);
      setExportMessage(`Loaded and selected: ${imported.theme.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load and select theme.';
      setExportMessage(message);
    }
  };

  if (!themes.length || !fallbackTheme) {
    return (
      <div style={{ padding: 20, color: 'var(--text1)', background: 'var(--bg)', minHeight: '100%' }}>
        No themes are available to use as a base.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 960,
        margin: '0 auto',
        background: 'var(--bg)',
        color: 'var(--text1)',
        minHeight: '100%',
      }}
    >
      <h1 style={{ marginTop: 0 }}>Theme Creator</h1>
      <p className="theme-text2" style={{ marginTop: 0 }}>
        Pick a base theme, tweak colors, and export JSON.
      </p>

      <div style={{ marginTop: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={handleExport} className="theme-btn theme-btn-go" style={{ padding: '8px 12px' }}>
          Export JSON
        </button>
        <button
          type="button"
          onClick={handleExportLoadAndSelect}
          className="theme-btn theme-btn-nav"
          style={{ padding: '8px 12px' }}
        >
          Export, Load, and Select
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6, userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={livePreviewEnabled}
            onChange={(e) => setLivePreviewEnabled(e.currentTarget.checked)}
          />
          <span className="theme-text2">Live Preview</span>
        </label>
        {!!exportMessage && <span className="theme-text2">{exportMessage}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Base Theme</span>
          <select
            value={baseThemeId}
            onChange={(e) => {
              setBaseThemeId(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          >
            {themes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.theme.name} - {entry.theme.author} ({entry.theme.mode})
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Name</span>
          <input
            value={themeName}
            onChange={(e) => {
              setThemeName(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Author</span>
          <input
            value={themeAuthor}
            onChange={(e) => {
              setThemeAuthor(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Mode</span>
          <select
            value={themeMode}
            onChange={(e) => {
              const nextMode = e.currentTarget.value;
              if (nextMode === 'light' || nextMode === 'dark') {
                setThemeMode(nextMode);
                setExportMessage('');
              }
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {editableKeys.map((key) => (
          <label
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 1fr) auto minmax(120px, 180px)',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              border: '1px solid var(--tabBorder)',
              borderRadius: 6,
              background: 'var(--surfaceBg)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span>{getThemeColorDisplayName(key)}</span>
              <span className="theme-text3" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {key}
              </span>
            </span>
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => {
                const next = e.currentTarget.value;
                setColors((prev) => ({ ...prev, [key]: next }));
                setExportMessage('');
              }}
              style={{ width: 40, height: 30, border: 0, background: 'transparent', padding: 0 }}
            />
            <input
              value={colors[key]}
              onChange={(e) => {
                const normalized = normalizeHexColor(e.currentTarget.value);
                if (!normalized) return;
                setColors((prev) => ({ ...prev, [key]: normalized }));
                setExportMessage('');
              }}
              className="theme-input"
              style={{ padding: '6px 8px', fontFamily: 'monospace' }}
            />
          </label>
        ))}
      </div>

    </div>
  );
}
