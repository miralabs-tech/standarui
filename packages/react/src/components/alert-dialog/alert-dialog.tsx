/**
 * The alert dialog: the dialog machine with `role="alertdialog"` and two action
 * buttons. Not a fork, and not a wrapper that reimplements anything — the surface,
 * the scrim, the positioner, the touch sheet, the focus trap, the scroll lock, the
 * layer stack and the gamepad scope are the dialog's, unchanged.
 *
 * The one behaviour an alert adds lives in the machine rather than here: focus
 * opens on the cancel button instead of the first tabbable, because the APG asks
 * an alert dialog to open on its least destructive action and the author writes
 * the confirm button first. Putting it in the machine is also what gets it into
 * `vanilla` for free.
 *
 * The parts that are the dialog's are re-exported under alert names so a consumer
 * imports one module rather than two, and so the pair cannot drift apart.
 */

import type * as dialog from "@standarui/core/dialog";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { splitProps } from "../../split-props";
import { useRender } from "../../use-render";
import { DialogRoot, type DialogRootProps, useDialogContext } from "../dialog/dialog";

export {
  DialogBackdrop as AlertDialogBackdrop,
  DialogContent as AlertDialogContent,
  DialogDescription as AlertDialogDescription,
  DialogPortal as AlertDialogPortal,
  type DialogPortalProps as AlertDialogPortalProps,
  DialogPositioner as AlertDialogPositioner,
  DialogTitle as AlertDialogTitle,
  DialogTrigger as AlertDialogTrigger,
} from "../dialog/dialog";

/**
 * `role` is not offered: an `AlertDialogRoot` that could be told it is a plain
 * dialog is a `DialogRoot` with extra steps, and the initial-focus rule below
 * keys off exactly that prop.
 */
export interface AlertDialogRootProps extends Omit<DialogRootProps, "role"> {}

export function AlertDialogRoot(props: AlertDialogRootProps): ReactNode {
  return <DialogRoot {...props} role="alertdialog" />;
}

export function AlertDialogActions(props: PartProps<"div">): ReactNode {
  const { render, asChild, children, ...elementProps } = props;
  const api = useDialogContext();

  return useRender({
    render,
    asChild,
    element: "div",
    props: api.getActionsProps(),
    elementProps,
    children,
  });
}

export interface AlertDialogCancelProps
  extends dialog.DialogCancelTriggerProps,
    PartProps<"button", dialog.DialogCancelTriggerProps> {}

/**
 * `index` exists for the surface that draws more than one way out and is left off
 * the first of them, which is the one the machine opens the focus on. A single
 * cancel — the usual alert — passes nothing and keeps the id it has
 * always had.
 */
export function AlertDialogCancel(props: AlertDialogCancelProps): ReactNode {
  const [cancelProps, rest] = splitProps(props, ["index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useDialogContext();

  return useRender({
    render,
    asChild,
    element: "button",
    props: api.getCancelTriggerProps(cancelProps),
    elementProps,
    children,
  });
}

export interface AlertDialogActionProps
  extends dialog.DialogActionTriggerProps,
    PartProps<"button", dialog.DialogActionTriggerProps> {}

/**
 * The one part with props of its own. `destructive` paints it and nothing more —
 * the button that deletes and the button that saves close the surface the same
 * way, and both let the consumer keep it open with `preventDefault()`.
 */
export function AlertDialogAction(props: AlertDialogActionProps): ReactNode {
  const [actionProps, rest] = splitProps(props, ["destructive", "index"]);
  const { render, asChild, children, ...elementProps } = rest;
  const api = useDialogContext();

  return useRender({
    render,
    asChild,
    element: "button",
    props: api.getActionTriggerProps(actionProps),
    elementProps,
    children,
  });
}
