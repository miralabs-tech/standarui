/**
 * The accordion in React: one machine in the root, and one context per item so
 * that a header, a chevron and a panel do not each have to be told which value
 * they belong to.
 *
 * **Nothing is unmounted here, and there is no presence.** Every other surface in
 * this library keeps a `usePresence` so its exit can be seen before React removes
 * the node; an accordion panel is never removed at all. It has to exist for
 * `hidden="until-found"` to have anything to find, for a server render to carry
 * the closed state without a flash, and for `aria-controls` to name an element
 * that is really there. What defers `hidden` is the machine itself, which is why
 * the exit plays identically in every adapter — including the ones that own no
 * markup of their own.
 *
 * That leaves the adapter with exactly one job React can get wrong: running the
 * machine's watchers *after* the commit that painted `data-state`, which
 * `useMachine` does in a layout effect. The collapse is measured in that window,
 * before the browser paints.
 */

import type { Service } from "@standarui/core";
import * as accordion from "@standarui/core/accordion";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type AccordionApi = accordion.AccordionApi<ReactPropTypes>;

export interface UseAccordionProps extends accordion.AccordionMachineProps, MachineRuntimeProps {}

/**
 * What every part below the item needs: the api, and which item it is in. The
 * core's `connect` stays explicit — every getter takes the value — and this is
 * only the plumbing that saves a consumer from repeating it seven times.
 */
export interface AccordionItemContextValue {
  readonly api: AccordionApi;
  readonly value: string;
  readonly disabled: boolean | undefined;
}

const AccordionContext = createPartContext<AccordionApi>("Accordion");
const ItemContext = createPartContext<AccordionItemContextValue>("AccordionItem");

function useAccordionService(props: UseAccordionProps): Service<accordion.AccordionSchema> {
  return useMachine(accordion.machine, props);
}

export function useAccordion(props: UseAccordionProps): AccordionApi {
  return accordion.connect(useAccordionService(props), normalizeProps);
}

/** The api of the accordion a subtree sits in — a consumer's own chrome reads it. */
export function useAccordionContext(): AccordionApi {
  return AccordionContext.usePart("AccordionContext");
}

/** The value and the disabled state of the item a subtree sits in. */
export function useAccordionItemContext(): AccordionItemContextValue {
  return ItemContext.usePart("AccordionItemContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "value",
  "defaultValue",
  "multiple",
  "deselectable",
  "disabled",
  "loopFocus",
  "hiddenUntilFound",
  "describedBy",
  "onValueChange",
  "onFocusChange",
] as const;

export interface AccordionRootProps
  extends UseAccordionProps,
    PartProps<"div", UseAccordionProps> {}

export function AccordionRoot(props: AccordionRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useAccordion(inheritFromField(machineProps, field));

  return (
    <AccordionContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps
  extends accordion.AccordionItemProps,
    PartProps<"div", accordion.AccordionItemProps> {}

/**
 * An item is identified by its value and nothing else: its position, its
 * neighbours and whether an arrow key can reach it are read back off the DOM by
 * the machine, which is what stops a conditionally rendered item going out of
 * sync with a registry nobody remembered to update.
 */
export function AccordionItem(props: AccordionItemProps): ReactNode {
  const [itemProps, rest] = splitProps(props, ["value", "disabled"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = AccordionContext.usePart("AccordionItem");

  const context: AccordionItemContextValue = {
    api,
    value: itemProps.value,
    disabled: itemProps.disabled,
  };

  return (
    <ItemContext.Provider value={context}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getItemProps(itemProps),
        elementProps,
        children,
      })}
    </ItemContext.Provider>
  );
}

/**
 * A heading by default, and `h3` only because a default has to be something. APG
 * puts every accordion header in a heading; what level it is at is a fact about
 * the consumer's page, so `<AccordionHeader render={<h2/>}>` is the answer rather
 * than a `level` prop this component would have to translate back into a tag.
 */
export const AccordionHeader: (props: PartProps<"h3">) => ReactNode = createPart<
  AccordionItemContextValue,
  "h3"
>(ItemContext, {
  name: "AccordionHeader",
  element: "h3",
  props: (item) => item.api.getHeaderProps({ value: item.value, disabled: item.disabled }),
});

export const AccordionTrigger: (props: PartProps<"button">) => ReactNode = createPart<
  AccordionItemContextValue,
  "button"
>(ItemContext, {
  name: "AccordionTrigger",
  element: "button",
  props: (item) => item.api.getTriggerProps({ value: item.value, disabled: item.disabled }),
});

/**
 * Decoration, and `aria-hidden` says so. The chevron itself is the consumer's —
 * an inline SVG, never a text glyph, whose ink sits on a baseline rather than in
 * the middle of its box — and the sheet does the turning.
 */
export const AccordionIndicator: (props: PartProps<"span">) => ReactNode = createPart<
  AccordionItemContextValue,
  "span"
>(ItemContext, {
  name: "AccordionIndicator",
  element: "span",
  props: (item) => item.api.getIndicatorProps({ value: item.value, disabled: item.disabled }),
});

/**
 * The box whose height animates, so it carries no padding of its own: a padded
 * box cannot reach zero without its own text sliding out through the bottom edge
 * on the way down. Always rendered, never hidden by React — `hidden` is the
 * machine's, and it arrives only once the exit is over.
 */
export const AccordionContent: (props: PartProps<"div">) => ReactNode = createPart<
  AccordionItemContextValue,
  "div"
>(ItemContext, {
  name: "AccordionContent",
  element: "div",
  props: (item) => item.api.getContentProps({ value: item.value }),
});

/** Where the padding lives, which is what makes `content.scrollHeight` usable. */
export const AccordionBody: (props: PartProps<"div">) => ReactNode = createPart<
  AccordionItemContextValue,
  "div"
>(ItemContext, {
  name: "AccordionBody",
  element: "div",
  props: (item) => item.api.getBodyProps({ value: item.value }),
});
