/**
 * Only the parts something points at get an id: an `aria-labelledby`, an
 * `aria-controls`, a machine lookup, or a `.focus()`. The gradients, the
 * chequerboard and the swatch rows are referenced by nothing, and an id per
 * element nobody names is markup nobody reads.
 *
 * The channel parts are keyed by their channel name rather than by an index —
 * `hue` and `red` are never both on screen, but the format select can swap one
 * set for the other between two commits, and an index would silently re-point a
 * label at a different track.
 */

import { query, queryAll } from "../../dom/query";
import { getPartId } from "../../machine/ids";
import type { Scope } from "../../machine/scope";
import type { ColorNumericChannel } from "../../utils/color";

const COMPONENT = "color-picker";

/** Written out rather than derived from the anatomy: a query should not pay for the builder. */
const CONTENT_SELECTOR = '[data-part~="color-picker:content"]';
export const CHANNEL_SLIDER_SELECTOR = '[data-part~="color-picker:channel-slider"]';
export const SWATCH_SELECTOR = '[data-part~="color-picker:swatch"]';

export function getRootId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "root");
}

export function getLabelId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "label");
}

export function getTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "trigger");
}

export function getValueTextId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "value-text");
}

export function getHiddenInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "hidden-input");
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

export function getCancelTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "cancel-trigger");
}

export function getCloseTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "close-trigger");
}

export function getAreaId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "area");
}

export function getAreaXInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "area-x-input");
}

export function getAreaYInputId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "area-y-input");
}

export function getChannelLabelId(scope: Scope, channel: string): string {
  return getPartId(scope, COMPONENT, "channel-label", channel);
}

export function getChannelThumbId(scope: Scope, channel: string): string {
  return getPartId(scope, COMPONENT, "channel-slider-thumb", channel);
}

export function getChannelInputId(scope: Scope, channel: string): string {
  return getPartId(scope, COMPONENT, "channel-input", channel);
}

export function getFormatSelectId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "format-select");
}

export function getSwatchGroupId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "swatch-group");
}

export function getSwatchId(scope: Scope, index: number): string {
  return getPartId(scope, COMPONENT, "swatch", String(index));
}

export function getEyedropperTriggerId(scope: Scope): string {
  return getPartId(scope, COMPONENT, "eyedropper-trigger");
}

export function getRootEl(scope: Scope): HTMLElement | null {
  return scope.getById(getRootId(scope));
}

export function getTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getTriggerId(scope));
}

/** The floating element: what gets the translate, never the content. */
export function getPositionerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getPositionerId(scope));
}

export function getContentEl(scope: Scope): HTMLElement | null {
  return scope.getById(getContentId(scope));
}

/** The gesture surface for the two-dimensional drag; the rect comes from here. */
export function getAreaEl(scope: Scope): HTMLElement | null {
  return scope.getById(getAreaId(scope));
}

export function getAreaXInputEl(scope: Scope): HTMLElement | null {
  return scope.getById(getAreaXInputId(scope));
}

export function getChannelThumbEl(scope: Scope, channel: ColorNumericChannel): HTMLElement | null {
  return scope.getById(getChannelThumbId(scope, channel));
}

export function getFormatSelectEl(scope: Scope): HTMLElement | null {
  return scope.getById(getFormatSelectId(scope));
}

export function getSwatchEl(scope: Scope, index: number): HTMLElement | null {
  return scope.getById(getSwatchId(scope, index));
}

export function getEyedropperTriggerEl(scope: Scope): HTMLElement | null {
  return scope.getById(getEyedropperTriggerId(scope));
}

export function getHiddenInputEl(scope: Scope): HTMLInputElement | null {
  return scope.getById<HTMLInputElement>(getHiddenInputId(scope));
}

/**
 * The surface in every presentation. `inline` renders the content in place with
 * no positioner and no portal, so the delegated pointer listeners and the intent
 * scopes have one element to hang on either way.
 */
export function getSurfaceEl(scope: Scope): HTMLElement | null {
  return getContentEl(scope) ?? getRootEl(scope);
}

/** This picker's own swatch cells, in DOM order — never another picker's. */
export function getSwatchEls(scope: Scope): HTMLElement[] {
  const surface = getSurfaceEl(scope);
  if (surface === null) return [];
  return queryAll<HTMLElement>(surface, SWATCH_SELECTOR).filter(
    (cell) => cell.closest(CONTENT_SELECTOR) === surface.closest(CONTENT_SELECTOR),
  );
}

/** Whether the real focus is inside this picker's surface — never a virtual one. */
export function ownsFocus(scope: Scope): boolean {
  const surface = getSurfaceEl(scope);
  const active = scope.getActiveElement();
  return surface !== null && active !== null && surface.contains(active);
}

/**
 * `aria-labelledby` may only point at an id that exists — the rule `slider`,
 * `progress` and `field` all follow, and the one an audit found broken in two
 * components because every fixture happened to render its label.
 */
export function hasPart(scope: Scope, part: string): boolean {
  return query(getRootEl(scope), `[data-part~="color-picker:${part}"]`) !== null;
}

/**
 * The same question, asked of the surface. `content` is portalled in `popup` and
 * `sheet`, so a query rooted on `root` cannot see the title or the channel labels
 * — and those are exactly the three parts an `aria-labelledby` points at.
 */
export function hasSurfacePart(scope: Scope, part: string): boolean {
  return query(getSurfaceEl(scope), `[data-part~="color-picker:${part}"]`) !== null;
}

/**
 * Which channels a label was actually rendered for — not *whether* any was. The
 * distinction is the whole defect: a panel that labels its three sliders and lets
 * the hex field take the library's own name is an ordinary composition, and a
 * global boolean answered "yes" for the hex field too, pointing its
 * `aria-labelledby` at an id nobody rendered. A dangling IDREF *and* a control with
 * no accessible name, in every story and in the SSR fixture (audit of 2026-09-05).
 *
 * The channel is read from the part's own `data-channel`, which it already carries.
 */
export function getLabelledChannels(scope: Scope): string[] {
  const labels = queryAll<HTMLElement>(
    getSurfaceEl(scope),
    `[data-part~="color-picker:channel-label"]`,
  );
  return labels
    .map((label) => label.getAttribute("data-channel"))
    .filter((channel): channel is string => channel !== null);
}

/** Same three fallbacks as the menu: no document, no throw. */
export function getEnvironmentEl(scope: Scope): HTMLElement | null {
  const rendered = getRootEl(scope) ?? getContentEl(scope) ?? getTriggerEl(scope);
  if (rendered !== null) return rendered;
  const root = scope.getRootNode();
  if (root === null) return null;
  return (root.ownerDocument ?? (root as Document)).documentElement;
}
