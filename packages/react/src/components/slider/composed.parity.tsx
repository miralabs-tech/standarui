/**
 * The slider's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * `id` is pinned on every row because the label, the control and each hidden
 * input derive their ids from the root's — un-pinned, `useId()` mints a different
 * one per render and the two forms could never compare equal.
 */

import type { ParityCase } from "../../composed.harness";
import { Slider } from "./composed";
import {
  SliderControl,
  SliderHiddenInput,
  SliderLabel,
  SliderMarkerGroup,
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  SliderValueText,
} from "./slider";

export const parity: readonly ParityCase[] = [
  {
    // The minimal form: no label, no marks, one thumb inferred from nothing at
    // all — `toValueArray(undefined)` is `[0]`, so a slider with no value still
    // has exactly one handle.
    name: "slider",
    composed: <Slider id="volume" />,
    parts: (
      <SliderRoot id="volume">
        <SliderValueText />
        <SliderControl>
          <SliderTrack>
            <SliderRange />
          </SliderTrack>
          <SliderThumb index={0} />
        </SliderControl>
        <SliderHiddenInput index={0} />
      </SliderRoot>
    ),
  },
  {
    // Everything the layer derives, in one row: the label part appears because a
    // label was given, the marker group because `marks` was, and the value text
    // prints what the machine formatted rather than what a consumer joined.
    name: "slider",
    composed: (
      <Slider
        id="price"
        label="Price"
        defaultValue={40}
        max={200}
        marks={[0, 100, 200]}
        formatOptions={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }}
      />
    ),
    parts: (
      <SliderRoot
        id="price"
        defaultValue={40}
        max={200}
        marks={[0, 100, 200]}
        formatOptions={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }}
      >
        <SliderLabel>Price</SliderLabel>
        <SliderValueText />
        <SliderControl>
          <SliderTrack>
            <SliderRange />
          </SliderTrack>
          <SliderThumb index={0} />
          <SliderMarkerGroup />
        </SliderControl>
        <SliderHiddenInput index={0} />
      </SliderRoot>
    ),
  },
  {
    // Two values, so two thumbs and two hidden inputs — the count is read, never
    // asked for. The row that would have caught a one-handle control wearing a
    // two-value machine.
    name: "slider",
    composed: <Slider id="range" label="Range" defaultValue={[20, 80]} showValue={false} />,
    parts: (
      <SliderRoot id="range" defaultValue={[20, 80]}>
        <SliderLabel>Range</SliderLabel>
        <SliderControl>
          <SliderTrack>
            <SliderRange />
          </SliderTrack>
          <SliderThumb index={0} />
          <SliderThumb index={1} />
        </SliderControl>
        <SliderHiddenInput index={0} />
        <SliderHiddenInput index={1} />
      </SliderRoot>
    ),
  },
  {
    // `parts` wins over the layer's own defaults, on two collisions at once: a
    // `ticks: false` that keeps the marks but drops the group, and a `parts.thumb`
    // that reaches a part the composed form never names directly.
    name: "slider",
    composed: (
      <Slider
        id="muted"
        label="Muted"
        defaultValue={10}
        marks={[0, 50, 100]}
        ticks={false}
        parts={{ thumb: { className: "grabbable" }, label: { className: "quiet" } }}
      />
    ),
    parts: (
      <SliderRoot id="muted" defaultValue={10} marks={[0, 50, 100]}>
        <SliderLabel className="quiet">Muted</SliderLabel>
        <SliderValueText />
        <SliderControl>
          <SliderTrack>
            <SliderRange />
          </SliderTrack>
          <SliderThumb index={0} className="grabbable" />
        </SliderControl>
        <SliderHiddenInput index={0} />
      </SliderRoot>
    ),
  },
];
