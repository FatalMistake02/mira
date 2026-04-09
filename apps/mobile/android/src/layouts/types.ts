// Layout types
export interface Layout {
  name: string;
  tabBarPosition: 'bottom' | 'top';
  addressBarPosition: 'top' | 'bottom';
  compactMode: boolean;
}

export interface LayoutConfig {
  name: string;
  displayName: string;
  description: string;
  config: Layout;
}
