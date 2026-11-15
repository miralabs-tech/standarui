/**
 * `<AlertDialog>` — one grammar, two presentations (D10), and the alias is the
 * machine's `role` and nothing else.
 *
 * `AlertDialogRoot` is `DialogRoot` with `role="alertdialog"` pinned, and every
 * other alert part is a dialog part re-exported under an alert name so a consumer
 * imports one module rather than two. So the composed alert is `<Dialog>` with
 * the same pin: the markup is the alert parts' to the character — same scope,
 * same tokens, same ids — because they are the same components.
 *
 * What the role buys is a behaviour that lives in the machine rather than here:
 * focus opens on the cancel button instead of the first tabbable, because the APG
 * asks an alert to open on its least destructive answer and the author writes the
 * confirm first. `actions` is what makes that reachable in one prop, and it is
 * the line that closes the reference app's named blocker — `ConfirmDialog`, the app's only
 * modal, with no focus trap of its own.
 */

import type { ReactNode } from "react";
import { Dialog, type DialogComposedProps } from "../dialog/composed";

/**
 * The dialog's props minus `role`: an alert that could be told it is a plain
 * dialog is a `Dialog` with extra steps, and the machine's initial-focus rule
 * keys off exactly that prop — the same omission `AlertDialogRootProps` makes.
 */
export interface AlertDialogComposedProps extends Omit<DialogComposedProps, "role"> {
  /**
   * The question. Required here for the reason it is required on the dialog —
   * the surface takes its accessible name from this part — and an alert has a
   * second one on top: the title is the question the two buttons answer, so a
   * nameless alert is an unanswerable one. Narrowed the same way, so `null`,
   * `undefined` and `false` cannot reach it either.
   */
  readonly title: Exclude<ReactNode, null | undefined | boolean>;
  /**
   * The consequence, and required on an alert where it is optional on a dialog.
   * The APG asks an `alertdialog` to point `aria-describedby` at the message that
   * explains the alert, and the machine only wires that once the part is placed —
   * so an alert without a description is one that announces its question and
   * never its stakes. The comment here always said the title alone rarely can;
   * the type says it now.
   */
  readonly description: Exclude<ReactNode, null | undefined | boolean>;
}

export function AlertDialog(props: AlertDialogComposedProps): ReactNode {
  return <Dialog {...props} role="alertdialog" />;
}
