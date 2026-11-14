/**
 * The item model behind listbox, select, combobox, menu and tree.
 *
 * A collection is immutable and framework-free: it maps between the consumer's
 * item objects and the string values a machine stores, and it answers navigation
 * questions ("what is after this, skipping the disabled ones") so that six
 * components cannot drift on the answer. `filter` returns a new collection rather
 * than mutating, which is what makes a combobox's filtered view a value the
 * machine can hold.
 *
 * Navigation reuses `getNextIndex` from roving focus on purpose: a listbox and a
 * toolbar must agree on where a wrap lands.
 */

import { getNextIndex, type RovingAction } from "../focus/roving-focus";

export interface ListCollectionOptions<T> {
  readonly items: readonly T[];
  /** Defaults to `item.value`, then the item itself when it is a string. */
  readonly itemToValue?: ((item: T) => string) | undefined;
  /** Defaults to `item.label`, then the value. */
  readonly itemToString?: ((item: T) => string) | undefined;
  readonly isItemDisabled?: ((item: T) => boolean) | undefined;
  readonly groupBy?: ((item: T) => string) | undefined;
}

export interface CollectionGroup<T> {
  readonly key: string;
  readonly items: readonly T[];
}

export interface ListCollection<T> {
  readonly items: readonly T[];
  readonly size: number;
  at(index: number): T | null;
  find(value: string | null | undefined): T | null;
  indexOf(value: string | null | undefined): number;
  getValue(item: T): string;
  getLabel(item: T): string;
  isDisabled(item: T): boolean;
  values(): string[];
  first(): string | null;
  last(): string | null;
  next(value: string | null, options?: { loop?: boolean | undefined }): string | null;
  prev(value: string | null, options?: { loop?: boolean | undefined }): string | null;
  move(
    value: string | null,
    action: RovingAction,
    options?: { loop?: boolean | undefined },
  ): string | null;
  groups(): CollectionGroup<T>[];
  filter(predicate: (item: T) => boolean): ListCollection<T>;
}

function defaultValue<T>(item: T): string {
  if (typeof item === "string") return item;
  const value = (item as { value?: unknown }).value;
  return typeof value === "string" ? value : String(value);
}

export function createListCollection<T>(options: ListCollectionOptions<T>): ListCollection<T> {
  const { items } = options;
  const getValue = options.itemToValue ?? defaultValue;
  const getLabel =
    options.itemToString ??
    ((item: T): string => {
      const label = (item as { label?: unknown }).label;
      return typeof label === "string" ? label : getValue(item);
    });
  const isDisabled = (item: T): boolean => options.isItemDisabled?.(item) === true;

  // Built once: a combobox re-reads this on every keystroke.
  const indexByValue = new Map<string, number>();
  items.forEach((item, index) => {
    const value = getValue(item);
    if (!indexByValue.has(value)) indexByValue.set(value, index);
  });

  const indexOf = (value: string | null | undefined): number =>
    value === null || value === undefined ? -1 : (indexByValue.get(value) ?? -1);

  const move = (
    value: string | null,
    action: RovingAction,
    moveOptions: { loop?: boolean | undefined } = {},
  ): string | null => {
    const from = indexOf(value);
    const next = getNextIndex(from, action, {
      count: items.length,
      loop: moveOptions.loop ?? false,
      isDisabled: (index) => {
        const item = items[index];
        return item !== undefined && isDisabled(item);
      },
    });
    // Roving focus stays put when it cannot move; a collection says so instead —
    // the machine needs to tell "no next item" from "the next item is this one".
    if (next < 0) return null;
    if (next === from && (action === "next" || action === "prev")) return null;
    const item = items[next];
    return item === undefined || isDisabled(item) ? null : getValue(item);
  };

  return {
    items,
    size: items.length,
    at: (index: number): T | null => items[index] ?? null,
    find: (value): T | null => items[indexOf(value)] ?? null,
    indexOf,
    getValue,
    getLabel,
    isDisabled,
    values: (): string[] => items.map(getValue),
    first: (): string | null => move(null, "first"),
    last: (): string | null => move(null, "last"),
    next: (value, moveOptions): string | null => move(value, "next", moveOptions ?? {}),
    prev: (value, moveOptions): string | null => move(value, "prev", moveOptions ?? {}),
    move,
    groups: (): CollectionGroup<T>[] => {
      const groupBy = options.groupBy;
      if (groupBy === undefined) return [{ key: "", items }];
      // Insertion-ordered: the author's item order decides the group order too,
      // rather than an alphabetical sort nobody asked for.
      const grouped = new Map<string, T[]>();
      for (const item of items) {
        const key = groupBy(item);
        const bucket = grouped.get(key);
        if (bucket === undefined) grouped.set(key, [item]);
        else bucket.push(item);
      }
      return [...grouped].map(([key, groupItems]) => ({ key, items: groupItems }));
    },
    filter: (predicate): ListCollection<T> =>
      createListCollection({ ...options, items: items.filter(predicate) }),
  };
}
