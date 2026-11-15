/**
 * `<Progress value={35} label="Uploading"/>` — a root, an optional caption, and
 * one of the two presentations the same machine drives. Three or four nodes, and
 * the whole of the decision a consumer otherwise makes by hand: whether this is a
 * bar or a ring, and in which order the two boxes sit.
 *
 * **`label` is optional, and it is the one component in this wave where that is a
 * real choice rather than an oversight.** `getRootProps` writes `aria-labelledby`
 * only once `context.hasLabel` is true, and that flag is set by an observer that
 * has actually seen a `progress:label` element under the root
 * (`progress.dom.ts:28`, the `trackParts` effect). So a bar with no label part
 * declares no name at all — which is exactly what lets the consumer name it from
 * outside, with `aria-label` on the root or an `aria-labelledby` of their own,
 * both of which this layer forwards untouched. Pass one or the other: the part
 * wins over `aria-label` in the name computation, so passing both is a caption
 * that silently outranks the string beside it.
 *
 * **An empty `label` is treated as no label.** Case (c) of the wave's guard, and
 * it costs twice here: `progress:root` is a grid with a gap, so an empty caption
 * is a visible empty row above the bar — and the observer above counts the
 * element, not its text, so the root would then point `aria-labelledby` at a span
 * with nothing in it. `label={busy && "Uploading"}` is the shape that reaches
 * both, since React renders `false` as nothing and the type admits it.
 *
 * **`circular` is the presentation switch, and the name is the third one tried.**
 * Not `presentation`: that word is a *machine* prop everywhere it appears in this
 * library — `MenuMachineProps`, `DialogMachineProps`, `SelectMachineProps`,
 * `PopoverMachineProps`, `DatePickerMachineProps`, `ColorPickerMachineProps` all
 * declare it — and progress's machine has no such field, so a composed-only
 * `presentation` would be the first one in the library that is not forwarded to a
 * machine at all. Not `shape` either: that name is taken, by `InputShape` and
 * `SearchFieldShape`, for a rounding of corners rather than a choice of tree.
 * What is left is the boolean that mirrors `multiline` on `<Input>` — one flag,
 * two subtrees, everything else identical.
 *
 * **`orientation` reaches the machine under either shape, and nothing reads it
 * under the ring.** The connect layer stamps `data-orientation` on the root, the
 * circle and the circle's range regardless; `_progress.scss` only ever selects on
 * it under `progress:track` and `progress:range`. It stays a plain prop rather
 * than a discriminated union: the attribute is inert, not wrong, and a union
 * would make `<Progress circular orientation="vertical"/>` a compile error over a
 * combination that renders correctly.
 *
 * **No `showValue`, and no `ProgressValueText` anywhere below.** Not a slot that
 * was cut for room — this module calls no hook, so it never holds an api and
 * cannot read `valueAsText` off one. A useful flag would need the part to fill
 * itself from the context, which changes what a shipped part renders. The caption
 * is a parts-form affair in v1: place `ProgressValueText` yourself, next to
 * `ProgressLabel`, and give it the string you want on screen.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  ProgressCircle,
  ProgressCircleRange,
  ProgressCircleTrack,
  ProgressLabel,
  ProgressRange,
  ProgressRoot,
  ProgressTrack,
  type UseProgressProps,
} from "./progress";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it. No `Omit` of `id` here, unlike
 * the collections: every part below is placed once, so a fixed id is a fixed id
 * rather than the same one repeated down a list. The one worth knowing about is
 * `label` — its id is what the root's `aria-labelledby` resolves, so an `id`
 * passed through this entry renames the target of that reference.
 *
 * Six keys for seven parts: `valueText` is absent because the layer never places
 * it, and an entry for a part nobody renders is a prop that does nothing.
 */
export interface ProgressParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly track?: PartProps<"div"> | undefined;
  readonly range?: PartProps<"div"> | undefined;
  readonly circle?: PartProps<"svg"> | undefined;
  readonly circleTrack?: PartProps<"circle"> | undefined;
  readonly circleRange?: PartProps<"circle"> | undefined;
}

export interface ProgressComposedProps
  extends UseProgressProps,
    Omit<PartProps<"div", UseProgressProps>, "children"> {
  /**
   * The caption above the bar. Left out, the component declares no accessible
   * name and expects one from the root — see the note above on which of the two
   * wins when both are given.
   */
  readonly label?: ReactNode;
  /**
   * Renders `ProgressCircle > ProgressCircleTrack + ProgressCircleRange` in place
   * of `ProgressTrack > ProgressRange`. The ring is an SVG on a fixed 100 × 100
   * viewBox with a radius of 42, sized by whatever `inline-size` the sheet gives
   * it, so the flag changes the tree and never the value.
   */
  readonly circular?: boolean | undefined;
  readonly parts?: ProgressParts | undefined;
}

export function Progress(props: ProgressComposedProps): ReactNode {
  const { label, circular, parts, ...root } = props;

  return (
    <ProgressRoot {...root}>
      {label == null || label === false || label === "" ? null : (
        <ProgressLabel {...parts?.label}>{label}</ProgressLabel>
      )}
      {circular === true ? (
        <ProgressCircle {...parts?.circle}>
          <ProgressCircleTrack {...parts?.circleTrack} />
          <ProgressCircleRange {...parts?.circleRange} />
        </ProgressCircle>
      ) : (
        <ProgressTrack {...parts?.track}>
          <ProgressRange {...parts?.range} />
        </ProgressTrack>
      )}
    </ProgressRoot>
  );
}
