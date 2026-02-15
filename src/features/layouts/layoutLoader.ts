import type { Layout } from '../../layouts/types';
import {
  getDefaultLayoutValues,
  LAYOUT_VALUE_DEFINITIONS,
} from '../../layouts/layoutValueDefinitions';

const modules = import.meta.glob('../../layouts/*.json', { eager: true });

const CUSTOM_LAYOUT_STORAGE_KEY = 'mira.layouts.custom.v1';
export const DEFAULT_LAYOUT_ID = 'default_standard';

type StoredLayout = { id: string; layout: Layout };

export type LayoutEntry = {
  id: string;
  layout: Layout;
  source: 'bundled' | 'custom';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const definitionMap = new Map(LAYOUT_VALUE_DEFINITIONS.map((entry) => [entry.key, entry]));
const defaultValues = getDefaultLayoutValues();

function normalizeLayoutValue(key: string, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  if (!normalized) return null;

  const definition = definitionMap.get(key);
  if (!definition) return normalized;
  if (definition.kind === 'choice') {
    const allowed = definition.options ?? [];
    return allowed.includes(normalized) ? normalized : null;
  }
  return normalized;
}

function normalizeLayout(value: unknown): Layout | null {
  if (!isRecord(value)) return null;

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const author = typeof value.author === 'string' ? value.author.trim() : '';
  if (!name || !author) return null;
  if (!isRecord(value.values)) return null;

  const values: Record<string, string> = { ...defaultValues };
  Object.entries(value.values).forEach(([key, raw]) => {
    const normalized = normalizeLayoutValue(key, raw);
    if (!normalized) return;
    values[key] = normalized;
  });

  return {
    name,
    author,
    values,
  };
}

function moduleToLayout(moduleValue: unknown): Layout | null {
  if (!isRecord(moduleValue)) return normalizeLayout(moduleValue);
  if ('default' in moduleValue) return normalizeLayout(moduleValue.default);
  return normalizeLayout(moduleValue);
}

function pathToLayoutId(path: string): string | null {
  const match = path.match(/\/([^/]+)\.json$/);
  if (!match) return null;
  return match[1].trim();
}

const bundledLayouts: LayoutEntry[] = Object.entries(modules).flatMap(([path, moduleValue]) => {
  const id = pathToLayoutId(path);
  const layout = moduleToLayout(moduleValue);
  if (!id || !layout) return [];
  return [{ id, layout, source: 'bundled' as const }];
});

function readCustomLayouts(): StoredLayout[] {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const layout = normalizeLayout(entry.layout);
        if (!id || !layout) return null;
        return { id, layout };
      })
      .filter((entry): entry is StoredLayout => entry !== null);
  } catch {
    return [];
  }
}

function writeCustomLayouts(layouts: StoredLayout[]) {
  try {
    localStorage.setItem(CUSTOM_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Ignore storage failures.
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createCustomLayoutId(layout: Layout, existingIds: Set<string>): string {
  const base =
    `${slugify(layout.name)}-${slugify(layout.author)}`.replace(/^-+|-+$/g, '') || 'custom-layout';
  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function getAllLayouts(): LayoutEntry[] {
  const customEntries: LayoutEntry[] = readCustomLayouts().map((entry) => ({
    id: entry.id,
    layout: entry.layout,
    source: 'custom',
  }));

  const byId = new Map<string, LayoutEntry>();
  bundledLayouts.forEach((entry) => byId.set(entry.id, entry));
  customEntries.forEach((entry) => byId.set(entry.id, entry));
  return Array.from(byId.values());
}

export function getLayoutById(layoutId: string | null | undefined): Layout | null {
  const allLayouts = getAllLayouts();
  const selected = allLayouts.find((entry) => entry.id === layoutId);
  if (selected) return selected.layout;
  const fallback = allLayouts.find((entry) => entry.id === DEFAULT_LAYOUT_ID) ?? allLayouts[0];
  return fallback?.layout ?? null;
}

export function importLayoutFromJson(jsonText: string): LayoutEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Layout JSON is invalid.');
  }

  const layout = normalizeLayout(parsed);
  if (!layout) {
    throw new Error('Layout JSON must include name, author, and a values object.');
  }

  const customLayouts = readCustomLayouts();
  const existingIds = new Set(getAllLayouts().map((entry) => entry.id));
  const id = createCustomLayoutId(layout, existingIds);
  const storedLayout: StoredLayout = { id, layout };
  customLayouts.push(storedLayout);
  writeCustomLayouts(customLayouts);

  return {
    id,
    layout,
    source: 'custom',
  };
}

export function deleteCustomLayout(layoutId: string): boolean {
  const customLayouts = readCustomLayouts();
  const nextCustomLayouts = customLayouts.filter((entry) => entry.id !== layoutId);
  if (nextCustomLayouts.length === customLayouts.length) {
    return false;
  }
  writeCustomLayouts(nextCustomLayouts);
  return true;
}

