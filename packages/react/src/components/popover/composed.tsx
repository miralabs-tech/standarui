/**
 * `<Popover title="…">…</Popover>` — the dialog's shape with an anchor and an
 * arrow, and the bare name is not `PopoverRoot` for the dialog's reason:
 * `popover.anatomy.ts` has no `root` part, so `<PopoverRoot>` is a context and
 * `<Popover>` is the trigger, the scrim, the positioner, the surface, everything
 * on it, and the arrow that points back at whatever opened it.
 *
 * It is a placement and nothing else — no state, no memo, no prop getter rewritten.
 * `dialog/composed.tsx` is the direct ancestor and most of this file is that file
 * with the names changed. Where it deliberately is not:
 *
 *  - **`title` is optional here, and that is the divergence that matters.**
 *    `popover.connect.ts` names the surface from the title part once the machine
 *    has read one out of the DOM, and from the `label` machine prop when it has
 *    not — never both, one name. The dialog places its title unconditionally,
 *    which is what makes `DialogMachineProps.label` unreachable for anyone who
 *    writes `<Dialog>`. Requiring `title` here would do the same to
 *    `PopoverMachineProps.label` while leaving it in the published type: a prop
 *    that documents itself as the name used when no title part is rendered, on a
 *    form that would never leave one unrendered. So the part is placed only when
 *    there are words for it, and a popover with none is named by `label`.
 *  - **`trigger` is optional too**, where `tooltip`'s is not. A popover has an
 *    anchor part of its own and an `open` prop on the root, so a surface with no
 *    control that opens it is a real shape rather than an oversight — a caret
 *    menu, a surface driven from a store. Left out, no trigger part is placed at
 *    all. Given, it is handed to `PopoverTrigger` as `render` and never as its
 *    children: the part *is* a `<button>`, and a button inside a button is
 *    `nested-interactive`.
 *  - **There is no `anchor` slot, and there cannot be one.** `PopoverAnchor` is by
 *    definition an element somewhere else in the consumer's own tree — what the
 *    surface measures against when that is not the trigger — and a composed layer
 *    places one contiguous subtree. No name in the closed vocabulary fits a node
 *    whose position the layer does not own. Pointing at something that is not an
 *    element at all — a caret, a range, a point — is `getAnchorRect`, a plain
 *    machine prop this interface forwards free through its `extends`; anything
 *    else is the parts form. `PopoverParts` carries no `anchor` key for the same
 *    reason: a key aimed at a part nobody renders is a silent no-op.
 *  - **There is no `actions` row.** `ComposedAction` exists for a question with
 *    answers, and the equal-width row is drawn by `dialog:actions`; a popover is a
 *    surface rather than a question, and `_popover.scss` has no rule for that row.
 *    Buttons inside a popover are `children`, like everything else on it.
 *
 * Two facts inherited unchanged, because the two machines write the same parts:
 *
 * **`closeLabel` is a name, not a slot.** `getCloseTriggerProps` emits an id, a
 * type, a state and a click handler and no accessible name at all — so the part is
 * rendered only once the consumer has named it, and rendered *empty*, carrying
 * `aria-label`, for `_popover.scss` to draw the ✕ under `:empty`. A consumer who
 * wants their own glyph reaches it through `parts.closeTrigger`, and the `:empty`
 * guard steps aside on its own. The empty string counts as absent rather than as a
 * name: `closeLabel=""` would paint a cross carrying `aria-label=""`, a button with
 * no name at all, which is the one outcome withholding the part exists to prevent.
 *
 * **The arrow is placed unconditionally, and it is the one node here that is placed
 * and may render nothing.** `getArrowProps` writes `aria-hidden`, so it costs a
 * reader nothing, and `PopoverArrow` returns `null` by itself once the presentation
 * resolves to `sheet` — a sheet has no anchor to point at. That decision stays in
 * the part, beside the machine's computed `presentation`; the layer never asks
 * which presentation it is in, which is what lets one call site work at both
 * densities.
 */

import type { ReactNode } from "react";
import type { ComposedTrigger } from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  PopoverArrow,
  PopoverBackdrop,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverDescription,
  PopoverPortal,
  type PopoverPortalProps,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
  type UsePopoverProps,
} from "./popover";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 *
 * Nine keys for ten parts. `portal` is no part at all but the React container the
 * parts form wraps the surface in; `anchor` is missing because this layer places
 * no anchor (see the header), and `arrow-tip` because `PopoverArrow` draws its own
 * silhouette and exports no component to aim a key at. No `Omit` of `id` or of the
 * IDREFs anywhere here, unlike the collections: every one of these parts is placed
 * once, so a fixed id is a fixed id and not the same one repeated down a list.
 */
export interface PopoverParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly portal?: PopoverPortalProps | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  readonly title?: PartProps<"h2"> | undefined;
  readonly description?: PartProps<"p"> | undefined;
  readonly closeTrigger?: PartProps<"button"> | undefined;
  readonly arrow?: PartProps<"div"> | undefined;
}

export interface PopoverComposedProps extends UsePopoverProps {
  /**
   * Handed to `PopoverTrigger` as `render` — never as its children. Optional, and
   * the header says why: a popover driven from a store, or anchored at something
   * that never opened it, has none.
   */
  readonly trigger?: ComposedTrigger | undefined;
  /**
   * The surface's visible heading, and its accessible name once the machine has
   * read the part. Optional: left out, no title part is placed and the machine
   * names the surface from `label` instead — the two are exclusive, and this is
   * the form that keeps `label` reachable.
   *
   * `null` and `false` are excluded because `ReactNode` admits them and
   * `title={cond && "…"}` would otherwise place an *empty* `h2` — which is worse
   * than no title: the machine reads the part, flips `hasTitle`, and points
   * `aria-labelledby` at an element with nothing in it, so the surface loses the
   * `label` it would otherwise have been named by. The empty string cannot be
   * excluded by a type (`Exclude<string, "">` is still `string`) and is treated as
   * absent at the placement below instead.
   */
  readonly title?: Exclude<ReactNode, null | boolean>;
  /** Wired to `aria-describedby` by the machine, once it has read the part. */
  readonly description?: ReactNode;
  /** The body of the surface: the form, the list, the row of buttons. */
  readonly children?: ReactNode;
  /**
   * Names the close button, and the part is placed only when it is given — see the
   * header. Rendered empty, so the sheet paints the ✕.
   */
  readonly closeLabel?: string | undefined;
  readonly container?: PortalProps["container"] | undefined;
  /**
   * Re-declared rather than inherited: the mount is the adapter's, not the
   * machine's, so it lives on `PopoverRootProps` and not on `PopoverMachineProps`.
   * Forwarded through the rest, the way `select` and `menu` forward theirs.
   */
  readonly keepMounted?: boolean | undefined;
  readonly parts?: PopoverParts | undefined;
}

export function Popover(props: PopoverComposedProps): ReactNode {
  const { trigger, title, description, children, closeLabel, container, parts, ...root } = props;

  return (
    <PopoverRoot {...root}>
      {trigger === undefined ? null : <PopoverTrigger render={trigger} {...parts?.trigger} />}
      <PopoverPortal container={container} {...parts?.portal}>
        <PopoverBackdrop {...parts?.backdrop} />
        <PopoverPositioner {...parts?.positioner}>
          <PopoverContent {...parts?.content}>
            {/* First, and that is the whole of the placement: `_popover.scss` gives
                this button `justify-self: end` in whichever grid row the DOM order
                puts it, so a composed surface asks for the corner by asking for it
                first. The parts layer keeps the other reading — the same part under
                the body is "Done" — and the sheet still does not have to know. */}
            {closeLabel == null || closeLabel === "" ? null : (
              <PopoverCloseTrigger aria-label={closeLabel} {...parts?.closeTrigger} />
            )}
            {/* An empty title is a named part with nothing in it, and the machine
                would prefer it to `label` — so a blank one is withheld rather than
                drawn, and the surface keeps the name it had. */}
            {title == null || title === "" ? null : (
              <PopoverTitle {...parts?.title}>{title}</PopoverTitle>
            )}
            {description == null ? null : (
              <PopoverDescription {...parts?.description}>{description}</PopoverDescription>
            )}
            {children}
          </PopoverContent>
          {/* A sibling of the content, never a child of it: a glass surface is
              contained for paint and would clip the arrow away, and the position
              effect writes `--sui-arrow-x/y` against the positioner's origin. */}
          <PopoverArrow {...parts?.arrow} />
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}
