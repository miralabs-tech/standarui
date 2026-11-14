/**
 * `<Dialog title="…"/>` — the surface a consumer would otherwise write in nine
 * parts, and the reason the bare name is not `DialogRoot`: the root renders no
 * element at all (`dialog.anatomy.ts` has no `root` part), so `<DialogRoot>` is a
 * context and `<Dialog>` is the trigger, the scrim, the positioner, the surface
 * and everything on it.
 *
 * It is a placement and nothing else — no state, no memo, no prop getter rewritten.
 * The focus trap, the scroll lock, the layer stack and the gamepad scope are the
 * machine's, unchanged, and that is the whole point of the shape: `ConfirmDialog`
 * in the reference app is the app's only modal and it has no focus trap, so what closes that
 * gap is not a new behaviour but a form short enough that nobody writes their own.
 *
 * Three translations the type system cannot make on its own:
 *
 *  - **`title` is required.** `getContentProps` names the surface from the title
 *    part when the machine has read one out of the DOM and from `label` when it
 *    has not — so a dialog with neither is nameless. The part is placed here
 *    unconditionally, which also means `label` is never the name a composed
 *    dialog ends up with: pass the words to `title`.
 *  - **`closeLabel` is a name, not a slot.** `getCloseTriggerProps` writes an id,
 *    a type, a state and a click handler and no accessible name at all — so the
 *    part is rendered only once the consumer has named it, and its children stay
 *    empty for `_dialog.scss` to paint the ✕ under `:empty`. The rule
 *    `MenuContent.cancelLabel` already applies: pass the word and the part
 *    appears, leave it out and nothing is added, because a nameless button is
 *    worse than none.
 *  - **`actions` is the alert's row, and it works under either role.**
 *    `AlertDialogActions`, `AlertDialogAction` and `AlertDialogCancel` read
 *    the dialog context `DialogRoot` publishes — not one of their own — and their part
 *    tokens are `dialog:actions`, `dialog:action-trigger`, `dialog:cancel-trigger`.
 *    They are alert-named React components over dialog parts, so a plain dialog
 *    that ends in Save/Cancel gets the same row, laid out by the same rule.
 */

import { isDev, warn } from "@standarui/core";
import type { ReactNode } from "react";
import type { ComposedAction, ComposedTrigger } from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  AlertDialogAction,
  type AlertDialogActionProps,
  AlertDialogActions,
  AlertDialogCancel,
} from "../alert-dialog/alert-dialog";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogPortal,
  type DialogPortalProps,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  type UseDialogProps,
} from "./dialog";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 *
 * Eleven keys: the ten parts of `dialog.anatomy.ts`, all of which this layer can
 * place, plus `portal` — which is no part at all but the React container the parts
 * form wraps the surface in. The last three (`actions`, `cancelTrigger`,
 * `actionTrigger`) reach the alert's row, which exists only where `actions` does.
 */
export interface DialogParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly portal?: DialogPortalProps | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  readonly title?: PartProps<"h2"> | undefined;
  readonly description?: PartProps<"p"> | undefined;
  readonly closeTrigger?: PartProps<"button"> | undefined;
  readonly actions?: PartProps<"div"> | undefined;
  /**
   * Applied to EVERY cancel entry of `actions`, hence no `id` **and no IDREF**:
   * one id repeated down a row is a broken reference per button, and one
   * `aria-labelledby` repeated gives every button the same name — which no
   * dangling-IDREF check can see, because the id it points at does resolve. `ref`
   * goes for the same reason: a single ref held by N buttons ends up holding the
   * last one.
   */
  readonly cancelTrigger?:
    | Omit<
        PartProps<"button">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  /**
   * Applied to EVERY non-cancel entry of `actions`. `destructive` is left out on
   * top of the repeated-key list: it is the entry's own field, and one flag here
   * would paint every action in the row destructive at once. `index` is left out
   * for the sharper version of the same reason — it is applied last, so one value
   * here would mint the same id for every button in the row, which is the exact
   * defect the key was added to close.
   */
  readonly actionTrigger?:
    | Omit<
        AlertDialogActionProps,
        | "destructive"
        | "index"
        | "id"
        | "ref"
        | "aria-labelledby"
        | "aria-describedby"
        | "aria-controls"
      >
    | undefined;
}

export interface DialogComposedProps extends UseDialogProps {
  /**
   * Handed to `DialogTrigger` as `render` — never as its children. The trigger
   * *is* a `<button>`, and a button inside a button is `nested-interactive`.
   * Left out, no trigger part is placed at all, which is the shape a dialog
   * driven from a store takes: `open` on one side, no anchor on the other.
   */
  readonly trigger?: ComposedTrigger | undefined;
  /**
   * The surface's accessible name, and required for that reason — a dialog
   * without one is a defect rather than a choice. The part is always placed, so
   * the machine's `label` fallback is never what a composed dialog is named by:
   * an empty title is not a dialog named by something else, it is a dialog named
   * by nothing.
   *
   * `ReactNode` alone did not say that — it admits `null`, `undefined` and
   * `false`, so `<Dialog title={cond && "…"}/>` typechecked its way to a nameless
   * modal. Those three are excluded here. The empty *string* cannot be excluded by
   * a type (`Exclude<string, "">` is still `string`), so it is refused at runtime
   * below, in dev only, the way the machine's own name guards are.
   */
  readonly title: Exclude<ReactNode, null | undefined | boolean>;
  /** Wired to `aria-describedby` by the machine, once it has read the part. */
  readonly description?: ReactNode;
  /** The body: the form, the list, whatever the question is about. */
  readonly children?: ReactNode;
  /**
   * The row of answers. `cancel: true` becomes `AlertDialogCancel` — which is
   * also where an alert dialog opens its focus — and everything else becomes
   * `AlertDialogAction`, carrying `destructive` through to the attribute the
   * sheet paints. `onPress` lands on the button's `onClick`, so it runs *before*
   * the machine's own handler and a `preventDefault()` inside it keeps the
   * surface open, which is the contract `getActionTriggerProps` publishes.
   *
   * The order is the array's, never sorted: the APG asks an alert to open its
   * focus on the least destructive action and the machine does that by looking
   * the cancel button up by id, so writing the confirm first — the way the
   * sentence reads — costs nothing.
   *
   * **As many answers as the question has.** Each action carries its `index`, so
   * the ids are distinct however long the row is — until 2026-09-05 the third button repeated
   * the second one's id. A row with two ways out repeated it for one day longer:
   * the cancel half is keyed from the *second* one on, because the first has to
   * keep the id the initial-focus rule two paragraphs up resolves.
   */
  readonly actions?: readonly ComposedAction[] | undefined;
  /**
   * Names the close button, and the part is placed only when it is given: the
   * machine emits no accessible name for it (`getCloseTriggerProps` — id, type,
   * state, click, and nothing else). Present, the part is rendered *empty* and
   * carries `aria-label`, so the sheet draws the ✕ under `:empty` and a consumer
   * who wants their own glyph reaches it through `parts.closeTrigger`.
   *
   * The empty string counts as absent, not as a name. The guard used to be
   * `== null`, so `closeLabel=""` placed a painted ✕ carrying `aria-label=""` —
   * a button with no name at all, which is the one outcome withholding the part
   * exists to prevent.
   */
  readonly closeLabel?: string | undefined;
  readonly container?: PortalProps["container"] | undefined;
  readonly parts?: DialogParts | undefined;
}

export function Dialog(props: DialogComposedProps): ReactNode {
  const { trigger, title, description, children, actions, closeLabel, container, parts, ...root } =
    props;

  // Which entry keeps the un-indexed id: an alert opens its focus on whatever
  // `getCancelTriggerEl` resolves, and that is the part's own id. Read here rather
  // than counted in the map because the row is commonly written confirm-first, so
  // the first way out is rarely entry 0.
  const firstCancel = actions?.findIndex((action) => action.cancel === true) ?? -1;

  // The half the type cannot state. `Exclude<ReactNode, …>` keeps out `null`,
  // `undefined` and `false`; no type keeps out `""`, and a title part rendered
  // empty is a modal named by nothing — the machine's `label` fallback never runs,
  // because the part is always placed.
  warn(
    isDev() && title === "",
    'Dialog: `title` is the surface\'s accessible name and cannot be "". Pass the words, or write the parts and name the content yourself.',
  );

  return (
    <DialogRoot {...root}>
      {trigger === undefined ? null : <DialogTrigger render={trigger} {...parts?.trigger} />}
      <DialogPortal container={container} {...parts?.portal}>
        <DialogBackdrop {...parts?.backdrop} />
        <DialogPositioner {...parts?.positioner}>
          <DialogContent {...parts?.content}>
            {/* First, and that is the whole of the placement: `_dialog.scss` gives
                this button `justify-self: end` in whichever grid row the DOM order
                puts it, so a composed surface asks for the corner by asking for it
                first. The parts layer keeps the other reading — the same part after
                a row of actions is "Close" at the end of it — and the sheet still
                does not have to know which of the two it is drawing. */}
            {closeLabel == null || closeLabel === "" ? null : (
              <DialogCloseTrigger aria-label={closeLabel} {...parts?.closeTrigger} />
            )}
            <DialogTitle {...parts?.title}>{title}</DialogTitle>
            {description == null ? null : (
              <DialogDescription {...parts?.description}>{description}</DialogDescription>
            )}
            {children}
            {actions === undefined ? null : (
              <AlertDialogActions {...parts?.actions}>
                {actions.map((action, index) =>
                  action.cancel === true ? (
                    <AlertDialogCancel
                      key={action.label}
                      index={index === firstCancel ? undefined : index}
                      onClick={action.onPress}
                      {...parts?.cancelTrigger}
                    >
                      {action.label}
                    </AlertDialogCancel>
                  ) : (
                    <AlertDialogAction
                      key={action.label}
                      index={index}
                      destructive={action.destructive}
                      onClick={action.onPress}
                      {...parts?.actionTrigger}
                    >
                      {action.label}
                    </AlertDialogAction>
                  ),
                )}
              </AlertDialogActions>
            )}
          </DialogContent>
        </DialogPositioner>
      </DialogPortal>
    </DialogRoot>
  );
}
