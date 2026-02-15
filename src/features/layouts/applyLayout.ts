import type { Layout } from '../../layouts/types';

let previouslyAppliedLayoutKeys = new Set<string>();

export function applyLayout(layout: Layout | null | undefined) {
  if (!layout || typeof layout !== 'object') return;
  if (!layout.values || typeof layout.values !== 'object') return;

  const root = document.documentElement;
  const nextKeys = new Set<string>();

  previouslyAppliedLayoutKeys.forEach((key) => {
    if (!(key in layout.values)) {
      root.style.removeProperty(`--${key}`);
    }
  });

  Object.entries(layout.values).forEach(([key, value]) => {
    if (typeof value !== 'string') return;
    nextKeys.add(key);
    root.style.setProperty(`--${key}`, value);
  });

  previouslyAppliedLayoutKeys = nextKeys;
}

