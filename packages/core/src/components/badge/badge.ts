/**
 * The second component with no machine, for the separator's reason: a badge has
 * no state, no events, no DOM to reach for and no ids to derive. Giving it a
 * service would mean an interpreter and a reactivity subscription per count pill
 * in a sidebar — the exact overhead the size budgets exist to keep out. So
 * `connect` takes the props directly and the whole behaviour is one pure
 * derivation.
 *
 * One component, three kinds: the count pill,
 * the derived text label, and the derived mute dot. They share one box, one
 * anatomy part and one sheet — splitting them would be the same CSS twice.
 */

import { ariaAttr, dataAttr } from "../../dom/attrs";
import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";

export type BadgePart = "root";

export const anatomy: Anatomy<BadgePart> = createAnatomy("badge").parts("root");

export const parts: Record<BadgePart, AnatomyPart> = anatomy.build();

export type BadgeKind = "label" | "count" | "dot";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type BadgeVariant = "solid" | "tint" | "plain";

export interface BadgeMachineProps {
  /** "label" is a text tag, "count" the pill, "dot" the mute point. */
  readonly kind?: BadgeKind | undefined;
  /** Defaults to "danger" for count/dot (red) and "neutral" for label. */
  readonly tone?: BadgeTone | undefined;
  /** Defaults to "solid" for count/dot (the pill recipe) and "tint" for label. */
  readonly variant?: BadgeVariant | undefined;
  /** kind="count" only. Truncated to an integer, floored at 0. */
  readonly count?: number | undefined;
  /** Display ceiling: count > max renders "{max}+". No ceiling by default. */
  readonly max?: number | undefined;
  /** count === 0 renders "0" instead of hiding. Default false. */
  readonly showZero?: boolean | undefined;
  /**
   * The accessible replacement for a visible value that lies ("99+"): sets
   * role="img" + aria-label, so what a screen reader gets is the truth.
   */
  readonly label?: string | undefined;
  /** Pinned on the top-trailing corner of a positioned host (CSS recipe). */
  readonly overlap?: boolean | undefined;
}

export interface BadgeApi<T extends PropTypes = PropTypes> {
  readonly kind: BadgeKind;
  /** "5", "99+", "" for label/dot. What the adapter renders by default. */
  readonly displayValue: string;
  /** true when max truncated the count. */
  readonly overflowed: boolean;
  /** true when the badge has nothing to say (count absent, or 0 without showZero). */
  readonly hidden: boolean;
  getRootProps(): T["element"];
}

export function connect<T extends PropTypes>(
  props: BadgeMachineProps,
  normalize: NormalizeProps<T>,
): BadgeApi<T> {
  const kind = props.kind ?? "label";
  const tone = props.tone ?? (kind === "label" ? "neutral" : "danger");
  const variant = props.variant ?? (kind === "label" ? "tint" : "solid");

  const clamped = props.count === undefined ? undefined : Math.max(0, Math.trunc(props.count));
  const overflowed =
    kind === "count" && clamped !== undefined && props.max !== undefined && clamped > props.max;
  const displayValue =
    kind !== "count" || clamped === undefined ? "" : overflowed ? `${props.max}+` : String(clamped);
  const hidden =
    kind === "count" && (clamped === undefined || (clamped === 0 && props.showZero !== true));

  return {
    kind,
    displayValue,
    overflowed,
    hidden,
    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        "data-kind": kind,
        "data-tone": tone,
        "data-variant": variant,
        "data-overlap": dataAttr(props.overlap),
        "data-overflow": dataAttr(overflowed),
        // The HTML attribute, not a data- twin: `[hidden]` selects as it is.
        hidden: hidden ? true : undefined,
        role: props.label !== undefined ? "img" : undefined,
        "aria-label": props.label,
        // A dot with no label is pure decoration; the information belongs in
        // the host's accessible name.
        "aria-hidden": kind === "dot" && props.label === undefined ? ariaAttr(true) : undefined,
      }),
  };
}
