import type { Theme } from '../../themes/types';

let previouslyAppliedThemeKeys = new Set<string>();

export function applyTheme(theme: Theme | null | undefined) {
  if (!theme || typeof theme !== 'object') return;
  if (!theme.colors || typeof theme.colors !== 'object') return;

  const root = document.documentElement;
  const nextKeys = new Set<string>();

  previouslyAppliedThemeKeys.forEach((key) => {
    if (!(key in theme.colors)) {
      root.style.removeProperty(`--${key}`);
    }
  });

  Object.entries(theme.colors).forEach(([key, value]) => {
    if (typeof value !== 'string') return;
    nextKeys.add(key);
    root.style.setProperty(`--${key}`, value);
  });

  previouslyAppliedThemeKeys = nextKeys;
}
