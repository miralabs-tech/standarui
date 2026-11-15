/**
 * `<Tooltip trigger={…}>…</Tooltip>` — five nodes, and the shortest composed layer
 * the library has, because the component underneath it is the shortest too.
 *
 * `tooltip.anatomy.ts` declares three parts where the popover declares ten, and
 * the ones it does not declare are what this file never has to place. **No
 * arrow** — the native desktop tooltip is a 49x18 rectangle with two
 * drop shadows and no spur anywhere in it, and touch platforms publish no tooltip at
 * all, so there is no silhouette to draw. **No close trigger** — a tooltip is left
 * behind, not dismissed by a control inside it, and `_tooltip.scss` puts
 * `pointer-events: none` on the positioner, so a button placed in the surface
 * would not be clickable in the first place. **No glyph** — the sheet carries no
 * `:where(:empty)` rule of any kind, unlike `collapsible`, `checkbox` and
 * `pagination`, so there is no empty part here waiting for a default drawing.
 * Three parts in the anatomy, three parts placed, nothing withheld.
 *
 * Like the dialog and the popover, `TooltipRoot` renders no element: the trigger
 * stays exactly where the author wrote it and the surface is portalled, so the two
 * end up siblings. `<Tooltip>` is not a `TooltipRoot` alias — it is the trigger
 * *and* the portalled surface, placed at once.
 *
 * **`trigger` is required, and the asymmetry with `<Dialog>` is deliberate.** A
 * dialog can be driven from a store with nothing to hang off — `open` on one side,
 * no anchor on the other — which is why its trigger slot is optional. A tooltip
 * cannot: there is no `anchor` part, `trackAnchorPosition` measures `getTriggerEl`
 * and returns without installing anything when that is null, every event that can
 * open the surface is a pointer or focus event on that same button, and
 * `aria-describedby` runs between exactly those two nodes. A `<Tooltip open>` with
 * nothing to anchor to is not a shape worth admitting.
 *
 * **`children` is the phrase, and a plain `ReactNode` on purpose** — deliberately
 * not `<Dialog>`'s `Exclude<ReactNode, null | undefined | boolean>`. A dialog's
 * `title` is the surface's only accessible name, so a title that renders to
 * nothing leaves a nameless modal, which is a defect rather than a choice. An
 * empty tooltip leaves a control that keeps its own name: `getTriggerProps` writes
 * `aria-describedby` and never `aria-label` — a tooltip adds to a name, it does
 * not replace one — and the attribute is published only while the surface is open,
 * so a closed tooltip leaves no reference behind either. The worst an empty
 * `children` can do is show an empty box.
 *
 * The three surface parts are placed **unconditionally** and cost a closed tooltip
 * nothing: `TooltipPortal`, `TooltipPositioner` and `TooltipContent` each return
 * `null` while the surface is unmounted, so the closed markup is the trigger and
 * only the trigger. `keepMounted` and `defaultOpen` are the two ways it reaches a
 * server render at all.
 */

import type { ReactNode } from "react";
import type { ComposedTrigger } from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  TooltipContent,
  TooltipPortal,
  type TooltipPortalProps,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger,
  type UseTooltipProps,
} from "./tooltip";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 *
 * Four keys for three parts: the anatomy's `trigger`, `positioner` and `content`,
 * plus `portal` — which is no part at all but the React container the parts form
 * wraps the surface in, and the one key here that reaches an element the machine
 * never names. No `Omit` of `id` or of the IDREFs: each of these parts is placed
 * once, so a fixed id is a fixed id and not the same one repeated down a list.
 */
export interface TooltipParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly portal?: TooltipPortalProps | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
}

export interface TooltipComposedProps extends UseTooltipProps {
  /**
   * Handed to `TooltipTrigger` as `render` — never as its children. The trigger
   * *is* a `<button>`, and a button inside a button is `nested-interactive`.
   * Required, unlike `<Dialog trigger>`: see the header — nothing anchors,
   * nothing opens and nothing is described without it.
   */
  readonly trigger: ComposedTrigger;
  /** The phrase. Required, because a tooltip is only ever this one thing. */
  readonly children: ReactNode;
  readonly container?: PortalProps["container"] | undefined;
  /**
   * Keeps the surface in the markup while closed, `hidden` by state rather than
   * unmounted. Rides in `...root` to `TooltipRoot`, which is where the parts read
   * it from — it is not a machine prop, and the machine never learns about it.
   */
  readonly keepMounted?: boolean | undefined;
  readonly parts?: TooltipParts | undefined;
}

export function Tooltip(props: TooltipComposedProps): ReactNode {
  const { trigger, children, container, parts, ...root } = props;

  return (
    <TooltipRoot {...root}>
      <TooltipTrigger render={trigger} {...parts?.trigger} />
      <TooltipPortal container={container} {...parts?.portal}>
        <TooltipPositioner {...parts?.positioner}>
          <TooltipContent {...parts?.content}>{children}</TooltipContent>
        </TooltipPositioner>
      </TooltipPortal>
    </TooltipRoot>
  );
}
