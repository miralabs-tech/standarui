/**
 * Shared typeahead buffer for menu, select, listbox and tree.
 *
 * Pure: the caller owns the state object and passes the clock, so the whole
 * behaviour is testable without a DOM and without fake timers. Two APG rules do
 * the work — repeating one character cycles through the items that start with it,
 * and anything else extends the search string until the buffer times out.
 */

export interface TypeaheadState {
  query: string;
  lastKeyAt: number;
}

export interface TypeaheadOptions<T> {
  readonly items: readonly T[];
  readonly itemToString: (item: T) => string;
  readonly isItemDisabled?: ((item: T) => boolean) | undefined;
  readonly activeIndex?: number | undefined;
  /** How long the buffer survives between keystrokes. */
  readonly timeout?: number | undefined;
  readonly now?: number | undefined;
}

const DEFAULT_TIMEOUT = 350;

export function createTypeaheadState(): TypeaheadState {
  return { query: "", lastKeyAt: 0 };
}

/** A key that types a character, as opposed to one that navigates. */
export function isTypeaheadKey(key: string): boolean {
  return key.length === 1 && key !== " " && !/\s/.test(key);
}

export function getByTypeahead<T>(
  state: TypeaheadState,
  key: string,
  options: TypeaheadOptions<T>,
): T | null {
  const now = options.now ?? Date.now();
  const expired = now - state.lastKeyAt > (options.timeout ?? DEFAULT_TIMEOUT);
  state.query = (expired ? "" : state.query) + key.toLowerCase();
  state.lastKeyAt = now;

  // "aaa" means "cycle through the a's", not "look for the item called aaa".
  const repeated =
    state.query.length > 1 && [...state.query].every((char) => char === key.toLowerCase());
  const search = repeated ? key.toLowerCase() : state.query;

  const { items, itemToString, isItemDisabled, activeIndex } = options;
  const count = items.length;
  if (count === 0) return null;

  // Start after the active item when cycling, and at it otherwise, so extending a
  // search never jumps away from a match the user is already sitting on.
  const from = activeIndex === undefined || activeIndex < 0 ? 0 : activeIndex + (repeated ? 1 : 0);

  for (let offset = 0; offset < count; offset++) {
    const item = items[(from + offset) % count];
    if (item === undefined) continue;
    if (isItemDisabled?.(item) === true) continue;
    if (itemToString(item).toLowerCase().startsWith(search)) return item;
  }
  return null;
}

export function resetTypeahead(state: TypeaheadState): void {
  state.query = "";
  state.lastKeyAt = 0;
}
