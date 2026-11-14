import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, boolAttr, dataAttr } from "../../dom/attrs";
import { getRovingKeyAction } from "../../focus/roving-focus";
import type { HTMLProps, NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./accordion.anatomy";
import { getContentId, getItemId, getRootId, getTriggerId } from "./accordion.dom";
import type {
  AccordionApi,
  AccordionContentProps,
  AccordionItemProps,
  AccordionSchema,
} from "./accordion.types";

/**
 * `hidden="until-found"` is a real attribute value and `HTMLProps` types the
 * attribute as a boolean, which is what every other part of this library needs it
 * to be. The cast is the narrow, named place where the third value crosses that
 * boundary; both writers downstream serialise it correctly (`String(value)` in
 * `dom/apply`, verbatim in React), and an engine that does not know the keyword
 * falls back to treating the attribute as the plain boolean it looks like.
 */
function hiddenValue(untilFound: boolean): HTMLProps["hidden"] {
  return (untilFound ? "until-found" : true) as unknown as HTMLProps["hidden"];
}

export function connect<T extends PropTypes>(
  service: Service<AccordionSchema>,
  normalize: NormalizeProps<T>,
): AccordionApi<T> {
  const { context, computed, prop, refs, send, scope } = service;

  const value = context.get("value");
  const exitingValues = context.get("exitingValues");
  const disabled = !computed("interactive");
  const multiple = prop("multiple");
  const untilFound = prop("hiddenUntilFound");

  const focusedValue = context.get("focusedValue");
  // Read once, when the focus landed, and held: the modality of *now* flips to
  // pointer after 300 ms of mouse movement whether or not the focus moved, and a
  // ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  // A ref, so it schedules no render of its own: it is seeded before the first
  // connect and every value leaves it in the very commit that moves that value,
  // which is the commit the animation belongs to.
  const immediateValues = refs.get("immediateValues");

  const isOpen = (entry: string): boolean => value.includes(entry);
  const isExiting = (entry: string): boolean => exitingValues.includes(entry);

  return {
    value,
    focusedValue,
    disabled,
    isOpen,

    setValue(next: readonly string[]): void {
      send({ type: "VALUE.SET", value: next });
    },

    open(entry: string): void {
      if (isOpen(entry)) return;
      send({ type: "VALUE.SET", value: multiple ? [...value, entry] : [entry] });
    },

    // Imperative, so it closes whatever `deselectable` would have refused: the
    // prop guards the header press, not the consumer's own code.
    close(entry: string): void {
      if (!isOpen(entry)) return;
      send({ type: "VALUE.SET", value: value.filter((item) => item !== entry) });
    },

    toggle(entry: string): void {
      send({ type: "TRIGGER.TOGGLE", value: entry });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        "aria-describedby": prop("describedBy"),
        "data-disabled": dataAttr(disabled),
      }),

    getItemProps: (itemProps: AccordionItemProps): T["element"] => {
      const open = isOpen(itemProps.value);
      return normalize.element({
        ...parts.item.attrs,
        id: getItemId(scope, itemProps.value),
        "data-value": itemProps.value,
        "data-state": open ? "open" : "closed",
        "data-disabled": dataAttr(disabled || itemProps.disabled === true),
      });
    },

    /**
     * No role of its own. APG asks for the trigger to live inside a heading, and
     * the heading is the element the consumer renders — `<AccordionHeader
     * render={<h2/>}>` — because only they know what level it is at in their page.
     */
    getHeaderProps: (itemProps: AccordionItemProps): T["element"] => {
      const open = isOpen(itemProps.value);
      return normalize.element({
        ...parts.header.attrs,
        "data-value": itemProps.value,
        "data-state": open ? "open" : "closed",
        "data-disabled": dataAttr(disabled || itemProps.disabled === true),
      });
    },

    getTriggerProps: (itemProps: AccordionItemProps): T["button"] => {
      const entry = itemProps.value;
      const open = isOpen(entry);
      const itemDisabled = disabled || itemProps.disabled === true;
      const focused = focusedValue === entry;

      return normalize.button({
        ...parts.trigger.attrs,
        id: getTriggerId(scope, entry),
        type: "button",
        disabled: itemDisabled,
        "aria-expanded": boolAttr(open),
        // Never dangling: a panel is never unmounted and never lazily built, which
        // is the price of `hidden="until-found"`, of a server render that matches,
        // and of a vanilla adapter that owns no markup of its own.
        "aria-controls": getContentId(scope, entry),
        // The value lives on the element because the DOM is where the header order
        // is read from — this is what keeps the machine out of a registry.
        "data-value": entry,
        "data-state": open ? "open" : "closed",
        "data-disabled": dataAttr(itemDisabled),
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused header only: the group has one focus, and an attribute
        // claiming otherwise on every header describes nothing.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        // Click and nothing else. `TRIGGER.TOGGLE` is not idempotent, and a real
        // `<button>` already turns Enter (keydown) and Space (keyup) into a click
        // — wiring the keys as well is how a single press toggles twice.
        onClick(event) {
          if (event.defaultPrevented || itemDisabled) return;
          send({ type: "TRIGGER.TOGGLE", value: entry });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          // Shift+arrow is the range-selection gesture and belongs to the
          // components that have ranges.
          if (event.shiftKey) return;

          // `bothAxes: false` on a vertical axis: ←/→ are never claimed, so they
          // stay the browser's and still scroll the page. `dir` is fixed because
          // there is nothing to mirror — ↑ and ↓ mean the same thing in every
          // writing direction, and an accordion has no horizontal axis at all.
          const action = getRovingKeyAction(event.key, {
            orientation: "vertical",
            dir: "ltr",
            bothAxes: false,
          });
          if (action === null) return;
          event.preventDefault();
          send({ type: "TRIGGER.NAVIGATE", action, value: entry });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.FOCUS", value: entry });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "TRIGGER.BLUR" });
        },
      });
    },

    getIndicatorProps: (itemProps: AccordionItemProps): T["element"] => {
      const open = isOpen(itemProps.value);
      return normalize.element({
        ...parts.indicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-state": open ? "open" : "closed",
        "data-disabled": dataAttr(disabled || itemProps.disabled === true),
      });
    },

    getContentProps: (contentProps: AccordionContentProps): T["element"] => {
      const entry = contentProps.value;
      const open = isOpen(entry);
      // Present while it is open, and for as long as its exit is still running.
      // `hidden` is `display: none`, so applying it the instant a panel closes
      // would cancel the very animation the exit exists to play.
      const present = open || isExiting(entry);

      return normalize.element({
        ...parts.content.attrs,
        id: getContentId(scope, entry),
        role: "region",
        "aria-labelledby": getTriggerId(scope, entry),
        hidden: present ? undefined : hiddenValue(untilFound),
        // Leaving and not yet `hidden`: out of the tab order and the a11y tree
        // while the exit runs. Never at rest, where `inert` would take a panel
        // out of find-in-page and `until-found` with it.
        inert: !open && present ? true : undefined,
        "data-value": entry,
        // `closed` *during* the exit — that is what starts the close animation.
        "data-state": open ? "open" : "closed",
        // "Do not play an arrival for a state nobody chose": a panel a
        // `defaultValue` opened, and one find-in-page has just revealed under its
        // own scroll. The *exit* needs no such gate — a panel at rest always
        // carries `hidden`, and the sheet keys the close animation on its absence.
        "data-immediate": dataAttr(immediateValues.has(entry)),
      });
    },

    /**
     * Where the padding lives, so that `content` can animate its height to zero
     * without its own text sliding out through the bottom edge — and so that
     * `content.scrollHeight` is the number the animation needs.
     */
    getBodyProps: (contentProps: AccordionContentProps): T["element"] =>
      normalize.element({
        ...parts.body.attrs,
        "data-state": isOpen(contentProps.value) ? "open" : "closed",
      }),
  };
}
