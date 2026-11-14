/**
 * The one place React's dialect is spoken. `connect` returns plain DOM — `class`,
 * `for`, `onFocusIn` — and every adapter translates once, at this boundary; this
 * file is deliberately excluded from the "an adapter over 500 lines is an
 * architecture bug" count, because it is a dictionary, not logic.
 *
 * `onFocusIn` → `onFocus` is a rename, not an approximation: React's synthetic
 * focus events are `focusin`/`focusout` underneath, so they bubble exactly like
 * the DOM events the core meant.
 *
 * One entry is not a rename and cannot be: `hidden="until-found"` is a value
 * react-dom overwrites rather than a name it spells differently, so it is the
 * one place here that installs behaviour instead of translating a key. Its
 * reasoning is on `writeHiddenUntilFound` below.
 */

import {
  type AnyProps,
  createNormalizer,
  type NormalizeProps,
  type PropTypes,
} from "@standarui/core";
import type { JSX } from "react";

export interface ReactPropTypes extends PropTypes {
  element: JSX.IntrinsicElements["div"];
  a: JSX.IntrinsicElements["a"];
  button: JSX.IntrinsicElements["button"];
  input: JSX.IntrinsicElements["input"];
  label: JSX.IntrinsicElements["label"];
  output: JSX.IntrinsicElements["output"];
  select: JSX.IntrinsicElements["select"];
  textarea: JSX.IntrinsicElements["textarea"];
  img: JSX.IntrinsicElements["img"];
  svg: JSX.IntrinsicElements["svg"];
  circle: JSX.IntrinsicElements["circle"];
  path: JSX.IntrinsicElements["path"];
}

/** Custom properties keep their dashes; React applies them verbatim. */
function toCamelCase(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim();
    if (property !== "") result[toCamelCase(property)] = declaration.slice(separator + 1).trim();
  }
  return result;
}

function toReactStyle(style: unknown): Record<string, unknown> | undefined {
  if (typeof style === "string") return parseStyle(style);
  if (typeof style !== "object" || style === null) return undefined;
  const result: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(style)) {
    if (value === undefined) continue;
    result[toCamelCase(property)] = value;
  }
  return result;
}

/**
 * The one attribute value React refuses to carry. `hidden` sits on react-dom's
 * hard-coded boolean list (`setProp`, react-dom-client 19.2), where every truthy
 * value is written as `hidden=""` — so the keyword, which is the whole of the
 * accordion's find-in-page contract, was destroyed on its way to the DOM. There
 * is no prop spelling that escapes it: the switch matches the literal key, and
 * any other casing draws React's "Invalid DOM property" error in dev.
 *
 * So React keeps owning the attribute's *lifecycle* — it is still handed
 * `hidden: true`, which is what the server renders and what hydration then
 * matches, and which is the write it removes when the panel opens — and the
 * keyword is put back on the node by a callback ref. React attaches refs in the
 * layout phase, after the mutation that just wrote `hidden=""`, so the write
 * always lands last within its own commit.
 *
 * The identity is module-level on purpose. React re-runs a callback ref only
 * when the identity changes or when the ref appears or disappears, and this one
 * appears on exactly the commits where the keyword is wanted and disappears on
 * the ones where React takes the attribute off. It therefore fires once per
 * transition and never churns on the renders in between.
 *
 * Known limit: a consumer's own `ref` on the same part wins in `mergeProps` and
 * takes this one's place. The panel then keeps a plain `hidden` — still hidden,
 * still animated, only no longer findable by Ctrl+F.
 */
const UNTIL_FOUND = "until-found";

function writeHiddenUntilFound(node: Element | null): void {
  node?.setAttribute("hidden", UNTIL_FOUND);
}

const RENAMED: Readonly<Record<string, string>> = {
  class: "className",
  for: "htmlFor",
  onFocusIn: "onFocus",
  onFocusOut: "onBlur",
  autofocus: "autoFocus",
};

export const normalizeProps: NormalizeProps<ReactPropTypes> = createNormalizer<ReactPropTypes>(
  (props: AnyProps): AnyProps => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      // An explicit `undefined` is dropped rather than forwarded: React would
      // treat `checked: undefined` as "uncontrolled" and warn about the switch.
      if (value === undefined) continue;
      if (key === "style") {
        result.style = toReactStyle(value);
        continue;
      }
      if (key === "hidden" && value === UNTIL_FOUND) {
        result.hidden = true;
        result.ref = writeHiddenUntilFound;
        continue;
      }
      result[RENAMED[key] ?? key] = value;
    }
    return result;
  },
);
