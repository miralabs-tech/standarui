import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";
import type { ScrollAxis } from "./scroll-area.types";

const COMPONENT = "scroll-area";

const ORIENTATION_OF: Readonly<Record<ScrollAxis, string>> = {
  x: "horizontal",
  y: "vertical",
};

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getViewportId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "viewport");
}

export function getContentId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "content");
}

export function getScrollbarId(scope: Scope, axis: ScrollAxis): string {
  return getPartId(scope, COMPONENT, "scrollbar", ORIENTATION_OF[axis]);
}

export function getThumbId(scope: Scope, axis: ScrollAxis): string {
  return getPartId(scope, COMPONENT, "thumb", ORIENTATION_OF[axis]);
}

export function getCornerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "corner");
}

export function readViewportMetrics(viewport: HTMLElement): {
  readonly viewportX: number;
  readonly viewportY: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly offsetX: number;
  readonly offsetY: number;
} {
  return {
    viewportX: viewport.clientWidth,
    viewportY: viewport.clientHeight,
    contentX: viewport.scrollWidth,
    contentY: viewport.scrollHeight,
    offsetX: Math.abs(viewport.scrollLeft),
    offsetY: viewport.scrollTop,
  };
}

export function getViewportEl(scope: Scope): HTMLElement | null {
  return scope.getById(getViewportId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

export function getScrollbarEl(scope: Scope, axis: ScrollAxis): HTMLElement | null {
  return scope.getById(getScrollbarId(scope, axis));
}

export function getThumbEl(scope: Scope, axis: ScrollAxis): HTMLElement | null {
  return scope.getById(getThumbId(scope, axis));
}
