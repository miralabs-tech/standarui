/**
 * The one component with no machine, and the reason is worth stating: a separator
 * has no state, no events, no DOM to reach for and no ids to derive. Giving it a
 * service would mean an interpreter, a scope and a reactivity subscription per
 * horizontal rule in a menu — the exact overhead the size budgets exist to keep
 * out. So `connect` takes the props directly.
 *
 * Everything else about it is the usual contract: an anatomy, a pure prop getter,
 * state on data-attributes.
 */

import { ariaAttr } from "../../dom/attrs";
import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Orientation } from "../../types";

export type SeparatorPart = "root";

export const anatomy: Anatomy<SeparatorPart> = createAnatomy("separator").parts("root");

export const parts: Record<SeparatorPart, AnatomyPart> = anatomy.build();

export interface SeparatorMachineProps {
  readonly orientation?: Orientation | undefined;
  /**
   * A rule drawn for looks rather than meaning. Decorative separators leave the
   * accessibility tree entirely — a screen reader announcing "separator" between
   * every list row is noise, not structure.
   */
  readonly decorative?: boolean | undefined;
}

export interface SeparatorApi<T extends PropTypes = PropTypes> {
  readonly orientation: Orientation;
  getRootProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: SeparatorMachineProps,
  normalize: NormalizeProps<T>,
): SeparatorApi<T> {
  const orientation = props.orientation ?? "horizontal";
  const decorative = props.decorative === true;

  return {
    orientation,
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        role: decorative ? "none" : "separator",
        // Only the vertical case is worth spelling out: horizontal is the implicit
        // value of `aria-orientation` on a separator, and repeating it is noise.
        "aria-orientation": decorative || orientation === "horizontal" ? undefined : "vertical",
        "aria-hidden": decorative ? ariaAttr(true) : undefined,
        "data-orientation": orientation,
      }),
  };
}
