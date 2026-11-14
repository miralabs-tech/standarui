/**
 * The popover's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row that opens the surface stands the portal down with `OFF`. The reason
 * is the trigger's: `getTriggerProps` writes `aria-controls` while the popover is
 * open, and a `Portal` with no `document` renders nothing — so a row that left the
 * portal alone would fail `danglingIdRefs` on an id its own surface should have
 * carried, rather than on anything the layer got wrong.
 */

import { OFF, type ParityCase } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { Popover } from "./composed";
import {
  PopoverArrow,
  PopoverBackdrop,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverDescription,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

export const parity: readonly ParityCase[] = [
  /**
   * The smallest popover that is still legal, and the row the optional `title`
   * exists for: no trigger, no title, no description, no close button — a surface
   * driven by `open` alone, named by the `label` machine prop because the layer
   * placed no title part for the machine to prefer instead. `aria-label` is what
   * the content carries here, and it is what it keeps: `hasTitle` is read out of
   * the DOM, so the only thing that could ever flip it is a title part, and there
   * is none in either form.
   */
  {
    name: "popover",
    composed: <Popover id="filters" defaultOpen label="Filters" parts={OFF} />,
    parts: (
      <PopoverRoot id="filters" defaultOpen label="Filters">
        <PopoverPortal disabled>
          <PopoverBackdrop />
          <PopoverPositioner>
            <PopoverContent />
            <PopoverArrow />
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    ),
  },
  /**
   * Every slot at once, and the one the parts form cannot spell the same way:
   * `closeLabel` becomes an `aria-label` on an *empty* button, which is the only
   * shape a part with no name of its own may be rendered in. The trigger is here
   * too, so this is also the row where `aria-controls` has something to resolve
   * against — which is what the stood-down portal buys.
   */
  {
    name: "popover",
    composed: (
      <Popover
        id="share"
        defaultOpen
        trigger={<ButtonRoot variant="gray" />}
        title="Share"
        description="Anyone with the link can view this document."
        closeLabel="Close"
        parts={OFF}
      >
        <p>Link sharing is on for everyone at Acme.</p>
      </Popover>
    ),
    parts: (
      <PopoverRoot id="share" defaultOpen>
        <PopoverTrigger render={<ButtonRoot variant="gray" />} />
        <PopoverPortal disabled>
          <PopoverBackdrop />
          <PopoverPositioner>
            <PopoverContent>
              <PopoverCloseTrigger aria-label="Close" />
              <PopoverTitle>Share</PopoverTitle>
              <PopoverDescription>Anyone with the link can view this document.</PopoverDescription>
              <p>Link sharing is on for everyone at Acme.</p>
            </PopoverContent>
            <PopoverArrow />
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    ),
  },
  /**
   * `parts` is applied **last**, so it wins over what the layer defaults *and* over
   * what the machine itself writes. Both collisions are real ones rather than spare
   * keys: `parts.arrow` flips the `aria-hidden="true"` that `getArrowProps` emits,
   * which is a value the layer never chooses and the part always does, and
   * `parts.closeTrigger` overwrites the `aria-label` `closeLabel` had just set. The
   * parts side is written with the values that have to win.
   */
  {
    name: "popover",
    composed: (
      <Popover
        id="share"
        defaultOpen
        title="Share"
        closeLabel="Close"
        trigger={<ButtonRoot variant="gray" />}
        parts={{
          ...OFF,
          content: { className: "surface" },
          arrow: { "aria-hidden": "false" },
          closeTrigger: { "aria-label": "Fermer" },
        }}
      />
    ),
    parts: (
      <PopoverRoot id="share" defaultOpen>
        <PopoverTrigger render={<ButtonRoot variant="gray" />} />
        <PopoverPortal disabled>
          <PopoverBackdrop />
          <PopoverPositioner>
            <PopoverContent className="surface">
              <PopoverCloseTrigger aria-label="Fermer" />
              <PopoverTitle>Share</PopoverTitle>
            </PopoverContent>
            <PopoverArrow aria-hidden="false" />
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    ),
  },
  /**
   * The sheet, and the only row where a part the layer places **unconditionally**
   * renders nothing at all: `PopoverArrow` returns `null` once the computed
   * presentation is `sheet`, because a sheet has no anchor to point at. Both forms
   * write the arrow and both markups come back without one, which is the proof that
   * the withholding lives in the part rather than in a branch the composed layer
   * would have had to duplicate.
   */
  {
    name: "popover",
    composed: (
      <Popover id="filters" defaultOpen presentation="sheet" label="Filters" parts={OFF}>
        <p>Everything in the current view.</p>
      </Popover>
    ),
    parts: (
      <PopoverRoot id="filters" defaultOpen presentation="sheet" label="Filters">
        <PopoverPortal disabled>
          <PopoverBackdrop />
          <PopoverPositioner>
            <PopoverContent>
              <p>Everything in the current view.</p>
            </PopoverContent>
            <PopoverArrow />
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    ),
  },
];
