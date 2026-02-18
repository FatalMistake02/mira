export type LayoutValueKind = 'length' | 'choice';

export type LayoutValueDefinition = {
  key: string;
  label: string;
  kind: LayoutValueKind;
  defaultValue: string;
  options?: string[];
};

export const LAYOUT_VALUE_DEFINITIONS: LayoutValueDefinition[] = [
  {
    key: 'layoutControlRadius',
    label: 'Control Radius',
    kind: 'length',
    defaultValue: '6px',
  },
  {
    key: 'layoutInputRadius',
    label: 'Input Radius',
    kind: 'length',
    defaultValue: '6px',
  },
  {
    key: 'layoutPanelRadius',
    label: 'Panel Radius',
    kind: 'length',
    defaultValue: '8px',
  },
  {
    key: 'layoutTabRadius',
    label: 'Tab Radius',
    kind: 'length',
    defaultValue: '8px',
  },
  {
    key: 'layoutTabGap',
    label: 'Tab Gap',
    kind: 'length',
    defaultValue: '6px',
  },
  {
    key: 'layoutTabMinWidth',
    label: 'Tab Minimum Width',
    kind: 'length',
    defaultValue: '100px',
  },
  {
    key: 'layoutTabTargetWidth',
    label: 'Tab Target Width',
    kind: 'length',
    defaultValue: '220px',
  },
  {
    key: 'layoutBorderWidth',
    label: 'Border Thickness',
    kind: 'length',
    defaultValue: '1px',
  },
  {
    key: 'layoutTopBarHeight',
    label: 'Top Bar Height',
    kind: 'length',
    defaultValue: '38px',
  },
  {
    key: 'layoutAddressBarPaddingY',
    label: 'Address Bar Vertical Padding',
    kind: 'length',
    defaultValue: '6px',
  },
  {
    key: 'layoutNavButtonHeight',
    label: 'Navigation Button Height',
    kind: 'length',
    defaultValue: '30px',
  },
  {
    key: 'layoutDownloadButtonSize',
    label: 'Download Button Size',
    kind: 'length',
    defaultValue: '34px',
  },
  {
    key: 'layoutDownloadIndicatorVisibility',
    label: 'Download Indicator Visibility',
    kind: 'choice',
    defaultValue: 'always',
    options: ['always', 'sometimes', 'never'],
  },
];

const displayNameByKey = new Map(LAYOUT_VALUE_DEFINITIONS.map((entry) => [entry.key, entry.label]));

export function getLayoutValueDisplayName(key: string): string {
  return displayNameByKey.get(key) ?? key;
}

export function getDefaultLayoutValues(): Record<string, string> {
  return Object.fromEntries(
    LAYOUT_VALUE_DEFINITIONS.map((entry) => [entry.key, entry.defaultValue]),
  );
}
