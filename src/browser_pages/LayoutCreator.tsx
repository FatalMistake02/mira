import { useEffect, useMemo, useState } from 'react';
import { applyLayout } from '../features/layouts/applyLayout';
import {
  getAllLayouts,
  getLayoutById,
  importLayoutFromJson,
  type LayoutEntry,
} from '../features/layouts/layoutLoader';
import { getBrowserSettings, saveBrowserSettings } from '../features/settings/browserSettings';
import type { Layout } from '../layouts/types';
import {
  getDefaultLayoutValues,
  getLayoutValueDisplayName,
  LAYOUT_VALUE_DEFINITIONS,
} from '../layouts/layoutValueDefinitions';

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

function createEditableValues(baseLayout: Layout): Record<string, string> {
  return {
    ...getDefaultLayoutValues(),
    ...baseLayout.values,
  };
}

export default function LayoutCreator() {
  const [layouts, setLayouts] = useState<LayoutEntry[]>(() => getAllLayouts());
  const initialLayoutEntry = layouts[0] ?? null;

  const [baseLayoutId, setBaseLayoutId] = useState<string>(initialLayoutEntry?.id ?? '');
  const [layoutName, setLayoutName] = useState('My Layout');
  const [layoutAuthor, setLayoutAuthor] = useState('Me');
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialLayoutEntry ? createEditableValues(initialLayoutEntry.layout) : getDefaultLayoutValues(),
  );
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true);
  const [exportMessage, setExportMessage] = useState('');

  const selectedLayoutEntry: LayoutEntry | null =
    layouts.find((entry) => entry.id === baseLayoutId) ?? initialLayoutEntry;

  useEffect(() => {
    if (!selectedLayoutEntry) return;
    setValues(createEditableValues(selectedLayoutEntry.layout));
  }, [baseLayoutId, selectedLayoutEntry]);

  const editableKeys = useMemo(
    () => LAYOUT_VALUE_DEFINITIONS.map((entry) => entry.key),
    [],
  );

  useEffect(() => {
    if (!livePreviewEnabled) return;
    applyLayout({
      name: layoutName.trim() || 'My Layout',
      author: layoutAuthor.trim() || 'Me',
      values,
    });
  }, [layoutName, layoutAuthor, values, livePreviewEnabled]);

  useEffect(() => {
    if (livePreviewEnabled) return;
    const settingsLayoutId = getBrowserSettings().layoutId;
    applyLayout(getLayoutById(settingsLayoutId));
  }, [livePreviewEnabled]);

  const handleExport = () => {
    const trimmedName = layoutName.trim() || 'My Layout';
    const trimmedAuthor = layoutAuthor.trim() || 'Me';
    const payload: Layout = {
      name: trimmedName,
      author: trimmedAuthor,
      values,
    };
    const filename = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'layout'}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
    setExportMessage(`Exported ${filename}`);
  };

  const handleExportLoadAndSelect = () => {
    try {
      const trimmedName = layoutName.trim() || 'My Layout';
      const trimmedAuthor = layoutAuthor.trim() || 'Me';
      const payload: Layout = {
        name: trimmedName,
        author: trimmedAuthor,
        values,
      };
      const json = JSON.stringify(payload, null, 2);
      const imported = importLayoutFromJson(json);
      saveBrowserSettings({ layoutId: imported.id });
      applyLayout(imported.layout);
      setLayouts(getAllLayouts());
      setBaseLayoutId(imported.id);
      setExportMessage(`Loaded and selected: ${imported.layout.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load and select layout.';
      setExportMessage(message);
    }
  };

  if (!layouts.length) {
    return (
      <div style={{ padding: 20, color: 'var(--text1)', background: 'var(--bg)', minHeight: '100%' }}>
        No layouts are available to use as a base.
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
      <h1 style={{ marginTop: 0 }}>Layout Creator</h1>
      <p className="theme-text2" style={{ marginTop: 0 }}>
        Pick a base layout, tweak sizing/visibility values, and export JSON.
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
          <span>Base Layout</span>
          <select
            value={baseLayoutId}
            onChange={(e) => {
              setBaseLayoutId(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          >
            {layouts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.layout.name} - {entry.layout.author}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Name</span>
          <input
            value={layoutName}
            onChange={(e) => {
              setLayoutName(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Author</span>
          <input
            value={layoutAuthor}
            onChange={(e) => {
              setLayoutAuthor(e.currentTarget.value);
              setExportMessage('');
            }}
            className="theme-input"
            style={{ padding: '8px 10px' }}
          />
        </label>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {editableKeys.map((key) => {
          const definition = LAYOUT_VALUE_DEFINITIONS.find((entry) => entry.key === key);
          const isChoice = definition?.kind === 'choice';
          const options = definition?.options ?? [];

          return (
            <label
              key={key}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 260px)',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                border: '1px solid var(--tabBorder)',
                borderRadius: 6,
                background: 'var(--surfaceBg)',
              }}
            >
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                <span>{getLayoutValueDisplayName(key)}</span>
                <span className="theme-text3" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {key}
                </span>
              </span>

              {isChoice ? (
                <select
                  value={values[key] ?? ''}
                  onChange={(e) => {
                    setValues((prev) => ({ ...prev, [key]: e.currentTarget.value }));
                    setExportMessage('');
                  }}
                  className="theme-input"
                  style={{ padding: '6px 8px' }}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[key] ?? ''}
                  onChange={(e) => {
                    setValues((prev) => ({ ...prev, [key]: e.currentTarget.value }));
                    setExportMessage('');
                  }}
                  className="theme-input"
                  style={{ padding: '6px 8px', fontFamily: 'monospace' }}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

