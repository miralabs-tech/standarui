/**
 * The progress rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`, which for this component is the scope id the root, the
 * label and the value text all derive their DOM ids from — an unpinned row would
 * compare two different `useId` counters on the one attribute the two forms
 * genuinely share.
 *
 * No row reaches `aria-labelledby`, and that is a property of the renderer rather
 * than of the fixtures: the flag behind it is set by the `trackParts` effect, and
 * `renderToString` runs no effect. What a labelled row proves here is the label
 * part's own markup and its position; what names the bar in a browser is asserted
 * in this component's browser suite.
 */

import type { ParityCase } from "../../composed.harness";
import { Progress } from "./composed";
import {
  ProgressCircle,
  ProgressCircleRange,
  ProgressCircleTrack,
  ProgressLabel,
  ProgressRange,
  ProgressRoot,
  ProgressTrack,
} from "./progress";

export const parity: readonly ParityCase[] = [
  /** The minimal bar: a caption, a track, a range, and the percentage on the root. */
  {
    name: "progress",
    composed: <Progress id="upload" label="Uploading" value={35} />,
    parts: (
      <ProgressRoot id="upload" value={35}>
        <ProgressLabel>Uploading</ProgressLabel>
        <ProgressTrack>
          <ProgressRange />
        </ProgressTrack>
      </ProgressRoot>
    ),
  },
  /**
   * The bar with no caption at all, which is the shape `label` being optional
   * exists for — the name arrives as `aria-label` on the root, forwarded whole,
   * and the label part is genuinely absent rather than rendered empty.
   *
   * It is also the only row that reaches the indeterminate branch: `value={null}`
   * drops `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-valuetext`
   * instead of reporting zero, and writes `data-indeterminate` on the root and on
   * the range. A bar at 0 % says the work started and found nothing done; this
   * one says nobody knows how much work there is.
   */
  {
    name: "progress",
    composed: <Progress id="sync" value={null} aria-label="Syncing" />,
    parts: (
      <ProgressRoot id="sync" value={null} aria-label="Syncing">
        <ProgressTrack>
          <ProgressRange />
        </ProgressTrack>
      </ProgressRoot>
    ),
  },
  /**
   * The other subtree, and the only row that reaches the `svg` and `circle`
   * normalizers at all — the viewBox, `focusable`, the `cx`/`cy`/`r` triple and
   * the dash pair the core computes from the percentage.
   *
   * `orientation` rides along on purpose. It is a machine prop under either
   * shape, so `data-orientation="vertical"` is stamped here on the root, the
   * label, the circle and the circle's range — not on the circle's track, which
   * is the one part `connect` gives no state attributes at all. Nothing in
   * `_progress.scss` selects on it outside the linear pair, so the ring renders
   * identically. The row is what keeps that claim honest: inert, and still
   * forwarded.
   */
  {
    name: "progress",
    composed: <Progress id="render" label="Rendering" circular value={70} orientation="vertical" />,
    parts: (
      <ProgressRoot id="render" value={70} orientation="vertical">
        <ProgressLabel>Rendering</ProgressLabel>
        <ProgressCircle>
          <ProgressCircleTrack />
          <ProgressCircleRange />
        </ProgressCircle>
      </ProgressRoot>
    ),
  },
  /**
   * The end of the range. `value` at `max` is `data-state="complete"` rather than
   * a bar that merely happens to be full, and `connect` writes that state on the
   * label, the track and the range as well as on the root — all four elements
   * here carry it, and only a row that reaches the top of the range says so.
   */
  {
    name: "progress",
    composed: <Progress id="import" label="Imported" value={100} />,
    parts: (
      <ProgressRoot id="import" value={100}>
        <ProgressLabel>Imported</ProgressLabel>
        <ProgressTrack>
          <ProgressRange />
        </ProgressTrack>
      </ProgressRoot>
    ),
  },
  /**
   * The rule none of the rows above exercises: `parts` is applied **last**, so a
   * consumer's entry wins over what the machine itself wrote. Both witnesses are
   * values the layer never chooses and the machine always does — `getCircleProps`
   * writes `aria-hidden="true"` on the ring, flipped here, and
   * `getCircleRangeProps` writes `strokeLinecap="round"`, squared off here.
   *
   * The second one is not decoration. React's element types carry no
   * `data-${string}` index signature, so a `parts` entry cannot spell
   * `data-state` and an aria attribute would be the only witness available — one
   * typed non-aria attribute proves the merge reaches the whole prop bag rather
   * than the accessibility half of it.
   */
  {
    name: "progress",
    composed: (
      <Progress
        id="battery"
        label="Battery"
        circular
        value={40}
        parts={{
          label: { className: "caption" },
          circle: { "aria-hidden": "false" },
          circleTrack: { className: "ring" },
          circleRange: { strokeLinecap: "butt" },
        }}
      />
    ),
    parts: (
      <ProgressRoot id="battery" value={40}>
        <ProgressLabel className="caption">Battery</ProgressLabel>
        <ProgressCircle aria-hidden="false">
          <ProgressCircleTrack className="ring" />
          <ProgressCircleRange strokeLinecap="butt" />
        </ProgressCircle>
      </ProgressRoot>
    ),
  },
];
