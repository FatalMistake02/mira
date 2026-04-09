// Layout types
export interface LayoutValueDefinition {
  name: string;
  displayName: string;
  description: string;
}

export interface TabPosition {
  position: 'top' | 'bottom';
  displayName: string;
}

export interface AddressBarPosition {
  position: 'top' | 'bottom';
  displayName: string;
}
