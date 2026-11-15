/**
 * The select in React: the menu's shape — a root that renders no element, a
 * portalled surface, two presences — with two inversions of its own.
 *
 * **The content is mounted by default** (`keepMounted` defaults to `true`, the
 * exact opposite of menu and popover), because the collection is the DOM and the
 * select has a value: the closed trigger shows the selected label, the closed
 * typeahead finds the items, and the form mirror knows the selection — three
 * reads that need the items to exist while the surface is visually gone. The
 * closed surface is hidden by the stylesheet (`data-state="closed"` →
 * `visibility: hidden`), which also takes it out of the accessibility tree and
 * the tab order without unmounting it.
 *
 * **The form is real.** `SelectHiddenSelect` renders a native `<select>` with a
 * single mirrored `<option>` — the submission only needs the selection, and a
 * full mirror of the collection would be paid on every render.
 */

import * as select from "@standarui/core/select";
import { type ReactNode, type Ref, useId, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { useFieldContext } from "../../field-context";
import { LayerProvider, useParentLayerId } from "../../layer-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { Portal, type PortalProps } from "../../portal";
import { type PresenceApi, usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type SelectApi = select.SelectApi<ReactPropTypes>;

export interface UseSelectProps extends select.SelectMachineProps, MachineRuntimeProps {}

interface SelectContextValue {
  readonly api: SelectApi;
  readonly keepMounted: boolean;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

const SelectContext = createPartContext<SelectContextValue>("Select");
const SelectItemContext = createPartContext<string>("Select");
const SelectGroupContext = createPartContext<string>("Select");

/**
 * The machine on its own, for a consumer who would rather write the markup than
 * compose the parts.
 */
export function useSelect(props: UseSelectProps): SelectApi {
  const host = useIntentScopeHost();
  const parentLayerId = useParentLayerId();

  const service = useMachine(select.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says
    // "this surface answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    // A select opened from inside another surface carries that surface's layer
    // id, so a click in the portalled listbox never dismisses its host.
    parentId: props.parentId ?? parentLayerId,
  });
  return select.connect(service, normalizeProps);
}

export function useSelectContext(): SelectApi {
  return SelectContext.usePart("SelectContext").api;
}

export interface SelectRootProps extends UseSelectProps {
  /**
   * `true` by default — the inverse of menu and popover, and the price of "the
   * collection is the DOM" on a component with a value (see the module header).
   * Opting out is for a consumer who feeds `value` and the `SelectValueText`
   * children from their own model: without them a closed trigger shows the
   * placeholder over a value.
   */
  readonly keepMounted?: boolean | undefined;
  readonly children?: ReactNode;
}

export function SelectRoot(props: SelectRootProps): ReactNode {
  const { children, keepMounted, ...machineProps } = props;
  const field = useFieldContext();
  const api = useSelect({
    ...machineProps,
    // The field's flags reach the machine as props rather than being merged
    // over its output — `??`, so a control that answers for itself wins.
    disabled: machineProps.disabled ?? field?.disabled,
    invalid: machineProps.invalid ?? field?.invalid,
    required: machineProps.required ?? field?.required,
    describedBy: machineProps.describedBy ?? field?.controlProps["aria-describedby"],
    // The trigger is the labelable control here (`<button>`), so it wears the
    // field's control id and `label[for]` resolves natively.
    ids: { trigger: field?.controlProps.id, ...machineProps.ids },
  });
  const { motion } = useEnvironment();
  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const immediate = motion === "none";

  // Two presences: the scrim and the surface run different exits, and one
  // presence can only measure the animations of the node it holds.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  const value: SelectContextValue = {
    api,
    keepMounted: keepMounted !== false,
    backdrop,
    content,
  };

  return (
    <LayerProvider layerId={api.contentId}>
      <SelectContext.Provider value={value}>{children}</SelectContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence:
 * the interpreter installs the open state's effects in the layout effect of the
 * very commit that opened it, and every one of them looks the surface up by id.
 */
function isMounted(context: SelectContextValue, presence: PresenceApi): boolean {
  return context.keepMounted || context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const SelectTrigger: (props: PartProps<"button">) => ReactNode = createPart(SelectContext, {
  name: "SelectTrigger",
  element: "button",
  props: (context) => context.api.getTriggerProps(),
});

export interface SelectValueTextProps extends PartProps<"span"> {
  /** Shown while nothing is selected. `children` wins, then the captured label. */
  readonly placeholder?: string | undefined;
}

export function SelectValueText(props: SelectValueTextProps): ReactNode {
  const { render, asChild, children, placeholder, ...elementProps } = props;
  const context = SelectContext.usePart("SelectValueText");
  const { api } = context;

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getValueTextProps(),
    elementProps,
    children: children ?? api.valueLabel ?? placeholder,
  });
}

/** The double chevron. Decoration — an inline SVG, never a text glyph. */
export const SelectIndicator: (props: PartProps<"span">) => ReactNode = createPart(SelectContext, {
  name: "SelectIndicator",
  element: "span",
  props: (context) => context.api.getIndicatorProps(),
});

/**
 * The form mirror, a sibling of the trigger (a `<select>` inside a `<button>`
 * is invalid HTML). One `<option>`: the submission only needs the selection.
 * With no value the mirrored option is empty and selected, which is exactly
 * what makes `required` fail `checkValidity()` — the native validation, kept.
 */
export function SelectHiddenSelect(props: PartProps<"select">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = SelectContext.usePart("SelectHiddenSelect");
  const { api } = context;

  return useRender({
    render,
    asChild,
    element: "select",
    props: api.getHiddenSelectProps(),
    elementProps,
    // One `<option>` in both directions: with no value `api.value` is `null` by
    // construction (`hasValue` *is* `value !== null`), so the empty selected
    // option falls out of the same element rather than needing a second one.
    children: (
      <option value={api.value ?? ""}>{api.hasValue ? (api.valueLabel ?? api.value) : null}</option>
    ),
  });
}

export interface SelectPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function SelectPortal(props: SelectPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = SelectContext.usePart("SelectPortal");
  const present = isMounted(context, context.backdrop) || isMounted(context, context.content);

  if (!present) return null;
  return <Portal {...portalProps}>{children}</Portal>;
}

/**
 * The scrim, and the sheet's alone: an anchored popup that dimmed the page
 * would swallow the very click that is meant to dismiss it. Rendered then
 * discarded rather than returned early — `useRender` is a hook, and a density
 * flip must not change how many of them this component runs.
 */
export function SelectBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = SelectContext.usePart("SelectBackdrop");
  const composed = usePresenceRef(context.backdrop, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getBackdropProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return context.api.presentation === "sheet" && isMounted(context, context.backdrop)
    ? element
    : null;
}

export function SelectPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = SelectContext.usePart("SelectPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  return isMounted(context, context.content) ? element : null;
}

/**
 * The scroll affordance, two nodes the adapter writes rather than parts —
 * nothing composes into them and nothing renders inside them (see the menu,
 * whose arrangement this is). Outermost on both sides, so the first row slides
 * under the top band and the last under the bottom one.
 */
const SCROLL_EDGE_UP = <div data-scroll-edge="up" aria-hidden="true" />;
const SCROLL_EDGE_DOWN = <div data-scroll-edge="down" aria-hidden="true" />;

export function SelectContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = SelectContext.usePart("SelectContent");
  const composed = usePresenceRef(context.content, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children: (
      <>
        {SCROLL_EDGE_UP}
        {children}
        {SCROLL_EDGE_DOWN}
      </>
    ),
  });

  return isMounted(context, context.content) ? element : null;
}

export interface SelectItemGroupProps extends PartProps<"div", select.SelectItemGroupProps> {
  /** Any stable key of the consumer's; a `useId()` when they have none. */
  readonly id?: string | undefined;
  /**
   * **A flag, not the text.** Say `label` when the group renders a
   * `SelectItemGroupLabel`, and `aria-labelledby` is wired to it. Written blind
   * the attribute points at an element nobody rendered (the menu's lesson).
   */
  readonly label?: boolean | undefined;
}

export function SelectItemGroup(props: SelectItemGroupProps): ReactNode {
  const [group, rest] = splitProps(props, ["id", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = SelectContext.usePart("SelectItemGroup");
  const fallback = useId();
  const key = group.id ?? fallback;

  return (
    <SelectGroupContext.Provider value={key}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getItemGroupProps({ id: key, label: group.label }),
        elementProps,
        children,
      })}
    </SelectGroupContext.Provider>
  );
}

export function SelectItemGroupLabel(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = SelectContext.usePart("SelectItemGroupLabel");
  const htmlFor = SelectGroupContext.usePart("SelectItemGroupLabel");

  return useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getItemGroupLabelProps({ htmlFor }),
    elementProps,
    children,
  });
}

export interface SelectItemProps
  extends select.SelectItemProps,
    PartProps<"div", select.SelectItemProps> {}

export function SelectItem(props: SelectItemProps): ReactNode {
  const [item, rest] = splitProps(props, ["value", "disabled", "label"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = SelectContext.usePart("SelectItem");

  return (
    <SelectItemContext.Provider value={item.value}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getItemProps(item),
        elementProps,
        children,
      })}
    </SelectItemContext.Provider>
  );
}

/** The option's accessible name, and the typeahead's fallback text. */
export const SelectItemText: (props: PartProps<"span">) => ReactNode = createPart(SelectContext, {
  name: "SelectItemText",
  element: "span",
  props: (context) => context.api.getItemTextProps(),
});

/**
 * The reserved symbol column, sharing one leading track with the checkmark.
 * Give it an inline SVG, never a text glyph: text stands on its font's baseline
 * inside the centred line box, so its ink paints below the box's centre.
 */
export const SelectItemSymbol: (props: PartProps<"span">) => ReactNode = createPart(SelectContext, {
  name: "SelectItemSymbol",
  element: "span",
  props: (context) => context.api.getItemSymbolProps(),
});

/**
 * The checkmark. The state is `aria-selected` on the item, never this glyph —
 * and like the symbol it takes an inline SVG, not a `✓` character.
 */
export function SelectItemIndicator(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = SelectContext.usePart("SelectItemIndicator");
  const value = SelectItemContext.usePart("SelectItemIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: context.api.getItemIndicatorProps({ value }),
    elementProps,
    children,
  });
}

export const SelectSeparator: (props: PartProps<"div">) => ReactNode = createPart(SelectContext, {
  name: "SelectSeparator",
  element: "div",
  props: (context) => context.api.getSeparatorProps(),
});

/**
 * The sheet's Cancel card, and only the sheet's — a sibling of the listbox
 * inside the positioner, never a child of it (a bare button inside a
 * `role="listbox"` is an owned-children violation). The hook runs
 * unconditionally; only the element is withheld (the MenuBackdrop rule).
 */
export function SelectCancelTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = SelectContext.usePart("SelectCancelTrigger");

  const element = useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getCancelTriggerProps(),
    elementProps,
    children,
  });

  return context.api.presentation === "sheet" ? element : null;
}
