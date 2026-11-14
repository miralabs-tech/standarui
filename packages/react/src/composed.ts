/**
 * The shared vocabulary of the composed layer — types only, not one value.
 *
 * A composed component (`<Select options={…}/>`) is a pure function from its props
 * to the parts a consumer would otherwise place by hand: no state, no prop getter
 * re-implemented, no node that is not a part. What every such module shares is a handful of entry shapes, and they
 * live here so that no component invents a second spelling of the same idea.
 *
 * Everything below is erased at emit — `isolatedDeclarations` annotates it and
 * nothing bundles it — which is why this module has no budget line and cannot
 * grow one: the day it holds a value, it becomes a shared module every composed
 * layer pays for, and it has to move to a line of its own.
 */

import type { MouseEvent, ReactElement, ReactNode } from "react";

/** The two fields no machine owns: the leading track, and the consumer's payload. */
export interface ComposedDecoration<Meta = never> {
  /**
   * The single leading track, shared with the selection checkmark — never a second
   * column. The sheet reserves it once per surface (`data-has-symbols`, beside
   * `data-has-selection`), so a row with no glyph keeps its label aligned.
   */
  readonly icon?: ReactNode;
  /** Handed back untouched to `render*`. Erased at emit, so it costs nothing. */
  readonly meta?: Meta | undefined;
}

/**
 * A labelled group. `id` is required rather than defaulted: the part's own `label`
 * is a boolean flag (`SelectItemGroupProps.label`, `MenuItemGroupProps.label`)
 * whose `aria-labelledby` points at the label part, so the composed layer has to
 * render that part *and* pin the key — written blind the attribute is a dead IDREF
 * and a nameless group at once. A pinned key is also what lets the markup parity
 * test compare the two forms to the character.
 */
export interface ComposedGroup<Entry> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly Entry[];
}

/** Structural narrowing — `"separator" in entry`. No `kind` field anywhere. */
export interface ComposedSeparator {
  readonly separator: true;
}

/**
 * A surface action: a button the library places, whose event belongs to it because
 * the part has none of its own. Dialog actions, never menu items — a menu's
 * selection is `onSelect` on the root, and a handler per item would be a name the
 * machine does not have.
 */
export interface ComposedAction {
  readonly label: string;
  /**
   * Handed the event, because the contract the layer publishes for this field is
   * about the event: it lands on the button's `onClick`, runs before the machine's
   * own handler, and a `preventDefault()` inside it keeps the surface open — which
   * is what an action that awaits a request needs. Declared `() => void` the
   * sentence was unwriteable rather than merely undocumented: TypeScript refuses a
   * callback that names a parameter its target has none of, so the one form the
   * JSDoc asks for was the one form that would not compile. It is also the shape
   * every other `onPress` in this library already has (`ButtonPressDetails`,
   * `LinkMachineProps.onPress`), which is the second reason it is not a widening of
   * convenience.
   */
  readonly onPress?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  readonly destructive?: boolean | undefined;
  readonly cancel?: boolean | undefined;
}

/**
 * The substitution slot of a trigger: an ELEMENT, handed to the part's `render`,
 * never placed as its children. `SelectTrigger` and `MenuTrigger` render a
 * `<button>`; a button inside a button is `nested-interactive`.
 */
export type ComposedTrigger = ReactElement;
