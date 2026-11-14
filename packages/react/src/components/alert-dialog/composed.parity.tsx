/**
 * The alert dialog's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { NOOP, OFF, type ParityCase } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { DialogCloseTrigger } from "../dialog/dialog";
import {
  AlertDialogAction,
  AlertDialogActions,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogPositioner,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { AlertDialog } from "./composed";

export const parity: readonly ParityCase[] = [
  /**
   * The alias, and the whole of it: `AlertDialog` is `Dialog` with the machine's
   * `role` pinned, exactly as `AlertDialogRoot` is `DialogRoot` with it pinned.
   * The parts side is written with the alert names — which are the dialog's parts
   * under another export — so this row is also the assertion that the two naming
   * schemes have not drifted.
   */
  {
    name: "alert-dialog",
    composed: (
      <AlertDialog
        id="delete"
        defaultOpen
        parts={OFF}
        title="Delete this file?"
        description="This cannot be undone."
      />
    ),
    parts: (
      <AlertDialogRoot id="delete" defaultOpen>
        <AlertDialogPortal disabled>
          <AlertDialogBackdrop />
          <AlertDialogPositioner>
            <AlertDialogContent>
              <AlertDialogTitle>Delete this file?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialogPositioner>
        </AlertDialogPortal>
      </AlertDialogRoot>
    ),
  },
  /**
   * The shape the reference app's `ConfirmDialog` is: a question, a consequence, and two
   * answers. The confirm is written first because that is how the sentence reads,
   * and the focus still opens on Cancel — the machine looks that button up by id
   * rather than taking the first tabbable, which is the one behaviour the role
   * adds and the reason the order here is the array's and never sorted.
   */
  {
    name: "alert-dialog",
    composed: (
      <AlertDialog
        id="delete"
        defaultOpen
        trigger={<ButtonRoot variant="gray" />}
        title="Delete 12 files?"
        description="This cannot be undone."
        parts={OFF}
        actions={[
          { label: "Delete", destructive: true, onPress: NOOP },
          { label: "Cancel", cancel: true },
        ]}
      />
    ),
    parts: (
      <AlertDialogRoot id="delete" defaultOpen>
        <AlertDialogTrigger render={<ButtonRoot variant="gray" />} />
        <AlertDialogPortal disabled>
          <AlertDialogBackdrop />
          <AlertDialogPositioner>
            <AlertDialogContent>
              <AlertDialogTitle>Delete 12 files?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogAction index={0} destructive onClick={NOOP}>
                  Delete
                </AlertDialogAction>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogActions>
            </AlertDialogContent>
          </AlertDialogPositioner>
        </AlertDialogPortal>
      </AlertDialogRoot>
    ),
  },
  /**
   * Three answers, no fixture reached until 2026-09-05: with one id for the whole part
   * the second and third buttons repeated the first one's, and the parity of markup
   * could not see it because both sides repeated it *identically*. `duplicateIds`
   * in `composed.test.tsx` is what sees it now, and this is the row it reads.
   */
  {
    name: "alert-dialog",
    composed: (
      <AlertDialog
        id="unsaved"
        defaultOpen
        title="You have unsaved changes."
        description="Three answers, and every one of them closes the surface."
        parts={OFF}
        actions={[
          { label: "Save", onPress: NOOP },
          { label: "Discard", destructive: true, onPress: NOOP },
          { label: "Cancel", cancel: true },
        ]}
      />
    ),
    parts: (
      <AlertDialogRoot id="unsaved" defaultOpen>
        <AlertDialogPortal disabled>
          <AlertDialogBackdrop />
          <AlertDialogPositioner>
            <AlertDialogContent>
              <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
              <AlertDialogDescription>
                Three answers, and every one of them closes the surface.
              </AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogAction index={0} onClick={NOOP}>
                  Save
                </AlertDialogAction>
                <AlertDialogAction index={1} destructive onClick={NOOP}>
                  Discard
                </AlertDialogAction>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogActions>
            </AlertDialogContent>
          </AlertDialogPositioner>
        </AlertDialogPortal>
      </AlertDialogRoot>
    ),
  },
  /** `parts` last on the alert too, and it reaches the row a plain dialog has not. */
  {
    name: "alert-dialog",
    composed: (
      <AlertDialog
        id="discard"
        defaultOpen
        title="Discard this draft?"
        description="The draft will not be kept."
        closeLabel="Close"
        trigger={<ButtonRoot variant="plain" />}
        parts={{
          ...OFF,
          closeTrigger: { "aria-label": "Fermer" },
          actions: { className: "row" },
          actionTrigger: { className: "answer" },
          cancelTrigger: { className: "answer" },
        }}
        actions={[
          { label: "Discard", destructive: true },
          { label: "Keep", cancel: true },
        ]}
      />
    ),
    parts: (
      <AlertDialogRoot id="discard" defaultOpen>
        <AlertDialogTrigger render={<ButtonRoot variant="plain" />} />
        <AlertDialogPortal disabled>
          <AlertDialogBackdrop />
          <AlertDialogPositioner>
            <AlertDialogContent>
              <DialogCloseTrigger aria-label="Fermer" />
              <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
              <AlertDialogDescription>The draft will not be kept.</AlertDialogDescription>
              <AlertDialogActions className="row">
                <AlertDialogAction index={0} destructive className="answer">
                  Discard
                </AlertDialogAction>
                <AlertDialogCancel className="answer">Keep</AlertDialogCancel>
              </AlertDialogActions>
            </AlertDialogContent>
          </AlertDialogPositioner>
        </AlertDialogPortal>
      </AlertDialogRoot>
    ),
  },
];
