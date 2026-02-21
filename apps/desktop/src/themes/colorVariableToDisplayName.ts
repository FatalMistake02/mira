export const THEME_COLOR_DISPLAY_NAMES: Record<string, string> = {
  bg: 'App Background',
  tabBg: 'Tab Background',
  tabBgHover: 'Tab Background Hover',
  tabBgActive: 'Tab Background Active',
  tabText: 'Tab Text',
  tabTextHover: 'Tab Text Hover',
  tabTextActive: 'Tab Text Active',
  tabBorder: 'Tab Border',
  tabBorderHover: 'Tab Border Hover',
  tabBorderActive: 'Tab Border Active',
  text1: 'Primary Text',
  text2: 'Secondary Text',
  text3: 'Muted Text',
  downloadButtonBg: 'Download Button Background',
  downloadButtonBgHover: 'Download Button Background Hover',
  downloadButtonBgActive: 'Download Button Background Active',
  downloadButtonText: 'Download Button Text',
  downloadButtonTextHover: 'Download Button Text Hover',
  downloadButtonTextActive: 'Download Button Text Active',
  downloadButtonBorder: 'Download Button Border',
  downloadButtonBorderHover: 'Download Button Border Hover',
  downloadButtonBorderActive: 'Download Button Border Active',
  navButtonBg: 'Nav Button Background',
  navButtonBgHover: 'Nav Button Background Hover',
  navButtonBgActive: 'Nav Button Background Active',
  navButtonText: 'Nav Button Text',
  navButtonTextHover: 'Nav Button Text Hover',
  navButtonTextActive: 'Nav Button Text Active',
  navButtonBorder: 'Nav Button Border',
  navButtonBorderHover: 'Nav Button Border Hover',
  navButtonBorderActive: 'Nav Button Border Active',
  urlBarBg: 'Address Bar Background',
  urlBarBgHover: 'Address Bar Background Hover',
  urlBarBgActive: 'Address Bar Background Active',
  urlBarText: 'Address Bar Text',
  urlBarTextPlaceholder: 'Address Bar Placeholder',
  urlBarBorder: 'Address Bar Border',
  urlBarBorderHover: 'Address Bar Border Hover',
  urlBarBorderActive: 'Address Bar Border Active',
  settingsCardBg: 'Settings Card Background',
  settingsCardBorder: 'Settings Card Border',
  settingsCardText: 'Settings Card Text',
  settingsCardDescription: 'Settings Card Description',
  settingsTabsBg: 'Settings Tabs Background',
  settingsTabsBorder: 'Settings Tabs Border',
  settingsRowBg: 'Settings Row Background',
  settingsRowBgHover: 'Settings Row Background Hover',
  settingsRowBorder: 'Settings Row Border',
  settingsRowBorderHover: 'Settings Row Border Hover',
  fieldBg: 'Field Background',
  fieldBgHover: 'Field Background Hover',
  fieldBgActive: 'Field Background Active',
  fieldText: 'Field Text',
  fieldTextPlaceholder: 'Field Placeholder',
  fieldBorder: 'Field Border',
  fieldBorderHover: 'Field Border Hover',
  fieldBorderActive: 'Field Border Active',
  surfaceBg: 'Surface Background',
  surfaceBgHover: 'Surface Background Hover',
  surfaceBgActive: 'Surface Background Active',
  surfaceText: 'Surface Text',
  surfaceTextHover: 'Surface Text Hover',
  surfaceTextActive: 'Surface Text Active',
  surfaceBorder: 'Surface Border',
  surfaceBorderHover: 'Surface Border Hover',
  surfaceBorderActive: 'Surface Border Active',
  contextMenuBg: 'Context Menu Background',
  contextMenuBgHover: 'Context Menu Background Hover',
  contextMenuBgActive: 'Context Menu Background Active',
  contextMenuText: 'Context Menu Text',
  contextMenuTextHover: 'Context Menu Text Hover',
  contextMenuBorder: 'Context Menu Border',
  contextMenuDivider: 'Context Menu Divider',
  contextMenuShadow: 'Context Menu Shadow',
};

function splitCamelCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Returns a user-facing label for a theme color token.
 * Falls back to a prettified key name when no explicit label exists.
 */
export function getThemeColorDisplayName(key: string): string {
  const known = THEME_COLOR_DISPLAY_NAMES[key];
  if (known) return known;

  const normalized = splitCamelCase(key).replace(/[_-]+/g, ' ').trim();
  if (!normalized) return key;

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
