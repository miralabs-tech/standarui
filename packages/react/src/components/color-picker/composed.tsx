/**
 * `<ColorPicker/>` — the swatch that opens the panel, and the panel: an area, one
 * row per channel, and the format switch under them.
 *
 * Thirty-two parts in the anatomy and fourteen keys in `parts`. All but one of the
 * rest are placed, and the ones that look conditional are not omissions: six parts
 * take themselves out according to the presentation or the environment — the
 * backdrop and the cancel button are the sheet's, the trigger and the ✕ leave an
 * inline panel that has nothing to open and nothing to close, the arrow is the
 * popup's, the eyedropper is Chromium's — so this layer poses them flat and the
 * parts decide. The positioner and the content run on presence.
 *
 * The one part deliberately left out is `ColorPickerTransparencyGrid`, and the
 * public page says why: it is a bare chequerboard for a colour preview a consumer
 * draws themselves, with no fixed place in the tree, and the trigger's own swatch
 * already paints one.
 *
 * `ColorPickerChannels` and `ColorPickerSwatches` are plural placers rather than
 * parts. Both loop over a runtime list, and a composed layer may call no hook.
 *
 * **Two things had to exist before this file could.** `api.channels` is computed
 * from the format the machine holds, which can come from an uncontrolled
 * `defaultFormat`, so a composed layer — which may call no hook — cannot loop over
 * it: `ColorPickerChannels` does the looping and renders three flat parts per
 * channel. And a composed layer may emit no `<div>` of layout, where the delivered
 * demo spent three; `_color-picker.scss` now pairs the title with its close button
 * and each slider with its numeric field, over two columns, so the parts below are
 * bare siblings.
 *
 * **`cancelLabel` decides whether the cancel button exists at all.**
 * `getCancelTriggerProps` writes no accessible name — unlike the close button and
 * the eyedropper, which the machine names — so the rule the spec states for that
 * case applies: the prop is absent, the part is not rendered. It is sheet-only
 * anyway, and it carries `tabIndex={-1}` because Escape is its keyboard double.
 *
 * `title` is a slot rather than a string for the same reason `label` is: neither
 * part has text of its own, and both are content.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  ColorPickerArea,
  ColorPickerAreaBackground,
  ColorPickerAreaThumb,
  ColorPickerAreaXInput,
  ColorPickerAreaYInput,
  ColorPickerArrow,
  ColorPickerBackdrop,
  ColorPickerCancelTrigger,
  ColorPickerChannels,
  ColorPickerCloseTrigger,
  ColorPickerContent,
  ColorPickerEyedropperTrigger,
  ColorPickerFormatSelect,
  ColorPickerHiddenInput,
  ColorPickerLabel,
  ColorPickerPortal,
  ColorPickerPositioner,
  ColorPickerRoot,
  ColorPickerSwatches,
  ColorPickerTitle,
  ColorPickerTrigger,
  ColorPickerTriggerSwatch,
  ColorPickerValueText,
  type UseColorPickerProps,
} from "./color-picker";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface ColorPickerParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly trigger?: PartProps<"button"> | undefined;
  readonly triggerSwatch?: PartProps<"span"> | undefined;
  readonly valueText?: PartProps<"span"> | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  readonly title?: PartProps<"h2"> | undefined;
  readonly closeTrigger?: PartProps<"button"> | undefined;
  readonly area?: PartProps<"div"> | undefined;
  readonly formatSelect?: PartProps<"select"> | undefined;
  readonly cancelTrigger?: PartProps<"button"> | undefined;
  readonly eyedropperTrigger?: PartProps<"button"> | undefined;
  readonly arrow?: PartProps<"div"> | undefined;
}

/**
 * `title` is omitted from the element props, which is `card`'s collision and its
 * resolution: `title` is a GLOBAL HTML attribute carried by `HTMLAttributes`, so
 * declaring it as a `ReactNode` on an interface that inherits element props is a
 * `TS2430` at the point of declaration. The consequence is real and worth knowing:
 * the composed form cannot set the native hover `title` attribute on its root —
 * the parts form can.
 */
export interface ColorPickerComposedProps
  extends UseColorPickerProps,
    Omit<PartProps<"div", UseColorPickerProps>, "children" | "title"> {
  /** The panel's heading. Omitted, no title part is placed. */
  readonly title?: ReactNode;
  /**
   * Names the sheet's cancel button, and placing it is what renders the part:
   * `getCancelTriggerProps` writes no name of its own, so an unnamed one would be
   * a control nothing announces.
   */
  readonly cancelLabel?: string | undefined;
  readonly parts?: ColorPickerParts | undefined;
}

export function ColorPicker(props: ColorPickerComposedProps): ReactNode {
  const { title, cancelLabel, parts, ...root } = props;

  return (
    <ColorPickerRoot {...root}>
      {/* `label` stays a machine prop and is consumed rather than re-declared: it
          is what names the trigger through the machine, and re-typing it as a
          `ReactNode` here would take that name away. The picker's own label part
          shows the same word. */}
      {root.label == null ? null : (
        <ColorPickerLabel {...parts?.label}>{root.label}</ColorPickerLabel>
      )}
      <ColorPickerTrigger {...parts?.trigger}>
        <ColorPickerTriggerSwatch {...parts?.triggerSwatch} />
      </ColorPickerTrigger>
      <ColorPickerValueText {...parts?.valueText} />
      <ColorPickerHiddenInput />
      <ColorPickerPortal>
        <ColorPickerBackdrop {...parts?.backdrop} />
        <ColorPickerPositioner {...parts?.positioner}>
          <ColorPickerContent {...parts?.content}>
            {title == null ? null : <ColorPickerTitle {...parts?.title}>{title}</ColorPickerTitle>}
            <ColorPickerCloseTrigger {...parts?.closeTrigger} />
            {/* The panel's toolbar row, where the public page's own tree puts it.
                The part is `null` without the `eyedropper` module, off Chromium and
                until an effect has looked, so it costs those consumers nothing but
                this line. */}
            <ColorPickerEyedropperTrigger {...parts?.eyedropperTrigger} />
            <ColorPickerArea {...parts?.area}>
              <ColorPickerAreaBackground />
              <ColorPickerAreaThumb>
                <ColorPickerAreaXInput />
                <ColorPickerAreaYInput />
              </ColorPickerAreaThumb>
            </ColorPickerArea>
            <ColorPickerChannels />
            <ColorPickerFormatSelect {...parts?.formatSelect} />
            {/* After the format switch, the order the public page's tree reads.
                The placer renders nothing at all without `swatches`, so a picker
                that asks for none keeps the markup it has. */}
            <ColorPickerSwatches />
            {cancelLabel === undefined ? null : (
              <ColorPickerCancelTrigger aria-label={cancelLabel} {...parts?.cancelTrigger} />
            )}
          </ColorPickerContent>
          {/* A sibling of the content, as the popover's arrow is and for the same
              reason: the panel is glass, `contain: paint` would clip the spur away,
              and the position effect writes its offsets against the positioner. */}
          <ColorPickerArrow {...parts?.arrow} />
        </ColorPickerPositioner>
      </ColorPickerPortal>
    </ColorPickerRoot>
  );
}
