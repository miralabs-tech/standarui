/**
 * `<Clipboard copyLabel="…"/>` — the field, the button beside it, and the pair of
 * glyphs that says whether the value has been taken.
 *
 * Six parts in the anatomy and five keys in `parts`; `root` is not one, for the
 * reason it never is — the root's props *are* this component's props.
 *
 * **`copyLabel` is required here and optional everywhere else, and that is the
 * exigence this layer exists to enforce.** `clipboard.connect.ts:113` writes
 * `aria-label: prop("copyLabel")` and the machine defaults it to nothing, so the
 * name is whatever the consumer passed. In the parts form that is survivable: a
 * consumer who puts the word "Copy" inside the button has named it the ordinary
 * way. This layer cannot — it fills the trigger with the indicator pair and
 * nothing else, and both indicators are `aria-hidden="true"`
 * (`clipboard.connect.ts:137`). So the composed trigger is *always* the icon-only
 * shape `clipboard.types.ts:29` calls out, and skipping the label ships a button
 * a screen reader announces as "button". `input`'s `revealLabel` is the
 * precedent; the difference is that there is no branch to make it conditional on,
 * so it is required outright rather than through a union.
 *
 * The `warn` beside it is for what the type cannot catch: `copyLabel=""` is a
 * `string` and satisfies the signature while naming nothing, and a plain-JS
 * caller has no type checker in the loop at all. `dialog`'s `closeLabel` reads
 * the empty string the same way — the difference is what follows from it. There
 * the part is dropped, because a dialog without a ✕ is still a dialog; here the
 * trigger is the component, so an unnamed one is reported and still rendered.
 *
 * The input is always placed, `date-field`'s reading: a clipboard without the
 * field is the icon-only shape the second story renders, and that is a parts-form
 * shape, the same way a `<Select>` without a portal is. It is also what
 * `ClipboardLabel` needs in order to mean anything — its `for` names the input's
 * id, and a `for` with no target names nothing — so `label` and the input cannot
 * be decided separately.
 *
 * Neither glyph is passed in. Both are drawn by `_clipboard.scss` under `:empty`
 * — the resting `doc.on.doc` and the checkmark — which is what makes this layer
 * renderable at all: before that sheet learned to draw them, `<Clipboard/>` was a
 * named button with two holes in it.
 */

import { isDev, warn } from "@standarui/core";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  ClipboardControl,
  ClipboardIndicator,
  type ClipboardIndicatorProps,
  ClipboardInput,
  ClipboardLabel,
  ClipboardRoot,
  ClipboardTrigger,
  type UseClipboardProps,
} from "./clipboard";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface ClipboardParts {
  readonly label?: PartProps<"label"> | undefined;
  readonly control?: PartProps<"div"> | undefined;
  readonly input?: PartProps<"input"> | undefined;
  readonly trigger?: PartProps<"button"> | undefined;
  /**
   * Applied to BOTH glyphs, hence no `copied` — it identifies which of the two
   * this element is — and no `id`: the connect deliberately emits none, "this
   * part renders twice, and a duplicated id is invalid DOM"
   * (`clipboard.connect.ts:136`), so a consumer's own id would be that same
   * defect arriving from the outside. `ref` goes for the same reason as
   * pagination's cells: a single ref held by two elements holds the second.
   */
  readonly indicator?: Omit<ClipboardIndicatorProps, "copied" | "id" | "ref"> | undefined;
}

export interface ClipboardComposedProps
  extends Omit<UseClipboardProps, "copyLabel">,
    Omit<PartProps<"div", UseClipboardProps>, "children"> {
  /**
   * Names the trigger, and it is required: see the header. Content, never a
   * glyph — the sheet draws those.
   */
  readonly copyLabel: string;
  /** The field's visible label. Omitted, no label part is placed. */
  readonly label?: ReactNode;
  readonly parts?: ClipboardParts | undefined;
}

export function Clipboard(props: ClipboardComposedProps): ReactNode {
  const { label, parts, ...root } = props;

  // The half the signature cannot state: an empty string is a `string`, and a
  // caller with no type checker never met the signature at all.
  warn(
    isDev() && (root.copyLabel === undefined || root.copyLabel === ""),
    'Clipboard: `copyLabel` names the copy button and is required — the composed form fills it with two `aria-hidden` glyphs, so nothing else can name it. Pass the word, or the trigger ships as a button called "button".',
  );

  return (
    <ClipboardRoot {...root}>
      {label == null ? null : <ClipboardLabel {...parts?.label}>{label}</ClipboardLabel>}
      <ClipboardControl {...parts?.control}>
        <ClipboardInput {...parts?.input} />
        <ClipboardTrigger {...parts?.trigger}>
          <ClipboardIndicator {...parts?.indicator} />
          <ClipboardIndicator copied {...parts?.indicator} />
        </ClipboardTrigger>
      </ClipboardControl>
    </ClipboardRoot>
  );
}
