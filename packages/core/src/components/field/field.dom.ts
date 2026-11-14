import { query } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "field";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getHelperTextId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "helperText");
}

export function getErrorTextId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "errorText");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

/** `aria-describedby` may only point at ids that exist, so presence is a fact to read. */
export function hasPart(scope: Scope, part: string): boolean {
  return query(getRootEl(scope), `[data-part~="field:${part}"]`) !== null;
}

const LABELABLE = ["BUTTON", "INPUT", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"];

/**
 * Whether the control id landed on an element `<label for>` can actually name.
 *
 * A control that is a `div[role]` — the slider's thumb, for one — never takes the
 * id, and a control that takes it on a wrapper is not labelable either; both leave
 * `for` pointing at nothing and the label dead to the pointer. Read from the DOM
 * for the same reason the helper and error texts are: only the markup knows.
 *
 * Answers `true` before the first sync so a server-rendered field emits `for`
 * exactly as it does today — the correction lands with the first observation,
 * which runs after mount, when "no element has this id" is finally meaningful.
 */
export function hasLabelableControl(scope: Scope): boolean {
  const control = scope.getById(getControlId(scope));
  return control !== null && LABELABLE.includes(control.tagName);
}
