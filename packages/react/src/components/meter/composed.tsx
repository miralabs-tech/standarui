/**
 * `<Meter label="Battery" value={62}/>` — four nodes over a gauge that *measures*
 * rather than reports work: a root, an optional label, and the track wrapping the
 * range that fills it.
 *
 * **The track and the range are one node, not two decisions.** `_meter.scss` gives
 * `meter:track` the groove — the density thickness, the radius, `overflow: hidden`
 * — and sizes `meter:range` from `--sui-meter-percent`, a custom property
 * `getRootProps` writes on the root. A track rendered without its range is an empty
 * groove that never fills, which is why neither of them is behind a prop here.
 *
 * **`label` is optional, and that is an accessibility fact rather than a taste.**
 * `role="meter"` requires an accessible name — a bare one is an axe violation
 * (`meter.types.ts`) — but the label part is only one of the two ways to give it
 * one. `getRootProps` writes `aria-labelledby` **only** once `hasLabel` has found a
 * `meter:label` in the DOM (`meter.dom.ts`), so a gauge shipped with no label part
 * keeps whatever other name it has: an `aria-label` on the root, a `Field`'s own
 * caption. That is the commonest way a meter ships, and it is why `label` is
 * optional here where `collapsible` makes it required — a nameless disclosure
 * trigger has no second door.
 *
 * The slot is **omitted, never mounted empty**: `hasLabel` finds the part by its
 * `data-part` and not by whether it has text, so a label part rendered with no
 * children would make the root claim an `aria-labelledby` pointing at nothing to
 * read — and stop the consumer's own `aria-label` from winning. Same reading, and
 * the same one line, as `checkbox-group`.
 *
 * **No `showValue`, and this layer places no `MeterValueText`.** The formatted
 * number already reaches assistive technology through the root's `aria-valuetext`,
 * so `getValueTextProps` writes `aria-hidden` and the part carries no default text
 * of its own — it renders exactly the children it is given. A composed prop that
 * placed it would place an empty box, so the part stays where it is and a consumer
 * who wants the number on screen reaches for it directly. `<Progress>` makes the
 * same call for the same reason.
 *
 * **What separates this from `<Progress>`, which reads identically otherwise:** a
 * meter is a static measurement and a progress bar is a task in flight. A progress
 * value can be genuinely unknown — `value: null` is indeterminate and drops
 * `aria-valuenow` — while a meter always reads something, so there is no state to
 * model, no `data-state` on any part, and no circular presentation. What a meter
 * has instead is *valence*: `low`, `high` and `optimum` grade the value the way the
 * HTML `meter` element does, and `data-valence` recolours the range from it. None
 * of that is a slot. The grading is the machine's, the words that carry it to a
 * screen reader come from `valenceLabels`, and everything travels in `...root`
 * untouched — this layer computes no percentage and no valence of its own.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { MeterLabel, MeterRange, MeterRoot, MeterTrack, type UseMeterProps } from "./meter";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it. No `Omit` of `id` here, unlike
 * the collections: each of these three parts is placed once, so a fixed id is a
 * fixed id and not the same one repeated down a list.
 *
 * `valueText` is deliberately absent — this layer does not place that part.
 */
export interface MeterParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly track?: PartProps<"div"> | undefined;
  readonly range?: PartProps<"div"> | undefined;
}

export interface MeterComposedProps
  extends UseMeterProps,
    Omit<PartProps<"div", UseMeterProps>, "children"> {
  /** Rendered as `MeterLabel`. Left out, no label part exists and none is named. */
  readonly label?: ReactNode;
  readonly parts?: MeterParts | undefined;
}

export function Meter(props: MeterComposedProps): ReactNode {
  const { label, parts, ...root } = props;

  return (
    <MeterRoot {...root}>
      {label == null ? null : <MeterLabel {...parts?.label}>{label}</MeterLabel>}
      <MeterTrack {...parts?.track}>
        <MeterRange {...parts?.range} />
      </MeterTrack>
    </MeterRoot>
  );
}
