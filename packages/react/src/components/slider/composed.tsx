/**
 * `<Slider>` — the bare name beside the parts, and the first composed layer over
 * a control whose display is *derived* rather than handed in.
 *
 * Three things a consumer got wrong by hand, and the reason this layer exists:
 *
 * The **thumb count** is read from the value, never asked for. `defaultValue={[20, 80]}`
 * with one `SliderThumb` is a two-value machine wearing a one-handle control: the
 * second value moves and nothing on screen says so. `toValueArray` is the core's
 * own normaliser — the same one the machine initialises with — so the two cannot
 * disagree about how many handles a value implies.
 *
 * **Ticks follow `marks`.** Setting `marks` and rendering no `SliderMarkerGroup`
 * is the slider's version of `loading` without `ButtonLoadingIndicator`: the
 * machine resolves the list, and nothing draws it. Here the group comes with the
 * prop and renders itself.
 *
 * And the **label and the value sit directly under the root**, which is what
 * `_slider.scss` has always drawn: the root is `grid-template-columns: 1fr auto`,
 * `slider:label` starts at column 1 and `slider:value-text` at column 2
 * (`_slider.scss:22-23`, `:48`, `:59`). The story wraps the pair in a flex `<div>`
 * and so spends both columns on one cell — a layout node is exactly what a
 * composed layer may not render, and here the rule and the sheet agree.
 */

import { toValueArray } from "@standarui/core/slider";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  SliderControl,
  SliderHiddenInput,
  type SliderHiddenInputProps,
  SliderLabel,
  SliderMarkerGroup,
  SliderRange,
  SliderRoot,
  SliderThumb,
  type SliderThumbProps,
  SliderTrack,
  SliderValueText,
  type UseSliderProps,
} from "./slider";

/**
 * The escape hatch, one entry per part. `thumb` and `hiddenInput` drop `index`:
 * it is the composed layer's to assign — one per value — and a fixed one repeated
 * across handles would hand every thumb the same value.
 */
export interface SliderParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly valueText?: PartProps<"span"> | undefined;
  readonly control?: PartProps<"div"> | undefined;
  readonly track?: PartProps<"div"> | undefined;
  readonly range?: PartProps<"div"> | undefined;
  readonly markerGroup?: PartProps<"div"> | undefined;
  readonly thumb?: Omit<SliderThumbProps, "index"> | undefined;
  readonly hiddenInput?: Omit<SliderHiddenInputProps, "index"> | undefined;
}

export interface SliderComposedProps
  extends UseSliderProps,
    Omit<PartProps<"div", UseSliderProps>, "children"> {
  /** Rendered as `SliderLabel`. Omitted, no label part exists and none is named. */
  readonly label?: ReactNode;
  /**
   * The formatted value, in the second grid column. On by default because the
   * column is reserved whether or not anything fills it, and because the machine
   * has already done the formatting — `locale`, `formatOptions` and `getValueText`
   * all land in it without the consumer touching the string.
   */
  readonly showValue?: boolean | undefined;
  /**
   * Defaults to `true` as soon as `marks` is set, which is the only reading that
   * makes the two props agree. Pass `false` to keep the scale and hide the ticks.
   */
  readonly ticks?: boolean | undefined;
  readonly parts?: SliderParts | undefined;
}

export function Slider(props: SliderComposedProps): ReactNode {
  const { label, showValue = true, ticks, parts, ...rest } = props;
  // The index is the identity here: a thumb has no key of its own, and its
  // position in the value array is what the machine addresses it by.
  const thumbs = toValueArray(rest.value ?? rest.defaultValue).map((_unused, index) => index);
  const showTicks = ticks ?? rest.marks !== undefined;

  return (
    <SliderRoot {...rest}>
      {label === undefined ? null : <SliderLabel {...parts?.label}>{label}</SliderLabel>}
      {showValue ? <SliderValueText {...parts?.valueText} /> : null}
      <SliderControl {...parts?.control}>
        <SliderTrack {...parts?.track}>
          <SliderRange {...parts?.range} />
        </SliderTrack>
        {thumbs.map((index) => (
          <SliderThumb key={index} {...parts?.thumb} index={index} />
        ))}
        {showTicks ? <SliderMarkerGroup {...parts?.markerGroup} /> : null}
      </SliderControl>
      {thumbs.map((index) => (
        <SliderHiddenInput key={index} {...parts?.hiddenInput} index={index} />
      ))}
    </SliderRoot>
  );
}
