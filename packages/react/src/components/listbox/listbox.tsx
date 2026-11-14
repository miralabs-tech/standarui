/**
 * The listbox in React: one machine in the root, and nothing else to arrange.
 *
 * There is no portal, no presence and no layer here — a listbox is content in the
 * page — so what the adapter owes the machine is exactly two things a consumer
 * should never wire by hand: the intent scope a d-pad arrives on, taken from the
 * nearest `<NavProvider>`, and the two scroll-edge bands the surface owes
 * itself.
 *
 * **The items are composition, never an `items` prop.** The machine reads the live
 * DOM, so a row only has to publish its own value on its own parts — which is what
 * makes a filtered list work without a registry anybody has to keep in step.
 */

import type { Service } from "@standarui/core";
import * as listbox from "@standarui/core/listbox";
import { useIntentScopeHost } from "@standarx/nav/react";
import { type ReactNode, useId } from "react";
import { createPart, type PartProps } from "../../create-part";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type ListboxApi = listbox.ListboxApi<ReactPropTypes>;

export interface UseListboxProps extends listbox.ListboxMachineProps, MachineRuntimeProps {}

const ListboxContext = createPartContext<ListboxApi>("Listbox");
/** A row publishes its identity so its own parts do not have to repeat it. */
const ListboxItemContext = createPartContext<string>("Listbox");
const ListboxGroupContext = createPartContext<string>("Listbox");

function useListboxService(props: UseListboxProps): Service<listbox.ListboxSchema> {
  const host = useIntentScopeHost();

  return useMachine(listbox.machine, {
    ...props,
    // `??` would override an explicit `null`, and `null` is how a consumer says
    // "this list answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
  });
}

/** The machine on its own, for a consumer who would rather write the markup. */
export function useListbox(props: UseListboxProps): ListboxApi {
  return listbox.connect(useListboxService(props), normalizeProps);
}

/** The api of the list a subtree sits in — a consumer's own chrome reads it. */
export function useListboxContext(): ListboxApi {
  return ListboxContext.usePart("ListboxContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "orientation",
  "selectionMode",
  "deselectable",
  "selectOnHighlight",
  "loopFocus",
  "typeahead",
  "disabled",
  "label",
  "intents",
  "value",
  "defaultValue",
  "highlightedValue",
  "defaultHighlightedValue",
  "onValueChange",
  "onHighlightChange",
  "onSelect",
] as const;

export interface ListboxRootProps extends UseListboxProps, PartProps<"div", UseListboxProps> {}

export function ListboxRoot(props: ListboxRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useListbox(machineProps);

  return (
    <ListboxContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </ListboxContext.Provider>
  );
}

/**
 * The name of the list. Rendering it is what switches the content from
 * `aria-label` to `aria-labelledby` — the machine sees the part in the DOM, so the
 * two can never disagree and the IDREF can never dangle.
 */
export const ListboxLabel: (props: PartProps<"span">) => ReactNode = createPart(ListboxContext, {
  name: "ListboxLabel",
  element: "span",
  props: (api) => api.getLabelProps(),
});

/**
 * The scroll affordance, and the reason it is two nodes the adapter writes rather
 * than a part or a pseudo-element: nothing composes into them and nothing renders
 * inside them, so they are decoration the list owes itself. They must be the
 * outermost children on both sides — the first row is what slides under the top
 * band.
 */
const SCROLL_EDGES = {
  up: <div data-scroll-edge="up" aria-hidden="true" />,
  down: <div data-scroll-edge="down" aria-hidden="true" />,
};

export function ListboxContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = ListboxContext.usePart("ListboxContent");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getContentProps(),
    elementProps,
    children: (
      <>
        {SCROLL_EDGES.up}
        {children}
        {SCROLL_EDGES.down}
      </>
    ),
  });
}

export interface ListboxItemGroupProps extends PartProps<"div", listbox.ListboxItemGroupProps> {
  /** Any stable key of the consumer's; a `useId()` when they have none. */
  readonly id?: string | undefined;
  /**
   * **A flag, not the text.** Say `label` when the group renders a
   * `ListboxItemGroupLabel`. Left out, the group carries no reference at all —
   * written blind the attribute points at an element nobody rendered, and a group
   * with a dead IDREF has no accessible name *and* nothing to report it, since axe
   * grades that `incomplete` rather than a violation.
   */
  readonly label?: boolean | undefined;
}

export function ListboxItemGroup(props: ListboxItemGroupProps): ReactNode {
  const [group, rest] = splitProps(props, ["id", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ListboxContext.usePart("ListboxItemGroup");
  const fallback = useId();
  // Published so the label does not have to repeat it — both ids are derived from
  // the same key, which is the whole of `aria-labelledby` here.
  const key = group.id ?? fallback;

  return (
    <ListboxGroupContext.Provider value={key}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getItemGroupProps({ id: key, label: group.label }),
        elementProps,
        children,
      })}
    </ListboxGroupContext.Provider>
  );
}

export function ListboxItemGroupLabel(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = ListboxContext.usePart("ListboxItemGroupLabel");
  const htmlFor = ListboxGroupContext.usePart("ListboxItemGroupLabel");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getItemGroupLabelProps({ htmlFor }),
    elementProps,
    children,
  });
}

export interface ListboxItemProps
  extends listbox.ListboxItemProps,
    PartProps<"div", listbox.ListboxItemProps> {}

/**
 * A row is identified by its value and nothing else: its position, its neighbours
 * and whether it holds the tab stop are all read back off the DOM by the machine,
 * which is what stops a conditionally rendered row going out of sync with a
 * registry nobody remembered to update.
 */
export function ListboxItem(props: ListboxItemProps): ReactNode {
  const [item, rest] = splitProps(props, ["value", "disabled", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = ListboxContext.usePart("ListboxItem");

  return (
    <ListboxItemContext.Provider value={item.value}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getItemProps(item),
        elementProps,
        children,
      })}
    </ListboxItemContext.Provider>
  );
}

/** The row's accessible name, and what the typeahead matches on. */
export const ListboxItemText: (props: PartProps<"span">) => ReactNode = createPart(ListboxContext, {
  name: "ListboxItemText",
  element: "span",
  props: (api) => api.getItemTextProps(),
});

/**
 * The checkmark. The state is `aria-selected` on the row, never this glyph — so the
 * node is hidden and the two can never disagree. Give it an inline SVG, never a
 * text glyph: text stands on its font's baseline inside the centred line box, so
 * its ink paints below the box's centre while an SVG's viewBox fills the square.
 */
export function ListboxItemIndicator(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = ListboxContext.usePart("ListboxItemIndicator");
  const value = ListboxItemContext.usePart("ListboxItemIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getItemIndicatorProps({ value }),
    elementProps,
    children,
  });
}
