import React from 'react';
import type { BrowserSettings } from '../features/settings/browserSettings';
import {
  deleteCustomLayout,
  getAllLayouts,
  importLayoutFromJson,
} from '../features/layouts/layoutLoader';
import type { MobileTheme } from './shared';
import JsonCreatorPage from './JsonCreatorPage';

export default function LayoutCreatorPage({
  theme,
  settings,
  updateSettings,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
}) {
  const selected = getAllLayouts().find((entry) => entry.id === settings.layoutId);
  const initialJson = JSON.stringify(selected?.layout ?? getAllLayouts()[0]?.layout ?? {}, null, 2);

  return (
    <JsonCreatorPage
      theme={theme}
      title="Layout Creator"
      initialJson={initialJson}
      onImport={(jsonText) => {
        const imported = importLayoutFromJson(jsonText);
        updateSettings({ layoutId: imported.id });
        return imported.layout.name;
      }}
      getCustomItems={() =>
        getAllLayouts()
          .filter((entry) => entry.source === 'custom')
          .map((entry) => ({
            id: entry.id,
            label: entry.layout.name,
            onDelete: () => {
              deleteCustomLayout(entry.id);
              if (settings.layoutId === entry.id) {
                updateSettings({ layoutId: 'default_standard' });
              }
            },
          }))
      }
    />
  );
}
