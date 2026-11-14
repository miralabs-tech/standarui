/**
 * `<Select options={…}/>` — the other end of the fork from `<Button>`: fifteen
 * nodes, two loops, and a root that renders no element at all. `SelectRoot`
 * publishes a context and stops; `Select` renders the whole tree — the trigger,
 * the form mirror, the portal, the surface and its rows — which is the difference
 * between the two names, and the first line of this file for that reason.
 *
 * Everything below is a placement. There is no state here, no memo over the
 * collection, no prop getter rewritten: the collection is still the live DOM the
 * machine reads, and mapping an array into `<SelectItem>` elements before the
 * render holds nothing (`menu.tsx`, the invariant, unchanged).
 *
 * Two translations the type system cannot do on its own, and both are a11y
 * defects if they are skipped:
 *
 *  - A group's `label` is **the text** here and **a boolean flag** on the part
 *    (`SelectItemGroupProps.label`). Passing the string through would be truthy,
 *    so `aria-labelledby` would be written and point at a label part nobody
 *    rendered. `id` is required on a group so the two ends meet, and so the
 *    markup-parity fixture can pin the key the part would otherwise mint.
 *  - An option's `label` is its typeahead text, its `data-label` *and* the text
 *    the row shows. It is **required** here where the part leaves it optional,
 *    because this is the only place all three come from: the part's fallback
 *    reads `SelectItemText`, which the composed layer fills from this very field.
 *    `renderOption` receives the default subtree rather than a blank slate so
 *    that *decorating* is the cheapest path; replacing it stays the consumer's to
 *    do, and costs them the part that names the row.
 */

import type { SelectItemProps as CoreSelectItemProps } from "@standarui/core/select";
import type { ReactNode } from "react";
import type {
  ComposedDecoration,
  ComposedGroup,
  ComposedSeparator,
  ComposedTrigger,
} from "../../composed";
import type { PartProps } from "../../create-part";
import type { PortalProps } from "../../portal";
import {
  SelectBackdrop,
  SelectCancelTrigger,
  SelectContent,
  SelectHiddenSelect,
  SelectIndicator,
  SelectItem,
  SelectItemGroup,
  SelectItemGroupLabel,
  type SelectItemGroupProps,
  SelectItemIndicator,
  SelectItemSymbol,
  SelectItemText,
  SelectPortal,
  type SelectPortalProps,
  SelectPositioner,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValueText,
  type SelectValueTextProps,
  type UseSelectProps,
} from "./select";

/**
 * An option is the part's own props — an intersection, never a `Pick`, so a field
 * added to `SelectItemProps` shows up here without anyone thinking about it —
 * plus the two fields no machine owns, and `label` narrowed from optional to
 * required (see the header: the composed row has nothing else to name itself
 * with, and a nameless `role="option"` is not a shape to leave compilable).
 */
export type SelectOption<V extends string = string, Meta = never> = Omit<
  CoreSelectItemProps,
  "value" | "label"
> &
  ComposedDecoration<Meta> & {
    readonly value: V;
    readonly label: string;
  };

/** Narrowed structurally: `"separator" in entry`, then `"options" in entry`. */
export type SelectEntry<V extends string = string, Meta = never> =
  | SelectOption<V, Meta>
  | ComposedGroup<SelectOption<V, Meta>>
  | ComposedSeparator;

/**
 * The escape hatch, applied **last** on every part: the composed layer's own
 * props default what it places, and the consumer's entry wins over them.
 *
 * Sixteen keys for fifteen parts: the anatomy's fifteen (`select.anatomy.ts`),
 * plus `portal` — which is no part at all but the React container the parts form
 * wraps them in (`SelectPortalProps`), and the one key here that reaches an
 * element the machine never names.
 */
export interface SelectParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly valueText?: SelectValueTextProps | undefined;
  readonly indicator?: PartProps<"span"> | undefined;
  readonly portal?: SelectPortalProps | undefined;
  readonly backdrop?: PartProps<"div"> | undefined;
  readonly positioner?: PartProps<"div"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  /** Applied to EVERY group — `id` and `label` are the entry's, one per group. */
  readonly itemGroup?: Omit<SelectItemGroupProps, "id" | "label"> | undefined;
  readonly itemGroupLabel?: PartProps<"div"> | undefined;
  /**
   * Applied to EVERY item, hence no `id` **and no IDREF**: one `id` repeated down
   * a listbox is a broken IDREF per row, and one `aria-labelledby` repeated gives
   * every option the same name — which `danglingIdRefs` cannot see, because the
   * id it points at does resolve. `ref` goes for the same reason: a single ref
   * held by N rows ends up holding the last one.
   */
  readonly item?:
    | Omit<
        PartProps<"div">,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  readonly itemText?: PartProps<"span"> | undefined;
  readonly itemIndicator?: PartProps<"span"> | undefined;
  readonly itemSymbol?: PartProps<"span"> | undefined;
  readonly separator?: PartProps<"div"> | undefined;
  readonly cancelTrigger?: PartProps<"button"> | undefined;
  readonly hiddenSelect?: PartProps<"select"> | undefined;
}

export interface SelectComposedProps<V extends string = string, Meta = never>
  extends UseSelectProps {
  readonly options: readonly SelectEntry<V, Meta>[];
  /** Shown by the trigger while nothing is selected. */
  readonly placeholder?: string | undefined;
  /**
   * Handed to `SelectTrigger` as `render` — never as its children. The trigger
   * *is* a `<button>`, and a button inside a button is `nested-interactive`.
   *
   * The substitution brings the element **and its behaviour** with it —
   * `ButtonRoot` infers `nativeButton` from what it actually renders — and the
   * look follows the element too: `_select.scss:41` and `:84` are the library's
   * only `select:trigger` rules and both stand behind `:not([data-part*=" "])`,
   * so the pop-up form withholds itself the moment a second identity lands on the
   * element. That is the composition point the sheet declares out loud
   * (`_select.scss:29-32`, "the button's sheet owns the form"), not an accident of
   * source order. The chevron cell is not gated and stays: `select:indicator` is
   * a child, not the composed element.
   */
  readonly trigger?: ComposedTrigger | undefined;
  /**
   * The sheet's Cancel card. The part withholds itself in `popup` on its own, and
   * `null` withholds it here — an empty `<button>` would have no accessible name,
   * and `getCancelTriggerProps` writes none.
   */
  readonly cancelLabel?: ReactNode;
  readonly container?: PortalProps["container"] | undefined;
  /** `true` by default, as on `SelectRoot` — the collection is in the markup while closed. */
  readonly keepMounted?: boolean | undefined;
  /**
   * Replaces the CHILDREN of an item, never the item. `defaults` is the row the
   * layer would have rendered — indicator, symbol, text — and it is handed over
   * so that **decorating** is the cheapest thing to do, not because replacing is
   * impossible. Rendering something else instead of `defaults` is the consumer's
   * to do and costs them three things: the part that names the option
   * (`SelectItemText`), the selection checkmark, and the leading column those two
   * share.
   *
   * Decorate as a **sibling** of `defaults`, never by wrapping it in an element:
   * an item's children are its grid cells (`_select.scss:382`,
   * `grid-template-columns` on `select:item`), so a wrapper collapses all three
   * into one and a node with no `grid-column` of its own lands in the leading
   * track.
   */
  readonly renderOption?:
    | ((option: SelectOption<V, Meta>, defaults: ReactNode) => ReactNode)
    | undefined;
  readonly parts?: SelectParts | undefined;
}

/**
 * One row. `icon` and `meta` are lifted out because the rest of the entry is
 * spread straight onto the part: `icon` belongs to a part of its own and `meta`
 * belongs to the consumer, and neither is an attribute of a `<div>`.
 */
function renderItem<V extends string, Meta>(
  option: SelectOption<V, Meta>,
  parts: SelectParts | undefined,
  render: ((option: SelectOption<V, Meta>, defaults: ReactNode) => ReactNode) | undefined,
): ReactNode {
  const { icon, meta, ...item } = option;
  const defaults = (
    <>
      <SelectItemIndicator {...parts?.itemIndicator} />
      {icon === undefined ? null : (
        <SelectItemSymbol {...parts?.itemSymbol}>{icon}</SelectItemSymbol>
      )}
      <SelectItemText {...parts?.itemText}>{option.label}</SelectItemText>
    </>
  );

  return (
    <SelectItem key={option.value} {...item} {...parts?.item}>
      {render === undefined ? defaults : render(option, defaults)}
    </SelectItem>
  );
}

export function Select<V extends string = string, Meta = never>(
  props: SelectComposedProps<V, Meta>,
): ReactNode {
  const { options, placeholder, trigger, cancelLabel, container, renderOption, parts, ...root } =
    props;

  return (
    <SelectRoot {...root}>
      <SelectTrigger render={trigger} {...parts?.trigger}>
        <SelectValueText placeholder={placeholder} {...parts?.valueText} />
        <SelectIndicator {...parts?.indicator} />
      </SelectTrigger>
      <SelectHiddenSelect {...parts?.hiddenSelect} />
      <SelectPortal container={container} {...parts?.portal}>
        <SelectBackdrop {...parts?.backdrop} />
        <SelectPositioner {...parts?.positioner}>
          <SelectContent {...parts?.content}>
            {options.map((entry, index) => {
              // A separator is not focusable, holds no state and has no subtree to
              // unmount, where an index on a row would move the focus mid-interaction —
              // the collection being the live DOM the machine reads.
              if ("separator" in entry) {
                // biome-ignore lint/suspicious/noArrayIndexKey: safe on a separator, and on nothing else in this list — see above.
                return <SelectSeparator key={`sep:${index}`} {...parts?.separator} />;
              }
              if ("options" in entry) {
                return (
                  <SelectItemGroup key={entry.id} id={entry.id} label {...parts?.itemGroup}>
                    <SelectItemGroupLabel {...parts?.itemGroupLabel}>
                      {entry.label}
                    </SelectItemGroupLabel>
                    {entry.options.map((option) => renderItem(option, parts, renderOption))}
                  </SelectItemGroup>
                );
              }
              return renderItem(entry, parts, renderOption);
            })}
          </SelectContent>
          {cancelLabel == null ? null : (
            <SelectCancelTrigger {...parts?.cancelTrigger}>{cancelLabel}</SelectCancelTrigger>
          )}
        </SelectPositioner>
      </SelectPortal>
    </SelectRoot>
  );
}
