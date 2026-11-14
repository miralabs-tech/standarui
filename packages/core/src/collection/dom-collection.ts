/**
 * A collection read from the live DOM rather than held in a machine's context.
 *
 * Every transient composite in the library ends up wanting this: `menu` today,
 * `select`, `listbox`, `combobox`, `tree` and `menubar` next. Their items are
 * composition — the consumer writes them as children — so a machine that had to be
 * *told* about its own collection goes out of sync the first time one item is
 * rendered conditionally, and an array in context would additionally buy an
 * `isEqual` and a DOM-order sync for nothing. The roving focus and the typeahead
 * both work on the document anyway.
 *
 * The container selector is the half a bare `querySelectorAll` cannot do: a menu
 * drilled into a sheet, or a `select` inside a `menu`, nests one collection inside
 * another, and the outer machine must not adopt the inner items.
 */

import { getNextIndex, type RovingAction } from "../focus/roving-focus";

export function queryItems(
  container: HTMLElement | null | undefined,
  itemSelector: string,
  containerSelector: string,
): HTMLElement[] {
  if (container === null || container === undefined) return [];
  return [...container.querySelectorAll<HTMLElement>(itemSelector)].filter(
    (item) => item.closest(containerSelector) === container,
  );
}

/**
 * `aria-disabled` and not `disabled`: APG wants a disabled menu item or toolbar
 * button reachable, unlike a natively disabled form control, so these collections
 * never carry the native attribute. `data-disabled` is the styling twin and is
 * accepted so a consumer's own markup answers too.
 */
export function isItemDisabled(item: HTMLElement): boolean {
  return item.getAttribute("aria-disabled") === "true" || item.hasAttribute("data-disabled");
}

export function getItemValue(item: HTMLElement): string {
  return item.dataset.value ?? "";
}

/**
 * What a typeahead matches on. `data-label` first — a consumer who reserved the
 * width of a bolder weight has already written the text down — then the part that
 * holds the name, and only then the whole item, which would otherwise fold a
 * shortcut and a subtitle into the search string.
 */
export function getItemLabel(item: HTMLElement, textSelector: string): string {
  const declared = item.dataset.label;
  if (declared !== undefined) return declared;
  const text = item.querySelector(textSelector);
  return (text?.textContent ?? item.textContent ?? "").trim();
}

export function findItemByValue(
  items: readonly HTMLElement[],
  value: string | null,
): HTMLElement | null {
  if (value === null) return null;
  return items.find((item) => getItemValue(item) === value) ?? null;
}

/**
 * Where the highlight lands, disabled items stepped over. `null` when the
 * collection is empty — the caller decides whether that clears a highlight or
 * leaves it alone.
 */
export function getNextItem(
  items: readonly HTMLElement[],
  value: string | null,
  action: RovingAction,
  loop: boolean,
): HTMLElement | null {
  if (items.length === 0) return null;
  const current = items.findIndex((item) => getItemValue(item) === value);
  const next = getNextIndex(current, action, {
    count: items.length,
    loop,
    isDisabled: (index) => {
      const item = items[index];
      return item !== undefined && isItemDisabled(item);
    },
  });
  return items[next] ?? null;
}
