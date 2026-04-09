export interface ThemeVariables {
  [key: string]: string;
}

export interface Theme {
  name: string;
  colors: ThemeVariables;
}

export const colorVariableToDisplayName: Record<string, string> = {
  primary: 'Primary Color',
  secondary: 'Secondary Color',
  background: 'Background Color',
  surface: 'Surface Color',
  text: 'Text Color',
  border: 'Border Color',
};
