/**
 * Does this element name itself to a screen reader?
 *
 * Only ever asked in development, and always for the same reason: four surfaces in
 * this library render a control the machine cannot name — a close trigger that is
 * a bare glyph, a trigger whose label the consumer owns — and each of them warns
 * rather than shipping a button announced as "button".
 *
 * **Hoisted on 2026-09-11, and the lever was named before it was pulled.** The same
 * body sat verbatim in `dialog`, `menu`, `popover` and `date-picker`;
 * `scripts/size-budget.ts` had already written down that `../../*` is external to
 * every component line, so moving it here takes the bytes off all four at once. It
 * gets no budget line of its own: the rule of 2026-08-28 asks for one when a shared
 * layer has exactly one consumer, because amortised over one is not amortised.
 * Four is.
 *
 * Deliberately a heuristic and not `Element.computedName`: that API is behind a
 * flag everywhere, and what this guards is a development warning, where a false
 * negative costs a message nobody needed and a false positive costs nothing at all.
 * `title` counts because the browser does fall back to it — it is a poor name, not
 * an absent one, and warning about it would be crying wolf.
 */
export function hasAccessibleName(node: HTMLElement): boolean {
  return (
    node.textContent?.trim() !== "" ||
    node.hasAttribute("aria-label") ||
    node.hasAttribute("aria-labelledby") ||
    node.hasAttribute("title")
  );
}
