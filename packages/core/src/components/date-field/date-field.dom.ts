import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";
import type { DateSegmentType } from "./date-field.types";

/**
 * Only the parts something points at get an id: the root, the group a field names,
 * one per segment because the machine moves the real focus between them, and the
 * hidden input because the form reset listener has to find the form through it.
 */
const COMPONENT = "date-field";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getControlId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "control");
}

export function getSegmentId(scope: Scope, segment: DateSegmentType): string {
  return getPartId(scope, COMPONENT, "segment", segment);
}

export function getHiddenInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "hiddenInput");
}

export function getControlEl(scope: Scope): HTMLElement | null {
  return scope.getById(getControlId(scope));
}

export function getSegmentEl(scope: Scope, segment: DateSegmentType): HTMLElement | null {
  return scope.getById(getSegmentId(scope, segment));
}

export function getHiddenInputEl(scope: Scope): HTMLInputElement | null {
  return scope.getById<HTMLInputElement>(getHiddenInputId(scope));
}
