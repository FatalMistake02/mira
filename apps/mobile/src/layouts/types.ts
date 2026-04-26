/**
 * CSS variable values keyed by layout token.
 */
export type LayoutValues = Record<string, string>;

/**
 * User-selectable layout preset metadata and values.
 */
export interface Layout {
  name: string;
  author: string;
  values: LayoutValues;
}
