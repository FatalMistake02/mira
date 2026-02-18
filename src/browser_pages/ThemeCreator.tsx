import { useEffect, useMemo, useState } from 'react';
import { applyTheme } from '../features/themes/applyTheme';
import {
  getAllThemes,
  getThemeById,
  importThemeFromJson,
  type ThemeEntry,
} from '../features/themes/themeLoader';
import { getBrowserSettings, saveBrowserSettings } from '../features/settings/browserSettings';
import { THEME_SCHEMA_VERSION, type Theme, type ThemeMode } from '../themes/types';
import { getThemeColorDisplayName } from '../themes/colorVariableToDisplayName';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_VAR_PATTERN = /^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/;
type RGBAColor = { r: number; g: number; b: number; a: number };

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;

  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (trimmed.length === 5) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    const a = trimmed[4];
    return `#${r}${r}${g}${g}${b}${b}${a}${a}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g)
    .toString(16)
    .padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`;
}

function rgbToHexWithAlpha(r: number, g: number, b: number, a: number): string {
  const alpha = Math.max(0, Math.min(1, a));
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${rgbToHex(r, g, b)}${alphaHex}`;
}

function parseColorToRgba(value: string): RGBAColor | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hex = normalizeHexColor(raw);
  if (hex) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const a = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgbaMatch = raw.match(
    /^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})(?:\s*[,/]\s*([0-9.]+))?\s*\)$/,
  );
  if (!rgbaMatch) return null;

  const r = clampChannel(Number.parseInt(rgbaMatch[1], 10));
  const g = clampChannel(Number.parseInt(rgbaMatch[2], 10));
  const b = clampChannel(Number.parseInt(rgbaMatch[3], 10));
  const aRaw = rgbaMatch[4];
  const parsedAlpha = aRaw === undefined ? 1 : Number.parseFloat(aRaw);
  const a = Number.isFinite(parsedAlpha) ? Math.max(0, Math.min(1, parsedAlpha)) : 1;
  return { r, g, b, a };
}

function parseRgbLikeToHex(value: string): string | null {
  const parsed = parseColorToRgba(value);
  if (!parsed) return null;
  return rgbToHex(parsed.r, parsed.g, parsed.b);
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
  if (!candidate) return null;

  const varMatch = candidate.match(CSS_VAR_PATTERN);
  if (varMatch) {
    return resolveColorValue(varMatch[1], colors, fallbackColors, visited);
  }

  return candidate;
}

function resolveHexColorValue(
  key: string,
  colors: Record<string, string>,
  fallbackColors: Record<string, string>,
): string | null {
  const candidate = resolveColorValue(key, colors, fallbackColors, new Set<string>());
  if (!candidate) return null;

  const normalizedHex = normalizeHexColor(candidate);
  if (normalizedHex) return normalizedHex;

  return null;
}

function getColorPickerValue(
  key: string,
  colors: Record<string, string>,
  fallbackColors: Record<string, string>,
): string {
  const resolved = resolveColorValue(key, colors, fallbackColors, new Set<string>()) ?? '';
  return (
    resolveHexColorValue(key, colors, fallbackColors)
    ?? parseRgbLikeToHex(resolved)
    ?? '#000000'
  );
}

function getResolvedRgbaForEditor(
  key: string,
  colors: Record<string, string>,
  fallbackColors: Record<string, string>,
): RGBAColor {
  const resolved = resolveColorValue(key, colors, fallbackColors, new Set<string>()) ?? '';
  return parseColorToRgba(resolved) ?? { r: 0, g: 0, b: 0, a: 1 };
}

function formatColorWithOpacity(r: number, g: number, b: number, opacityPercent: number): string {
  const clampedOpacity = Math.max(0, Math.min(100, Math.round(opacityPercent)));
  if (clampedOpacity <= 0) return 'transparent';

  const alpha = clampedOpacity / 100;
  if (alpha >= 1) return rgbToHex(r, g, b);
  return rgbToHexWithAlpha(r, g, b, alpha);
}

function parseOpacityPercent(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function createEditableColors(baseTheme: Theme, fallbackTheme: Theme): Record<string, string> {
  const allKeys = Array.from(
    new Set([...Object.keys(fallbackTheme.colors), ...Object.keys(baseTheme.colors)]),
  ).sort();

  const result: Record<string, string> = {};
  allKeys.forEach((key) => {
    const baseRaw = (baseTheme.colors[key] ?? '').trim();
    if (baseRaw) {
      result[key] = normalizeHexColor(baseRaw) ?? baseRaw;
      return;
    }

    const fallbackRaw = (fallbackTheme.colors[key] ?? '').trim();
    if (fallbackRaw) {
      result[key] = normalizeHexColor(fallbackRaw) ?? fallbackRaw;
      return;
    }

    const resolved =
      resolveColorValue(key, baseTheme.colors, fallbackTheme.colors, new Set<string>()) ??
      '#000000';
    result[key] = normalizeHexColor(resolved) ?? resolved;
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
  const fallbackTheme =
    themes.find((entry) => entry.id === 'default_dark')?.theme ?? themes[0]?.theme;
  const settingsThemeId = getBrowserSettings().themeId;
  const initialThemeEntry =
    themes.find((entry) => entry.id === settingsThemeId) ?? themes[0] ?? null;

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
      version: THEME_SCHEMA_VERSION,
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
      version: THEME_SCHEMA_VERSION,
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
        version: THEME_SCHEMA_VERSION,
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
      <div className="settings-page creator-page">No themes are available to use as a base.</div>
    );
  }

  return (
    <div className="settings-page creator-page">
      <header className="settings-header">
        <div>
          <h1 className="settings-title">Theme Creator</h1>
          <p className="settings-subtitle">Pick a base theme, tweak colors, and export JSON.</p>
        </div>
      </header>

      <section className="theme-panel settings-card">
        <div className="settings-card-header">
          <h2 className="settings-card-title">Actions</h2>
        </div>
        <div className="settings-actions-row">
          <button
            type="button"
            onClick={handleExport}
            className="theme-btn theme-btn-go settings-btn-pad"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleExportLoadAndSelect}
            className="theme-btn theme-btn-nav settings-btn-pad"
          >
            Export, Load, and Select
          </button>
          <label className="creator-live-preview">
            <input
              type="checkbox"
              checked={livePreviewEnabled}
              onChange={(e) => setLivePreviewEnabled(e.currentTarget.checked)}
              className="settings-toggle"
            />
            <span className="theme-text2">Live Preview</span>
          </label>
        </div>
        {!!exportMessage && (
          <div className="theme-text2 settings-inline-message">{exportMessage}</div>
        )}
      </section>

      <section className="theme-panel settings-card">
        <div className="settings-card-header">
          <h2 className="settings-card-title">Theme Details</h2>
        </div>
        <div className="creator-meta-grid theme-creator-meta-grid">
          <label className="creator-meta-field">
            <span className="settings-setting-label">Base Theme</span>
            <select
              value={baseThemeId}
              onChange={(e) => {
                setBaseThemeId(e.currentTarget.value);
                setExportMessage('');
              }}
              className="theme-input settings-select-input"
            >
              {themes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.theme.name} - {entry.theme.author} ({entry.theme.mode})
                </option>
              ))}
            </select>
          </label>

          <label className="creator-meta-field">
            <span className="settings-setting-label">Name</span>
            <input
              value={themeName}
              onChange={(e) => {
                setThemeName(e.currentTarget.value);
                setExportMessage('');
              }}
              className="theme-input settings-text-input"
            />
          </label>

          <label className="creator-meta-field">
            <span className="settings-setting-label">Author</span>
            <input
              value={themeAuthor}
              onChange={(e) => {
                setThemeAuthor(e.currentTarget.value);
                setExportMessage('');
              }}
              className="theme-input settings-text-input"
            />
          </label>

          <label className="creator-meta-field">
            <span className="settings-setting-label">Mode</span>
            <select
              value={themeMode}
              onChange={(e) => {
                const nextMode = e.currentTarget.value;
                if (nextMode === 'light' || nextMode === 'dark') {
                  setThemeMode(nextMode);
                  setExportMessage('');
                }
              }}
              className="theme-input settings-select-input"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
      </section>

      <section className="theme-panel settings-card">
        <div className="settings-card-header">
          <h2 className="settings-card-title">Colors</h2>
        </div>
        <div className="creator-values-list theme-creator-values-list">
          {editableKeys.map((key) => (
            (() => {
              const resolvedRgba = getResolvedRgbaForEditor(key, colors, fallbackTheme.colors);
              const opacityPercent = Math.round(resolvedRgba.a * 100);
              return (
                <div key={key} className="settings-setting-row creator-value-row theme-creator-value-row">
                  <div className="settings-setting-meta">
                    <span className="settings-setting-label">{getThemeColorDisplayName(key)}</span>
                  </div>
                  <div className="creator-color-controls settings-setting-control settings-setting-control-grow settings-setting-control-right">
                    <input
                      value={colors[key]}
                      onChange={(e) => {
                        const trimmed = e.currentTarget.value.trim();
                        if (!trimmed) {
                          setColors((prev) => ({ ...prev, [key]: 'transparent' }));
                          setExportMessage('');
                          return;
                        }
                        const normalized = normalizeHexColor(trimmed);
                        setColors((prev) => ({ ...prev, [key]: normalized ?? trimmed }));
                        setExportMessage('');
                      }}
                      className="theme-input settings-text-input creator-code-input"
                    />
                    <input
                      type="color"
                      value={getColorPickerValue(key, colors, fallbackTheme.colors)}
                      onChange={(e) => {
                        const nextHex = e.currentTarget.value;
                        const parsedHex = parseColorToRgba(nextHex) ?? { r: 0, g: 0, b: 0, a: 1 };
                        setColors((prev) => ({
                          ...prev,
                          [key]: formatColorWithOpacity(
                            parsedHex.r,
                            parsedHex.g,
                            parsedHex.b,
                            opacityPercent,
                          ),
                        }));
                        setExportMessage('');
                      }}
                      className="creator-color-swatch"
                    />
                    <label className="theme-text2" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      Opacity
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={opacityPercent}
                      onChange={(event) => {
                        const nextOpacity = parseOpacityPercent(
                          event.currentTarget.value,
                          opacityPercent,
                        );
                        setColors((prev) => ({
                          ...prev,
                          [key]: formatColorWithOpacity(
                            resolvedRgba.r,
                            resolvedRgba.g,
                            resolvedRgba.b,
                            nextOpacity,
                          ),
                        }));
                        setExportMessage('');
                      }}
                      className="theme-input settings-text-input"
                      style={{ width: 72 }}
                      aria-label={`${getThemeColorDisplayName(key)} opacity`}
                    />
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      </section>
    </div>
  );
}
