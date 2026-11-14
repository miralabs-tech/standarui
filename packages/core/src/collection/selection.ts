/**
 * Selection as pure transitions on an immutable value.
 *
 * The state is `{ value, anchor }` and every operation returns a new one, which is
 * exactly what a `bindable` wants: the machine calls `context.set("selection", …)`
 * and the controlled/uncontrolled question is already answered upstream.
 *
 * The anchor is what makes shift-click behave. It is set by a plain selection and
 * left alone by a range extension, so extending twice from the same anchor
 * replaces the range instead of growing it — the behaviour of every file list on
 * every desktop.
 */

export type SelectionMode = "none" | "single" | "multiple";

export interface SelectionState {
  readonly value: readonly string[];
  readonly anchor: string | null;
}

export interface SelectionOptions {
  readonly mode: SelectionMode;
  /** Single mode: selecting the selected item clears it. Off by default — a radio never empties. */
  readonly deselectable?: boolean | undefined;
}

export const emptySelection: SelectionState = { value: [], anchor: null };

export function createSelection(
  value: readonly string[] = [],
  anchor: string | null = null,
): SelectionState {
  return { value, anchor };
}

export function isSelected(state: SelectionState, value: string): boolean {
  return state.value.includes(value);
}

/** A plain click: replaces in single mode, toggles in multiple. */
export function select(
  state: SelectionState,
  value: string,
  options: SelectionOptions,
): SelectionState {
  if (options.mode === "none") return state;
  if (options.mode === "single") {
    const already = isSelected(state, value);
    if (already && options.deselectable === true) return { value: [], anchor: null };
    return { value: [value], anchor: value };
  }
  return { value: [value], anchor: value };
}

/** Ctrl/Cmd-click, and the gamepad X button on a listbox (CDC §4.4). */
export function toggle(
  state: SelectionState,
  value: string,
  options: SelectionOptions,
): SelectionState {
  if (options.mode === "none") return state;
  if (options.mode === "single") return select(state, value, options);
  if (isSelected(state, value)) {
    const next = state.value.filter((entry) => entry !== value);
    return { value: next, anchor: next.at(-1) ?? null };
  }
  return { value: [...state.value, value], anchor: value };
}

/**
 * Shift-click. `ordered` is the collection's current value order, so a filtered
 * or reordered view selects the range the user can actually see.
 */
export function extend(
  state: SelectionState,
  value: string,
  ordered: readonly string[],
  options: SelectionOptions,
): SelectionState {
  if (options.mode !== "multiple") return select(state, value, options);

  const anchor = state.anchor ?? value;
  const from = ordered.indexOf(anchor);
  const to = ordered.indexOf(value);
  if (from === -1 || to === -1) return select(state, value, options);

  const range = ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
  // The anchor survives, so extending again from the same anchor replaces the
  // range rather than accumulating.
  return { value: range, anchor };
}

export function selectAll(
  state: SelectionState,
  ordered: readonly string[],
  options: SelectionOptions,
): SelectionState {
  if (options.mode !== "multiple") return state;
  return { value: [...ordered], anchor: state.anchor };
}

export function clearSelection(): SelectionState {
  return emptySelection;
}
