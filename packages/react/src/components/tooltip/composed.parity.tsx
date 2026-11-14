/**
 * The tooltip's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. The trigger, the positioner and the content all derive
 * their DOM ids from the root's scope id, and the trigger's `aria-describedby` is
 * the content's — so an unpinned row would compare two different `useId` counters
 * on the one thing the two forms genuinely share.
 *
 * Three of the four rows stand the portal down with `OFF`. A `Portal` reached
 * through `renderToString` resolves no container and renders nothing, so without
 * it a row that mounts the surface would compare an empty subtree against an empty
 * subtree — and the open row would fail `danglingIdRefs` on the very id its own
 * surface should have carried.
 */

import type { ReactElement } from "react";
import { OFF, type ParityCase } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { Tooltip } from "./composed";
import {
  TooltipContent,
  TooltipPortal,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger,
} from "./tooltip";

/**
 * The trigger of the last row, shared by both of its forms. `useRender` clones
 * what it is handed, so one element in two trees is safe — and sharing it is what
 * makes the two sides literally the same node rather than two that agree.
 */
// biome-ignore lint/a11y/useButtonType: the absent `type` is this row's mechanism rather than an oversight. `getTriggerProps` writes `type: "button"` and `parts.trigger` overrides it to `"reset"`; `useRender` merges the substituted element last, so a `type` written here would win over both and the row would witness nothing.
const PUBLISH: ReactElement = <button>Publish</button>;

export const parity: readonly ParityCase[] = [
  /**
   * The whole component in its resting state: a trigger, and nothing else in the
   * markup. The three surface parts are placed on both sides and all three return
   * `null` while the tooltip is closed, which is what makes the composed layer
   * free to place them unconditionally.
   *
   * Two facts ride along. The substitution keeps **both** identities on one
   * element — `data-part="tooltip:trigger button:root"`, the composition
   * `mergeProps` accumulates rather than overwrites — and the trigger carries
   * **no** `aria-describedby`, because `getTriggerProps` publishes it only while
   * the surface is open and a closed tooltip must leave no dangling reference.
   */
  {
    name: "tooltip",
    composed: (
      <Tooltip id="rename" trigger={<ButtonRoot variant="gray">Rename</ButtonRoot>}>
        Rename this file
      </Tooltip>
    ),
    parts: (
      <TooltipRoot id="rename">
        <TooltipTrigger render={<ButtonRoot variant="gray">Rename</ButtonRoot>} />
        <TooltipPortal>
          <TooltipPositioner>
            <TooltipContent>Rename this file</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    ),
  },
  /**
   * Open from the first render, which is the only way a server render reaches the
   * surface subtree at all — so this is the row that compares it: the positioner,
   * the content, `role="tooltip"`, `data-state="open"` on all three nodes, and the
   * trigger's `aria-describedby` pointing at a content id that now resolves.
   */
  {
    name: "tooltip",
    composed: (
      <Tooltip
        id="duplicate"
        defaultOpen
        parts={OFF}
        trigger={<ButtonRoot variant="gray">Duplicate</ButtonRoot>}
      >
        Duplicate this file
      </Tooltip>
    ),
    parts: (
      <TooltipRoot id="duplicate" defaultOpen>
        <TooltipTrigger render={<ButtonRoot variant="gray">Duplicate</ButtonRoot>} />
        <TooltipPortal disabled>
          <TooltipPositioner>
            <TooltipContent>Duplicate this file</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    ),
  },
  /**
   * The pairing no other row can make: the surface is **in** the markup and the
   * tooltip is **closed**. `keepMounted` is not a machine prop — it never reaches
   * the machine, it rides in `...root` to `TooltipRoot` and the three parts read it
   * off the context — so the surface renders with `data-state="closed"` while the
   * trigger still carries no `aria-describedby`. A layer that forwarded
   * `keepMounted` as an open state, or a trigger that published the reference
   * unconditionally, both fail here and nowhere else.
   */
  {
    name: "tooltip",
    composed: (
      <Tooltip
        id="delete"
        keepMounted
        parts={OFF}
        trigger={<ButtonRoot variant="gray">Delete</ButtonRoot>}
      >
        Delete this file
      </Tooltip>
    ),
    parts: (
      <TooltipRoot id="delete" keepMounted>
        <TooltipTrigger render={<ButtonRoot variant="gray">Delete</ButtonRoot>} />
        <TooltipPortal disabled>
          <TooltipPositioner>
            <TooltipContent>Delete this file</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    ),
  },
  /**
   * `parts` is applied **last**, on all four keys at once, and the witness is
   * `type` on the trigger: `getTriggerProps` writes `type: "button"` itself and no
   * effect ever reads it back, so flipping it to `"reset"` is a value the machine
   * chose and the escape hatch overrode. `aria-*` and `data-state` could not play
   * that role — React's types carry no `data-${string}` index signature, so a
   * `parts` entry cannot even spell `data-state`.
   *
   * The trigger here is a plain `<button>` where the three rows above substitute a
   * `ButtonRoot`, and that is the row's mechanism rather than variety. The
   * substituted element must carry no `type` of its own, since `useRender` merges
   * it last of all — and a `ButtonRoot` would do worse than carry one: `type` is
   * one of *its* machine props, so the value would be re-emitted by the button's
   * own `connect` and this row would witness a forward rather than an override.
   */
  {
    name: "tooltip",
    composed: (
      <Tooltip
        id="publish"
        defaultOpen
        trigger={PUBLISH}
        parts={{
          ...OFF,
          trigger: { type: "reset" },
          positioner: { className: "over" },
          content: { className: "phrase" },
        }}
      >
        Publish this draft
      </Tooltip>
    ),
    parts: (
      <TooltipRoot id="publish" defaultOpen>
        <TooltipTrigger type="reset" render={PUBLISH} />
        <TooltipPortal disabled>
          <TooltipPositioner className="over">
            <TooltipContent className="phrase">Publish this draft</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>
    ),
  },
];
