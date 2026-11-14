/**
 * The clip-rect recipe: removed from sight, kept in the accessibility tree and in
 * the tab order. `display: none` and `visibility: hidden` would remove it from
 * both, which is the whole difference.
 *
 * Used for the label of a custom control and for the native `hiddenInput` every
 * form component carries so it associates with a `<form>` without any JS on the
 * consumer's side (CDC §4.5).
 */

import type { HTMLProps } from "../machine/prop-types";

export const visuallyHiddenStyle: Readonly<Record<string, string>> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "clip-path": "inset(50%)",
  "white-space": "nowrap",
  "border-width": "0",
};

export function getVisuallyHiddenProps(): HTMLProps {
  return { style: visuallyHiddenStyle };
}
