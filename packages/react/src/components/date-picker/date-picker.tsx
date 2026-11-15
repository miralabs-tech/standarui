/**
 * The date picker in React: the select's shape — a portalled surface, two
 * presences, a layer id — with a root that renders a real element, because the
 * field is not portalled and has to sit beside the trigger (a native combo box,
 * two click zones).
 *
 * **The content is unmounted while closed**, the inverse of the select's
 * `keepMounted`: this picker holds its own value, so nothing has to read the
 * surface between opens — and an unmounted surface is what makes the trigger's
 * `aria-controls` honest and leaves no IDREF behind on a server.
 *
 * **`DatePickerCalendar` and `DatePickerField` render other components.** They are
 * the composition the spec asks for (§3.3): the picker's `getCalendarProps()` and
 * `getFieldProps()` are **machine props** spread onto a `CalendarRoot` and a
 * `DateFieldRoot`, after the consumer's own, so a picker's answer always wins over
 * a prop written on the child — the descent `field` imposed on every control under
 * it. Neither child becomes a part of this anatomy: a calendar inside a picker
 * still answers to `calendar:*`, which is what keeps one stylesheet for both.
 */

import * as datePicker from "@standarui/core/date-picker";
import { type ReactNode, type Ref, useMemo } from "react";
import { composeRefs } from "../../compose-refs";
import { createPart, type PartProps } from "../../create-part";
import { useEnvironment } from "../../environment";
import { inheritFromField, useFieldContext } from "../../field-context";
import { LayerProvider, useParentLayerId } from "../../layer-context";
import { useIntentScopeHost } from "../../nav";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { Portal, type PortalProps } from "../../portal";
import { type PresenceApi, usePresence } from "../../presence";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";
import { CalendarRoot, type CalendarRootProps } from "../calendar/calendar";
import { DateFieldRoot, type DateFieldRootProps } from "../date-field/date-field";

export type DatePickerApi = datePicker.DatePickerApi<ReactPropTypes>;

export interface UseDatePickerProps
  extends datePicker.DatePickerMachineProps,
    MachineRuntimeProps {}

interface DatePickerContextValue {
  readonly api: DatePickerApi;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

const DatePickerContext = createPartContext<DatePickerContextValue>("DatePicker");

/**
 * The machine on its own, for a consumer who would rather write the markup than
 * compose the parts.
 */
export function useDatePicker(props: UseDatePickerProps): DatePickerApi {
  const host = useIntentScopeHost();
  const parentLayerId = useParentLayerId();

  const service = useMachine(datePicker.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // surface answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    // A picker opened from inside another surface carries that surface's layer id,
    // so a click in the portalled calendar never dismisses its host.
    parentId: props.parentId ?? parentLayerId,
  });
  return datePicker.connect(service, normalizeProps);
}

/** The api of the picker a subtree sits in — a consumer's own chrome reads it. */
export function useDatePickerContext(): DatePickerApi {
  return DatePickerContext.usePart("DatePickerContext").api;
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "value",
  "defaultValue",
  "onValueChange",
  "clearable",
  "open",
  "defaultOpen",
  "onOpenChange",
  "presentation",
  "closeOnSelect",
  "placement",
  "gap",
  "offset",
  "flip",
  "shift",
  "padding",
  "matchWidth",
  "strategy",
  "boundary",
  "getAnchorRect",
  "dir",
  "locale",
  "today",
  "min",
  "max",
  "isDateUnavailable",
  "readOnly",
  "closeOnEscape",
  "closeOnInteractOutside",
  "preventOutsideActivation",
  "modal",
  "preventScroll",
  "onDismiss",
  "parentId",
  "restoreFocus",
  "finalFocus",
  "persistentElements",
  "name",
  "form",
  "required",
  "invalid",
  "disabled",
  "label",
  "labelledBy",
  "describedBy",
  "intents",
] as const;

export interface DatePickerRootProps
  extends UseDatePickerProps,
    PartProps<"div", UseDatePickerProps> {}

export function DatePickerRoot(props: DatePickerRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useDatePicker(inheritFromField(machineProps, field));
  const { motion } = useEnvironment();
  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const immediate = motion === "none";

  // Two presences: the scrim and the surface run different exits, and one presence
  // can only measure the animations of the node it holds.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  const value: DatePickerContextValue = { api, backdrop, content };

  return (
    <LayerProvider layerId={api.contentId}>
      <DatePickerContext.Provider value={value}>
        {useRender({
          render,
          asChild,
          element: "div",
          props: api.getRootProps(),
          elementProps,
          children,
        })}
      </DatePickerContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence: the
 * interpreter installs the open state's effects in the layout effect of the very
 * commit that opened it, and every one of them looks the surface up by id.
 */
function isMounted(context: DatePickerContextValue, presence: PresenceApi): boolean {
  return context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

export const DatePickerLabel: (props: PartProps<"span">) => ReactNode = createPart(
  DatePickerContext,
  { name: "DatePickerLabel", element: "span", props: (context) => context.api.getLabelProps() },
);

export const DatePickerTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DatePickerContext,
  {
    name: "DatePickerTrigger",
    element: "button",
    props: (context) => context.api.getTriggerProps(),
  },
);

export const DatePickerClearTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DatePickerContext,
  {
    name: "DatePickerClearTrigger",
    element: "button",
    props: (context) => context.api.getClearTriggerProps(),
  },
);

/**
 * The segmented field beside the trigger. A `DateFieldRoot` driven by the picker's
 * props, so the consumer writes the field's own parts inside it and never wires the
 * value: `<DatePickerField><DateFieldControl><DateFieldSegments/>…`.
 */
export function DatePickerField(props: DateFieldRootProps): ReactNode {
  const context = DatePickerContext.usePart("DatePickerField");
  return <DateFieldRoot {...props} {...context.api.getFieldProps()} />;
}

/**
 * The month grid inside the surface. A `CalendarRoot` driven by the picker's props
 * — the calendar's own presentation props (`weekNumbers`, `fixedWeeks`,
 * `firstDayOfWeek`, `views`) still belong to the consumer and are passed through.
 */
export function DatePickerCalendar(props: CalendarRootProps): ReactNode {
  const context = DatePickerContext.usePart("DatePickerCalendar");
  return <CalendarRoot {...props} {...context.api.getCalendarProps()} />;
}

export interface DatePickerPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

export function DatePickerPortal(props: DatePickerPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = DatePickerContext.usePart("DatePickerPortal");
  const present = isMounted(context, context.backdrop) || isMounted(context, context.content);

  if (!present) return null;
  return <Portal {...portalProps}>{children}</Portal>;
}

/**
 * The scrim, and the sheet's alone: an anchored popup that dimmed the page would
 * swallow the very click that is meant to dismiss it. Rendered then discarded
 * rather than returned early — `useRender` is a hook, and a density flip must not
 * change how many of them this component runs.
 */
export function DatePickerBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = DatePickerContext.usePart("DatePickerBackdrop");
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

export function DatePickerPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = DatePickerContext.usePart("DatePickerPositioner");

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

export function DatePickerContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = DatePickerContext.usePart("DatePickerContent");
  const composed = usePresenceRef(context.content, ref);

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getContentProps(),
    elementProps: { ...elementProps, ref: composed },
    children,
  });

  return isMounted(context, context.content) ? element : null;
}

/**
 * The surface's accessible name when it is rendered — a `role="dialog"` takes none
 * from its contents. Without one the trigger names the surface instead, which is
 * why the IDREF is never written blind.
 */
export const DatePickerTitle: (props: PartProps<"h2">) => ReactNode = createPart(
  DatePickerContext,
  { name: "DatePickerTitle", element: "h2", props: (context) => context.api.getTitleProps() },
);

/**
 * The sheet's Cancel card, and only the sheet's — it leaves the document in a
 * popup rather than being hidden by the stylesheet (the menu's lesson). The hook
 * runs unconditionally; only the element is withheld.
 */
export function DatePickerCancelTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = DatePickerContext.usePart("DatePickerCancelTrigger");

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

/**
 * A composition point. It carries no accessible name of its own: the consumer
 * gives it one or does not render it, the rule `dialog:close-trigger` lives by.
 */
export const DatePickerCloseTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  DatePickerContext,
  {
    name: "DatePickerCloseTrigger",
    element: "button",
    props: (context) => context.api.getCloseTriggerProps(),
  },
);
