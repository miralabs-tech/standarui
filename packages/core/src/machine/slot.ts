/**
 * Prop merging — the primitive every adapter's `asChild` / render-prop is built
 * on, and the reason a consumer can add their own `onClick` to a part without
 * losing the machine's.
 *
 * The ordering rule is the one Radix settled on, and it is worth stating because
 * it looks inconsistent at first: later arguments win for values, but their
 * handlers run FIRST. That is what makes `event.defaultPrevented` an actual veto
 * — the consumer's handler runs, and the library's handler, which is the one that
 * checks `defaultPrevented`, sees the decision (research/core.md §1.3).
 *
 * `class` accumulates instead of overriding, and `style` merges key by key, since
 * both are additive by nature. So do `data-scope` and `data-part`: composing two
 * parts onto one element is the whole point of `render`, and under "later wins"
 * the outer part's identity erased the inner one — a `<PopoverTrigger
 * render={<ButtonRoot/>}>` came out as the popover's trigger and nothing else, so
 * every rule in the button's sheet stopped matching. They are lists now, and this
 * is the one place the rule can live: `mergeProps` is never called with a part's
 * attributes inside `connect`, only by the adapters' composition, so every adapter
 * inherits it without knowing it exists.
 */

import type { AnyProps } from "./prop-types";

type Handler = (...args: unknown[]) => unknown;

function isHandler(key: string, value: unknown): value is Handler {
  return (
    typeof value === "function" &&
    key.length > 2 &&
    key.startsWith("on") &&
    key[2] === key[2]?.toUpperCase()
  );
}

function parseStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim();
    if (property !== "") result[property] = declaration.slice(separator + 1).trim();
  }
  return result;
}

/**
 * Deduplicated because these two are generated, not authored: the same identity
 * reaching the same element twice is a composition artefact, not an intent.
 */
function mergeTokens(existing: unknown, value: unknown): string {
  const tokens = new Set<string>();
  for (const source of [existing, value]) {
    if (typeof source !== "string") continue;
    for (const token of source.split(" ")) {
      if (token !== "") tokens.add(token);
    }
  }
  return [...tokens].join(" ");
}

function toStyleObject(style: unknown): Record<string, unknown> {
  if (typeof style === "string") return parseStyle(style);
  if (typeof style === "object" && style !== null) return { ...(style as Record<string, unknown>) };
  return {};
}

export function mergeProps(...list: readonly (AnyProps | null | undefined)[]): AnyProps {
  const result: Record<string, unknown> = {};

  for (const props of list) {
    if (props == null) continue;

    for (const [key, value] of Object.entries(props)) {
      const existing = result[key];

      if (isHandler(key, value) && isHandler(key, existing)) {
        // Reversed: the handler contributed later runs before the earlier one.
        result[key] = (...args: unknown[]): void => {
          value(...args);
          existing(...args);
        };
        continue;
      }

      if (key === "class" || key === "className") {
        const merged = [existing, value].filter(
          (entry) => typeof entry === "string" && entry !== "",
        );
        result[key] = merged.join(" ");
        continue;
      }

      if (key === "data-scope" || key === "data-part") {
        result[key] = mergeTokens(existing, value);
        continue;
      }

      if (key === "style") {
        result[key] = { ...toStyleObject(existing), ...toStyleObject(value) };
        continue;
      }

      // An explicit `undefined` never erases a value somebody else provided.
      if (value !== undefined) result[key] = value;
    }
  }

  return result;
}
