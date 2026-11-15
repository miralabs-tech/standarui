/**
 * The dialog's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { NOOP, OFF, type ParityCase } from "../../composed.harness";
import {
  AlertDialogAction,
  AlertDialogActions,
  AlertDialogCancel,
} from "../alert-dialog/alert-dialog";
import { ButtonRoot } from "../button/button";
import { Dialog } from "./composed";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

export const parity: readonly ParityCase[] = [
  /**
   * The smallest dialog there is, and the one that says what the bare name means:
   * `DialogRoot` renders no element, `Dialog` renders the scrim, the positioner,
   * the surface and the part that names it. No trigger — a dialog driven by
   * `open` has none, and the layer adds nothing for a slot left empty.
   */
  {
    name: "dialog",
    composed: <Dialog id="rename" defaultOpen parts={OFF} title="Rename file" />,
    parts: (
      <DialogRoot id="rename" defaultOpen>
        <DialogPortal disabled>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Rename file</DialogTitle>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    ),
  },
  /**
   * Every slot at once, and the two the parts form cannot spell the same way:
   * `actions` becomes the alert's row — under `role="dialog"`, because those three
   * components read the context `DialogRoot` publishes and carry `dialog:*` part
   * tokens — and `closeLabel` becomes an `aria-label` on an *empty* button, which
   * is the only shape a part with no name of its own may be rendered in.
   */
  {
    name: "dialog",
    composed: (
      <Dialog
        id="export"
        defaultOpen
        presentation="center"
        trigger={<ButtonRoot />}
        title="Export settings"
        description="Choose a format for the export."
        closeLabel="Close"
        parts={OFF}
        actions={[
          { label: "Export", onPress: NOOP },
          { label: "Cancel", cancel: true },
        ]}
      >
        <p>Every file in the selection.</p>
      </Dialog>
    ),
    parts: (
      <DialogRoot id="export" defaultOpen presentation="center">
        <DialogTrigger render={<ButtonRoot />} />
        <DialogPortal disabled>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent>
              <DialogCloseTrigger aria-label="Close" />
              <DialogTitle>Export settings</DialogTitle>
              <DialogDescription>Choose a format for the export.</DialogDescription>
              <p>Every file in the selection.</p>
              <AlertDialogActions>
                <AlertDialogAction index={0} onClick={NOOP}>
                  Export
                </AlertDialogAction>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogActions>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    ),
  },
  /**
   * `parts` is applied **last**, so it wins over what the layer defaults — and the
   * collision here is a real one rather than a spare key: `closeLabel` writes the
   * `aria-label` of the close button, and `parts.closeTrigger` writes it again.
   * The parts side is written with the value that has to win, and the trigger is
   * substituted in the same row.
   */
  {
    name: "dialog",
    composed: (
      <Dialog
        id="rename"
        defaultOpen
        title="Rename file"
        closeLabel="Close"
        trigger={<ButtonRoot variant="gray" />}
        parts={{ ...OFF, closeTrigger: { "aria-label": "Fermer" }, title: { className: "t" } }}
      />
    ),
    parts: (
      <DialogRoot id="rename" defaultOpen>
        <DialogTrigger render={<ButtonRoot variant="gray" />} />
        <DialogPortal disabled>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent>
              <DialogCloseTrigger aria-label="Fermer" />
              <DialogTitle className="t">Rename file</DialogTitle>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    ),
  },
];
