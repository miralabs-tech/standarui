/**
 * The colour picker's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures.
 *
 * Every row pins `id`, and every row is `presentation="inline"` — the popup and
 * the sheet put their panel behind a portal, which renders `null` on the server,
 * so those rows would compare the trigger alone and say nothing about the panel
 * this layer exists to place. Inline is the presentation that renders the whole
 * tree in one pass, which makes it the only one worth comparing here.
 *
 * The parts side spells out what `ColorPickerChannels` renders rather than using
 * it: three flat parts per channel, in the order the sheet's two columns read.
 * `format="rgb"` is pinned for the same reason — the channel list follows the
 * format, so an uncontrolled default would make the row depend on a machine
 * decision instead of describing one.
 */

import { Fragment, type ReactNode } from "react";
import type { ParityCase } from "../../composed.harness";
import {
  ColorPickerArea,
  ColorPickerAreaBackground,
  ColorPickerAreaThumb,
  ColorPickerAreaXInput,
  ColorPickerAreaYInput,
  ColorPickerBackdrop,
  ColorPickerChannelInput,
  ColorPickerChannelLabel,
  ColorPickerChannelSlider,
  ColorPickerChannelSliderRange,
  ColorPickerChannelSliderThumb,
  ColorPickerChannelSliderTrack,
  ColorPickerCloseTrigger,
  ColorPickerContent,
  ColorPickerFormatSelect,
  ColorPickerHiddenInput,
  ColorPickerLabel,
  ColorPickerPortal,
  ColorPickerPositioner,
  ColorPickerRoot,
  ColorPickerTitle,
  ColorPickerTrigger,
  ColorPickerTriggerSwatch,
  ColorPickerValueText,
  useColorPickerContext,
} from "./color-picker";
import { ColorPicker } from "./composed";

/**
 * What the placer renders, written out — the half the table is here to compare.
 * Three flat parts per channel and no wrapper of any kind: the sheet's two
 * columns are what pair the slider with the field beside it.
 */
function Channels(): ReactNode {
  const api = useColorPickerContext();

  return api.channels.map((channel) => (
    <Fragment key={channel}>
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

export const parity: readonly ParityCase[] = [
  {
    name: "color-picker",
    composed: <ColorPicker id="accent" presentation="inline" format="rgb" defaultValue="#0088ff" />,
    parts: (
      <ColorPickerRoot id="accent" presentation="inline" format="rgb" defaultValue="#0088ff">
        <ColorPickerTrigger>
          <ColorPickerTriggerSwatch />
        </ColorPickerTrigger>
        <ColorPickerValueText />
        <ColorPickerHiddenInput />
        <ColorPickerPortal>
          <ColorPickerBackdrop />
          <ColorPickerPositioner>
            <ColorPickerContent>
              <ColorPickerCloseTrigger />
              <ColorPickerArea>
                <ColorPickerAreaBackground />
                <ColorPickerAreaThumb>
                  <ColorPickerAreaXInput />
                  <ColorPickerAreaYInput />
                </ColorPickerAreaThumb>
              </ColorPickerArea>
              <Channels />
              <ColorPickerFormatSelect />
            </ColorPickerContent>
          </ColorPickerPositioner>
        </ColorPickerPortal>
      </ColorPickerRoot>
    ),
  },
  /**
   * The layer's two conditionals, both on. `label` is consumed rather than
   * re-declared — it stays the machine prop that names the trigger — so the row
   * also proves the word reaches both the part and the name. `title` is the slot
   * that cost the root its native `title` attribute.
   */
  {
    name: "color-picker",
    composed: (
      <ColorPicker
        id="brand"
        presentation="inline"
        format="rgb"
        defaultValue="#34c759"
        label="Brand"
        title="Color"
      />
    ),
    parts: (
      <ColorPickerRoot
        id="brand"
        presentation="inline"
        format="rgb"
        defaultValue="#34c759"
        label="Brand"
      >
        <ColorPickerLabel>Brand</ColorPickerLabel>
        <ColorPickerTrigger>
          <ColorPickerTriggerSwatch />
        </ColorPickerTrigger>
        <ColorPickerValueText />
        <ColorPickerHiddenInput />
        <ColorPickerPortal>
          <ColorPickerBackdrop />
          <ColorPickerPositioner>
            <ColorPickerContent>
              <ColorPickerTitle>Color</ColorPickerTitle>
              <ColorPickerCloseTrigger />
              <ColorPickerArea>
                <ColorPickerAreaBackground />
                <ColorPickerAreaThumb>
                  <ColorPickerAreaXInput />
                  <ColorPickerAreaYInput />
                </ColorPickerAreaThumb>
              </ColorPickerArea>
              <Channels />
              <ColorPickerFormatSelect />
            </ColorPickerContent>
          </ColorPickerPositioner>
        </ColorPickerPortal>
      </ColorPickerRoot>
    ),
  },
];
