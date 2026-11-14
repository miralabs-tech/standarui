/**
 * The meter's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. The root's own DOM id and the label's are both derived from
 * the scope id (`meter.dom.ts`), so an unpinned row would compare two different
 * `useId` counters on the two things the two forms genuinely share.
 *
 * No row here writes `aria-labelledby`, and that is the machine rather than an
 * omission: `hasLabel` is seeded `false` and only an observer flips it, so before
 * any effect has run — which is all `renderToString` ever gives — the root has no
 * IDREF to dangle. It is also why the first row below can be named by an
 * `aria-label` of the consumer's own without a second name arriving underneath it.
 */

import type { ParityCase } from "../../composed.harness";
import { Meter } from "./composed";
import { MeterLabel, MeterRange, MeterRoot, MeterTrack } from "./meter";

export const parity: readonly ParityCase[] = [
  /**
   * No label part at all, named by the consumer's own `aria-label` on the root —
   * the commonest way a gauge ships, and the minimal tree: root, track, range.
   */
  {
    name: "meter",
    composed: <Meter id="battery" value={62} aria-label="Battery" />,
    parts: (
      <MeterRoot id="battery" value={62} aria-label="Battery">
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>
    ),
  },
  /**
   * The label part present, and the whole machine surface forwarded rather than
   * reinterpreted. This is the row that fails the day the layer computes a
   * percentage or a valence of its own: `--sui-meter-percent`, `data-valence` and
   * the `aria-valuetext` that carries the valence label all come out of the same
   * connect on both sides, from `min`/`max`/`low`/`high`/`optimum` and from
   * `locale`/`formatOptions`/`valenceLabels` reaching it untouched.
   */
  {
    name: "meter",
    composed: (
      <Meter
        id="disk"
        label="Disk"
        value={88}
        min={0}
        max={100}
        low={50}
        high={85}
        optimum={0}
        locale="en-GB"
        formatOptions={{ style: "percent", maximumFractionDigits: 0 }}
        valenceLabels={{
          optimum: "Plenty free",
          suboptimal: "Filling up",
          critical: "Almost full",
        }}
      />
    ),
    parts: (
      <MeterRoot
        id="disk"
        value={88}
        min={0}
        max={100}
        low={50}
        high={85}
        optimum={0}
        locale="en-GB"
        formatOptions={{ style: "percent", maximumFractionDigits: 0 }}
        valenceLabels={{
          optimum: "Plenty free",
          suboptimal: "Filling up",
          critical: "Almost full",
        }}
      >
        <MeterLabel>Disk</MeterLabel>
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>
    ),
  },
  /**
   * Vertical, which costs one prop and covers the one attribute this connect
   * stamps on **every** part rather than on the root alone: `data-orientation`
   * rides in `stateAttrs`, so a layer that dropped a part or placed one outside the
   * root would show up here as an attribute missing from a node.
   */
  {
    name: "meter",
    composed: <Meter id="signal" label="Signal" orientation="vertical" value={40} />,
    parts: (
      <MeterRoot id="signal" orientation="vertical" value={40}>
        <MeterLabel>Signal</MeterLabel>
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>
    ),
  },
  /**
   * The rule the other rows state and none of them exercises: `parts` is spread
   * **last** on every part the layer places, and all three entries reach one.
   *
   * The witness is `className` rather than the sharper flip `collapsible` and
   * `toggle-group` use, and the reason is worth writing down: this connect writes
   * no typed attribute at all on `label`, `track` or `range`. Everything it puts on
   * them is `data-part`, `data-orientation` and `data-valence` — plus the label's
   * derived `id` — and React's prop types carry no `data-${string}` index
   * signature, so a `parts` entry cannot even spell one. There is no
   * `aria-hidden="true"` to flip down here; the only part that has one is
   * `MeterValueText`, which this layer does not place.
   */
  {
    name: "meter",
    composed: (
      <Meter
        id="quota"
        label="Quota"
        value={12}
        parts={{
          label: { className: "caption" },
          track: { className: "groove" },
          range: { className: "fill" },
        }}
      />
    ),
    parts: (
      <MeterRoot id="quota" value={12}>
        <MeterLabel className="caption">Quota</MeterLabel>
        <MeterTrack className="groove">
          <MeterRange className="fill" />
        </MeterTrack>
      </MeterRoot>
    ),
  },
];
