import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";

const COMPONENT = "avatar";

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getImageId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "image");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getImageEl(scope: Scope): HTMLImageElement | null {
  return scope.getById<HTMLImageElement>(getImageId(scope));
}
