/**
 * The colour picker in React: one machine in the root, thirty-two parts that read
 * it, and three presentations that share every one of them.
 *
 * **The surface is unmounted while closed**, unlike `select`: there is no
 * collection to read from the DOM when nothing is open, and the trigger already
 * carries the value. `presentation="inline"` is the exception the machine makes —
 * the content is always mounted there and `presence` never runs, which is what
 * makes its server render hydrate deterministically.
 *
 * **The screen picker is a component that renders `null`.** `EyeDropper` ships on
 * Chromium alone, and the machine only learns that from an effect after mount —
 * so the progressive enhancement is visible in the React tree, never hidden in a
 * stylesheet. It is opt-in as well: a root handed no `eyedropper` module
 * (`@standarui/core/color-picker/eyedropper`) never looks, on any engine.
 */

import * as colorPicker from "@standarui/core/color-picker";
import { Fragment, type ReactNode, type Ref, useMemo } from "react";
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

export type ColorPickerApi = colorPicker.ColorPickerApi<ReactPropTypes>;

export interface UseColorPickerProps
  extends colorPicker.ColorPickerMachineProps,
    MachineRuntimeProps {}

interface ColorPickerContextValue {
  readonly api: ColorPickerApi;
  readonly backdrop: PresenceApi;
  readonly content: PresenceApi;
}

const ColorPickerContext = createPartContext<ColorPickerContextValue>("ColorPicker");
const ChannelContext = createPartContext<colorPicker.ColorNumericChannel>("ColorPicker");
const SwatchContext = createPartContext<number>("ColorPicker");

/** The machine on its own, for a consumer who would rather write the markup. */
export function useColorPicker(props: UseColorPickerProps): ColorPickerApi {
  const host = useIntentScopeHost();
  const parentLayerId = useParentLayerId();

  const service = useMachine(colorPicker.machine, {
    ...props,
    // `??` would override an explicit `null`, which is how a consumer says "this
    // picker answers no gamepad" while a provider is mounted above it.
    intents: props.intents === undefined ? host : props.intents,
    parentId: props.parentId ?? parentLayerId,
  });
  return colorPicker.connect(service, normalizeProps);
}

export function useColorPickerContext(): ColorPickerApi {
  return ColorPickerContext.usePart("ColorPickerContext").api;
}

/** The channel a part sits in — what a consumer reads to label their own markup. */
export function useColorPickerChannel(): colorPicker.ColorNumericChannel {
  return ChannelContext.usePart("ColorPickerChannel");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "value",
  "defaultValue",
  "format",
  "defaultFormat",
  "formats",
  "alpha",
  "open",
  "defaultOpen",
  "presentation",
  "placement",
  "gap",
  "offset",
  "flip",
  "shift",
  "padding",
  "strategy",
  "boundary",
  "modal",
  "closeOnEscape",
  "closeOnInteractOutside",
  "restoreFocus",
  "finalFocus",
  "parentId",
  "persistentElements",
  "disabled",
  "readOnly",
  "invalid",
  "required",
  "name",
  "form",
  "variant",
  "step",
  "largeStep",
  "swatches",
  "maxSwatches",
  "swatchColumns",
  "loopSwatches",
  "eyedropper",
  "label",
  "labelledBy",
  "describedBy",
  // This list is kept by hand, and this entry was missing: `translations` is a
  // machine prop (`color-picker.types.ts`), so `splitProps` was handing the whole
  // object to the root `<div>` as an unknown DOM attribute instead of to the
  // machine. Every name the seam promises — the channel labels, the close button,
  // the swatch grid and its "+" — was unreachable from React. Found by writing the
  // witness for the channel labels, which is the only reason anything looked.
  "translations",
  "intents",
  "onValueChange",
  "onValueChangeEnd",
  "onFormatChange",
  "onOpenChange",
  "onDismiss",
] as const;

export interface ColorPickerRootProps
  extends UseColorPickerProps,
    PartProps<"div", UseColorPickerProps> {}

export function ColorPickerRoot(props: ColorPickerRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();
  const api = useColorPicker(inheritFromField(machineProps, field) as UseColorPickerProps);
  const { motion } = useEnvironment();
  // See the note in `dialog.tsx`: `reduced` keeps the fade, only `none` removes it.
  const immediate = motion === "none";

  // Two presences: the scrim and the surface run different exits, and one
  // presence can only measure the animations of the node it holds.
  const backdrop = usePresence({ present: api.open, immediate });
  const content = usePresence({ present: api.open, immediate });

  const value: ColorPickerContextValue = { api, backdrop, content };

  return (
    <LayerProvider layerId={api.contentId}>
      <ColorPickerContext.Provider value={value}>
        {useRender({
          render,
          asChild,
          element: "div",
          props: api.getRootProps(),
          elementProps,
          children,
        })}
      </ColorPickerContext.Provider>
    </LayerProvider>
  );
}

/**
 * Read straight off the machine in the open direction, never off the presence: the
 * interpreter installs the open state's effects in the layout effect of the very
 * commit that opened it, and every one of them looks the surface up by id.
 */
function isMounted(context: ColorPickerContextValue, presence: PresenceApi): boolean {
  if (context.api.presentation === "inline") return true;
  return context.api.open || presence.present;
}

function usePresenceRef(
  presence: PresenceApi,
  consumer: Ref<HTMLElement> | undefined,
): Ref<HTMLElement> {
  return useMemo(() => composeRefs(presence.ref, consumer), [presence.ref, consumer]);
}

/**
 * A `span`, and it has to be: `<label for>` only names *labelable* elements, and
 * an inline panel has no single control to point at. The trigger points back with
 * `aria-labelledby` — but only once the machine has seen this part in the DOM.
 */
export const ColorPickerLabel: (props: PartProps<"span">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerLabel",
    element: "span",
    props: (context) => context.api.getLabelProps(),
  },
);

/**
 * The well that opens the panel — and there is no such thing under
 * `presentation="inline"`, which the anatomy and the public page both state
 * outright. The part said otherwise: it rendered a `button` there with an
 * `aria-expanded="true"` that can never become false (the machine forces `open`
 * in that presentation) and an `aria-controls` pointing at a panel that does not
 * fold. Same shape as `ColorPickerCancelTrigger` below — the hook runs
 * unconditionally, only the element is withheld.
 */
export function ColorPickerTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerTrigger");

  const element = useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getTriggerProps(),
    elementProps,
    children,
  });

  return context.api.presentation === "inline" ? null : element;
}

/** Decoration: the swatch the well shows, painted from the custom properties. */
export const ColorPickerTriggerSwatch: (props: PartProps<"span">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerTriggerSwatch",
    element: "span",
    props: (context) => context.api.getTriggerSwatchProps(),
  },
);

export function ColorPickerValueText(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api } = ColorPickerContext.usePart("ColorPickerValueText");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getValueTextProps(),
    elementProps,
    children: children ?? api.value,
  });
}

/**
 * The form mirror, and it is `type="hidden"`. A real `<input type="color">` would
 * open the platform's own picker on click and put a second value-bearing control
 * in the accessibility tree.
 */
export const ColorPickerHiddenInput: (props: PartProps<"input">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerHiddenInput",
    element: "input",
    props: (context) => context.api.getHiddenInputProps(),
  },
);

export interface ColorPickerPortalProps extends Omit<PortalProps, "children"> {
  readonly children?: ReactNode;
}

/** In `inline` there is nowhere to portal to: the panel is where the author wrote it. */
export function ColorPickerPortal(props: ColorPickerPortalProps): ReactNode {
  const { children, ...portalProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerPortal");

  if (context.api.presentation === "inline") return children;
  if (!isMounted(context, context.backdrop) && !isMounted(context, context.content)) return null;
  return <Portal {...portalProps}>{children}</Portal>;
}

/**
 * The scrim, and the sheet's alone: an anchored popup that dimmed the page would
 * swallow the very click meant to dismiss it. Rendered then discarded rather than
 * returned early — `useRender` is a hook, and a density flip must not change how
 * many of them this component runs.
 */
export function ColorPickerBackdrop(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerBackdrop");
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

export function ColorPickerPositioner(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerPositioner");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getPositionerProps(),
    elementProps,
    children,
  });

  if (context.api.presentation === "inline") return children;
  return isMounted(context, context.content) ? element : null;
}

export function ColorPickerContent(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ref, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerContent");
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

/** Popup only: neither a sheet nor an inline panel draws a tang. */
export function ColorPickerArrow(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerArrow");

  const element = useRender({
    render,
    asChild,
    element: "div",
    props: context.api.getArrowProps(),
    elementProps,
    children,
  });

  return context.api.presentation === "popup" ? element : null;
}

export const ColorPickerTitle: (props: PartProps<"h2">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerTitle",
    element: "h2",
    props: (context) => context.api.getTitleProps(),
  },
);

/**
 * The sheet's Cancel card, and only the sheet's — it leaves the document in the
 * other two rather than being hidden in CSS, or `End` would land on a row the
 * panel does not draw. The hook runs unconditionally; only the element is withheld.
 */
export function ColorPickerCancelTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerCancelTrigger");

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
 * The ✕, and it leaves the document under `presentation="inline"` for the reason
 * the cancel card does: an inline panel does not close. `closeSurface` returns
 * early there and the machine holds `open` at `true`, so the button was a named,
 * focusable control whose click could not do the one thing it names. The guard is
 * here rather than in `getCloseTriggerProps` because the core's line has ~70 bytes
 * left against a CDC ceiling, and this is a rendering decision either way.
 */
export function ColorPickerCloseTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const context = ColorPickerContext.usePart("ColorPickerCloseTrigger");

  const element = useRender({
    render,
    asChild,
    element: "button",
    props: context.api.getCloseTriggerProps(),
    elementProps,
    children,
  });

  return context.api.presentation === "inline" ? null : element;
}

export const ColorPickerArea: (props: PartProps<"div">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerArea",
    element: "div",
    props: (context) => context.api.getAreaProps(),
  },
);

export const ColorPickerAreaBackground: (props: PartProps<"div">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerAreaBackground",
    element: "div",
    props: (context) => context.api.getAreaBackgroundProps(),
  },
);

export const ColorPickerAreaThumb: (props: PartProps<"div">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerAreaThumb",
    element: "div",
    props: (context) => context.api.getAreaThumbProps(),
  },
);

/** The area's only tab stop. Visually hidden, and a real range so it has a value. */
export const ColorPickerAreaXInput: (props: PartProps<"input">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerAreaXInput",
    element: "input",
    props: (context) => context.api.getAreaXInputProps(),
  },
);

export const ColorPickerAreaYInput: (props: PartProps<"input">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerAreaYInput",
    element: "input",
    props: (context) => context.api.getAreaYInputProps(),
  },
);

export interface ColorPickerChannelSliderProps extends PartProps<"div"> {
  readonly channel: colorPicker.ColorNumericChannel;
}

export function ColorPickerChannelSlider(props: ColorPickerChannelSliderProps): ReactNode {
  const [own, rest] = splitProps(props, ["channel"]);
  const { render, asChild, children, ...elementProps } = rest;
  const context = ColorPickerContext.usePart("ColorPickerChannelSlider");

  return (
    <ChannelContext.Provider value={own.channel}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: context.api.getChannelSliderProps({ channel: own.channel }),
        elementProps,
        children,
      })}
    </ChannelContext.Provider>
  );
}

function useChannelPart(name: string): {
  api: ColorPickerApi;
  channel: colorPicker.ColorNumericChannel;
} {
  return {
    api: ColorPickerContext.usePart(name).api,
    channel: ChannelContext.usePart(name),
  };
}

export interface ColorPickerChannelLabelProps extends PartProps<"span"> {
  /** Defaults to the channel of the slider this label sits in. */
  readonly channel?: colorPicker.ColorChannel | undefined;
}

/**
 * One text names the thumb *and* the field beside it, the way the reference design draws it.
 * The machine only wires `aria-labelledby` once it has seen this
 * part in the DOM, so an author who omits it never gets a dangling IDREF.
 */
export function ColorPickerChannelLabel(props: ColorPickerChannelLabelProps): ReactNode {
  const [own, rest] = splitProps(props, ["channel"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api } = ColorPickerContext.usePart("ColorPickerChannelLabel");
  const inherited = ChannelContext.useOptional();
  const channel = own.channel ?? inherited ?? "hex";

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getChannelLabelProps({ channel }),
    elementProps,
    children,
  });
}

export function ColorPickerChannelSliderTrack(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api, channel } = useChannelPart("ColorPickerChannelSliderTrack");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getChannelSliderTrackProps({ channel }),
    elementProps,
    children,
  });
}

export function ColorPickerChannelSliderRange(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api, channel } = useChannelPart("ColorPickerChannelSliderRange");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getChannelSliderRangeProps({ channel }),
    elementProps,
    children,
  });
}

export function ColorPickerChannelSliderThumb(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api, channel } = useChannelPart("ColorPickerChannelSliderThumb");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getChannelSliderThumbProps({ channel }),
    elementProps,
    children,
  });
}

export interface ColorPickerChannelInputProps extends PartProps<"input"> {
  /** Defaults to the channel of the slider this field sits in. `"hex"` has none. */
  readonly channel?: colorPicker.ColorChannel | undefined;
}

export function ColorPickerChannelInput(props: ColorPickerChannelInputProps): ReactNode {
  const [own, rest] = splitProps(props, ["channel"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api } = ColorPickerContext.usePart("ColorPickerChannelInput");
  const inherited = ChannelContext.useOptional();
  const channel = own.channel ?? inherited ?? "hex";

  return useRender({
    render,
    asChild,
    element: "input",
    props: api.getChannelInputProps({ channel }),
    elementProps,
    children,
  });
}

/**
 * Every channel of the current format, three flat parts each: the name, the
 * slider, and the numeric field beside it. `DateFieldSegments` is the pattern and
 * the reason is the same — `api.channels` is computed from the format the machine
 * holds, which can come from an uncontrolled `defaultFormat`, so it exists only
 * inside the root and a composed layer, which may call no hook, cannot loop over
 * it.
 *
 * No node of its own, and no wrapper per channel either: the three parts are
 * siblings under whatever places them, and `_color-picker.scss` is what pairs the
 * slider with its field — the doctrine settled on 2026-09-10. The delivered demo
 * spent two `<div style>` per channel to do the same thing, which is exactly what
 * a composed layer may not render.
 *
 * The `Fragment` carries the key and emits nothing, so the flatness survives it.
 */
export function ColorPickerChannels(): ReactNode {
  const { api } = ColorPickerContext.usePart("ColorPickerChannels");

  return api.channels.map((channel) => (
    <Fragment key={channel}>
      {/* The name, never the machine key. `{channel}` printed "alpha" where the
          reference design writes "Opacity", and the table that knows better lives in the core
          behind `translations.channelLabel` — so the api answers for it. */}
      <ColorPickerChannelLabel channel={channel}>
        {api.getChannelName(channel)}
      </ColorPickerChannelLabel>
      <ColorPickerChannelSlider channel={channel}>
        <ColorPickerChannelSliderTrack>
          <ColorPickerChannelSliderRange />
        </ColorPickerChannelSliderTrack>
        <ColorPickerChannelSliderThumb />
      </ColorPickerChannelSlider>
      <ColorPickerChannelInput channel={channel} />
    </Fragment>
  ));
}

/**
 * A real `<select>`, and the one native control in the anatomy: a format switch is
 * a four-item list with no styling worth a second machine. Its options are
 * rendered from `api.formats` unless the consumer brings their own.
 */
export function ColorPickerFormatSelect(props: PartProps<"select">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api } = ColorPickerContext.usePart("ColorPickerFormatSelect");

  return useRender({
    render,
    asChild,
    element: "select",
    props: api.getFormatSelectProps(),
    elementProps,
    children:
      children ??
      api.formats.map((format) => (
        <option key={format} value={format}>
          {format.toUpperCase()}
        </option>
      )),
  });
}

export const ColorPickerSwatchGroup: (props: PartProps<"div">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerSwatchGroup",
    element: "div",
    props: (context) => context.api.getSwatchGroupProps(),
  },
);

export interface ColorPickerSwatchRowProps extends PartProps<"div"> {
  readonly row: number;
}

export function ColorPickerSwatchRow(props: ColorPickerSwatchRowProps): ReactNode {
  const [own, rest] = splitProps(props, ["row"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api } = ColorPickerContext.usePart("ColorPickerSwatchRow");

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getSwatchRowProps({ row: own.row }),
    elementProps,
    children,
  });
}

export interface ColorPickerSwatchProps extends PartProps<"div"> {
  readonly index: number;
}

export function ColorPickerSwatch(props: ColorPickerSwatchProps): ReactNode {
  const [own, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const { api } = ColorPickerContext.usePart("ColorPickerSwatch");

  return (
    <SwatchContext.Provider value={own.index}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getSwatchProps({ index: own.index }),
        elementProps,
        children,
      })}
    </SwatchContext.Provider>
  );
}

export function ColorPickerSwatchIndicator(props: PartProps<"span">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api } = ColorPickerContext.usePart("ColorPickerSwatchIndicator");
  const index = SwatchContext.usePart("ColorPickerSwatchIndicator");

  return useRender({
    render,
    asChild,
    element: "span",
    props: api.getSwatchIndicatorProps({ index }),
    elementProps,
    children,
  });
}

/**
 * The "+" of the reference design, and it lives **outside** the grid: a `<button>` inside a
 * `gridcell` is `nested-interactive`, which the APG forbids and axe fails on.
 */
export const ColorPickerSwatchTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerSwatchTrigger",
    element: "button",
    props: (context) => context.api.getSwatchTriggerProps(),
  },
);

/**
 * The swatch grid and its "+", placed — `ColorPickerChannels`' twin, and it exists
 * for the same reason. `api.swatches` and `api.swatchRows` are runtime values
 * derived from an uncontrolled prop, and a composed layer may call no hook
 * (`scripts/composed-grammar.test.ts` refuses one), so the loop has to live in a
 * plural placer on this side of the line.
 *
 * Nothing at all when there are no swatches, which is the same rule `cancelLabel`
 * follows in the composed layer: the affordance is opt-in, and a consumer who
 * passes no `swatches` keeps the markup they have today rather than gaining an
 * empty grid and an add button for a list that does not exist.
 *
 * The trigger is a sibling of the group, never a cell of it — a `<button>` inside
 * a `gridcell` is `nested-interactive`, as its own docblock says above.
 */
export function ColorPickerSwatches(): ReactNode {
  const { api } = ColorPickerContext.usePart("ColorPickerSwatches");

  if (api.swatchRows === 0) return null;

  // The grid as data before it is elements, so the row's number is a field of the
  // thing rather than the position of it. That number *is* the row's identity — it
  // is also the `row` prop the part requires, since a row of a positional grid has
  // no other name — and it is what `getSwatchRowProps` reads to place it.
  const cells = api.swatches.map((value, index) => ({ value, index }));
  const rows = Array.from({ length: api.swatchRows }, (_, index) => ({
    row: index,
    cells: cells.filter((cell) => Math.floor(cell.index / api.swatchColumns) === index),
  }));

  return (
    <>
      <ColorPickerSwatchGroup>
        {rows.map((row) => (
          <ColorPickerSwatchRow key={row.row} row={row.row}>
            {row.cells.map((cell) => (
              <ColorPickerSwatch key={cell.value} index={cell.index}>
                <ColorPickerSwatchIndicator />
              </ColorPickerSwatch>
            ))}
          </ColorPickerSwatchRow>
        ))}
      </ColorPickerSwatchGroup>
      <ColorPickerSwatchTrigger />
    </>
  );
}

/**
 * `null` unless the root was handed the `eyedropper` module, and where the engine
 * has no `EyeDropper` — which is everywhere but Chromium. The machine answers
 * `false` until an effect has looked, so the button appears after hydration
 * rather than mismatching during it.
 */
export function ColorPickerEyedropperTrigger(props: PartProps<"button">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const { api } = ColorPickerContext.usePart("ColorPickerEyedropperTrigger");

  const element = useRender({
    render,
    asChild,
    element: "button",
    props: api.getEyedropperTriggerProps(),
    elementProps,
    children,
  });

  return api.eyedropperSupported ? element : null;
}

/** The chequerboard, 100% CSS — no image, no asset, nothing to load. */
export const ColorPickerTransparencyGrid: (props: PartProps<"div">) => ReactNode = createPart(
  ColorPickerContext,
  {
    name: "ColorPickerTransparencyGrid",
    element: "div",
    props: (context) => context.api.getTransparencyGridProps(),
  },
);
