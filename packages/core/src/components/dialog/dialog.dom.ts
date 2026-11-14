import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import { getDocumentEl, type Scope } from "../../machine/scope";

const COMPONENT = "dialog";

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getBackdropId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "backdrop");
}

export function getPositionerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "positioner");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getTitleId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "title");
}

export function getDescriptionId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "description");
}

export function getCloseTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "closeTrigger");
}

/**
 * The same key `getActionTriggerId` takes, and omitted for the FIRST way out of a
 * row on purpose — which is why this one cannot simply be keyed the way that one
 * was. `getCancelTriggerEl` below resolves an alert's initial focus by the
 * un-indexed id, and the order the sentence reads in puts the cancel second, so
 * indexing every cancel would hand the APG guarantee to whichever button happened
 * to be written first. Only the second and later ones need a key: they exist to be
 * distinct, not to be found.
 */
export function getCancelTriggerId(scope: Scope, index?: number | undefined): string {
  return getPartId(
    scope,
    COMPONENT,
    "cancelTrigger",
    index === undefined ? undefined : String(index),
  );
}

/**
 * `index` is what makes a row of answers possible, and it is spelled the way
 * `getSwatchId` spells the same question. An alert draws two answers — but without a key the third button repeats the second one's id: N buttons, one id,
 * and no detector in this repository could see it (audit of 2026-09-05).
 *
 * Omitted, the id is exactly the one this function has always returned, so every
 * pinned fixture and every single-action surface is untouched.
 */
export function getActionTriggerId(scope: Scope, index?: number | undefined): string {
  return getPartId(
    scope,
    COMPONENT,
    "actionTrigger",
    index === undefined ? undefined : String(index),
  );
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

export function getBackdropEl(scope: Scope): HTMLElement | null {
  return scope.getById(getBackdropId(scope));
}

export function getPositionerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPositionerId(scope));
}

/**
 * What `alert-dialog` points its default `initialFocus` at. The APG asks an alert
 * dialog to open on its least destructive action, and the machine's fallback —
 * the first tabbable inside the surface — is the opposite of that as soon as the
 * author writes the confirm button first, which reads naturally and is common.
 */
export function getCancelTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getCancelTriggerId(scope));
}

/**
 * Looked up by id rather than by walking down from anything: the surface is
 * portalled, so there is no ancestor to walk down from.
 */
export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

/**
 * The node the environment is resolved against: the surface once it exists, the
 * trigger before it does, and the document's own root when neither is rendered —
 * a dialog driven from a store has no trigger at all.
 *
 * Deliberately not `scope.getDoc()`, which throws where there is no document. An
 * effect that reaches for one cannot be started in a plain node test, and every
 * machine in this library has to be.
 */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  return getContentEl(scope) ?? getTriggerEl(scope) ?? getDocumentEl(scope);
}

/**
 * The anchor for the *direction* alone. It does not read the surface the way
 * `getEnvironmentEl` does: the surface is portalled into `body` and would only
 * report the document's direction back to itself. A dialog driven from a store
 * has no trigger either, and resolving against nothing answers `"ltr"` flat —
 * the one direction an RTL page did not ask for.
 */
export function getDirAnchorEl(scope: Scope): HTMLElement | null {
  return getTriggerEl(scope) ?? getDocumentEl(scope);
}

/**
 * `aria-labelledby` and `aria-describedby` may only point at ids that exist, and
 * whether the consumer rendered a title or a description is not something the
 * machine can assume — the same rule `field` and `toggle-group` follow.
 *
 * Scope-qualified: a dialog holds other components, and a popover nested in one
 * has a `title` of its own that an unqualified search would name the dialog after.
 */
export function hasPart(scope: Scope, part: string): boolean {
  return query(getContentEl(scope), `[data-part~="dialog:${part}"]`) !== null;
}
