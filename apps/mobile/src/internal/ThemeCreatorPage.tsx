import React from 'react';
import type { BrowserSettings } from '../features/settings/browserSettings';
import { deleteCustomTheme, getAllThemes, importThemeFromJson } from '../features/themes/themeLoader';
import type { MobileTheme } from './shared';
import JsonCreatorPage from './JsonCreatorPage';

export default function ThemeCreatorPage({
  theme,
  settings,
  updateSettings,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => void;
}) {
  const selected = getAllThemes().find((entry) => entry.id === settings.themeId);
  const initialJson = JSON.stringify(selected?.theme ?? getAllThemes()[0]?.theme ?? {}, null, 2);

  return (
    <JsonCreatorPage
      theme={theme}
      title="Theme Creator"
      initialJson={initialJson}
      onImport={(jsonText) => {
        const imported = importThemeFromJson(jsonText);
        updateSettings({ themeId: imported.id });
        return imported.theme.name;
      }}
      getCustomItems={() =>
        getAllThemes()
          .filter((entry) => entry.source === 'custom')
          .map((entry) => ({
            id: entry.id,
            label: entry.theme.name,
            onDelete: () => {
              deleteCustomTheme(entry.id);
              if (settings.themeId === entry.id) {
                updateSettings({ themeId: 'default_dark' });
              }
            },
          }))
      }
    />
  );
}
