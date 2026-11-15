/**
 * `<Listbox options={…}/>` — `select`'s collection without `select`'s surface:
 * the same entry grammar, the same group translation, and no trigger, no portal,
 * no positioner, because a listbox is already on the page.
 *
 * **`options` and not `items`**, which is the closed vocabulary's own distinction
 * and not a coin toss: `options` is what a *value* is chosen from — `select`,
 * `radio-group`, `checkbox-group` — and `items` is what a surface *contains*,
 * whether or not anything is selected — `menu`, `tabs`, `toolbar`. A listbox
 * publishes `value`/`onValueChange`, so it is the first family.
 *
 * **A group's `id` is required, and `label` on the part is a boolean.**
 * `ListboxItemGroupProps.label` does not carry the text: it says "this group
 * renders a label part", and the machine points an `aria-labelledby` at an id
 * derived from the group's key. So the layer has to render `ListboxItemGroupLabel`
 * *and* pin the key — written blind, the attribute is a dead IDREF and the group
 * is nameless at the same time, which axe grades `incomplete` rather than a
 * violation and therefore nothing reports. That is why `ComposedGroup` requires
 * `id` where the part defaults it from a `useId`.
 *
 * **The indicator is placed on every row and rendered empty**, which this wave
 * made possible: `_listbox.scss` now draws the checkmark under `:where(:empty)`,
 * two borders in the shape `_menu.scss` already uses. Before that the sheet held a
 * cell the consumer had to fill, and the composed layer had no way to fill it
 * without a slot outside the closed vocabulary. `renderOption` and
 * `parts.itemIndicator` both still take a consumer's own SVG, and the `:empty`
 * guard steps aside for either.
 *
 * **`ListboxItem.label` is not the drawn text.** The drawn text is
 * `ListboxItemText`; `label` is what the typeahead matches on, and it has to be a
 * plain string for that. So an entry's `label` is spent twice when it is a string
 * and only once when it is not — which is why the entry's own `label` is typed
 * `string` here rather than `ReactNode`, and richer rows go through
 * `renderOption`.
 *
 * **The root's `label` is consumed, not forwarded**, and it is the one machine
 * prop this layer does not pass straight through. `ListboxMachineProps.label` is
 * documented as "the accessible name when no `label` part is rendered" — it lands
 * as an `aria-label` on the root. This layer *does* render the part when given a
 * label, so forwarding it too would name the list twice: an `aria-label` on the
 * root, which wins, and a visible `ListboxLabel` underneath it that a screen
 * reader never reaches. Given none, neither is emitted and the part is not
 * rendered, because an empty label names nothing. A consumer who wants the
 * `aria-label` without visible text reaches for the parts.
 */

import type { ReactNode } from "react";
import type { ComposedDecoration, ComposedGroup } from "../../composed";
import type { PartProps } from "../../create-part";
import {
  ListboxContent,
  ListboxItem,
  ListboxItemGroup,
  ListboxItemGroupLabel,
  ListboxItemIndicator,
  ListboxItemText,
  ListboxLabel,
  ListboxRoot,
  type UseListboxProps,
} from "./listbox";

/** One row. */
export interface ListboxOption<Meta = never> extends ComposedDecoration<Meta> {
  readonly value: string;
  /** Drawn, and what the typeahead matches on — hence `string` and not `ReactNode`. */
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

export type ListboxEntry<Meta = never> = ListboxOption<Meta> | ComposedGroup<ListboxOption<Meta>>;

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 */
type Row<Element extends keyof React.JSX.IntrinsicElements> = Omit<
  PartProps<Element>,
  "id" | "ref" | "aria-labelledby" | "aria-describedby"
>;

export interface ListboxParts {
  readonly label?: PartProps<"span"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
  /** Applied to EVERY group, hence no `id` — the entry's own field. */
  readonly itemGroup?: Row<"div"> | undefined;
  readonly itemGroupLabel?: Row<"span"> | undefined;
  /** Applied to EVERY row, hence no `value`, `label` or `disabled`. */
  readonly item?: Row<"div"> | undefined;
  readonly itemText?: Row<"span"> | undefined;
  readonly itemIndicator?: Row<"span"> | undefined;
}

export interface ListboxComposedProps<Meta = never>
  extends UseListboxProps,
    Omit<PartProps<"div", UseListboxProps>, "children"> {
  readonly options: readonly ListboxEntry<Meta>[];
  /**
   * Replaces a row's contents, and is handed what the layer would have rendered so
   * a consumer can wrap rather than restate. The row itself — its `value`, its
   * selection, its tab stop — stays the layer's.
   */
  readonly renderOption?:
    | ((option: ListboxOption<Meta>, defaults: ReactNode) => ReactNode)
    | undefined;
  readonly parts?: ListboxParts | undefined;
}

export function Listbox<Meta = never>(props: ListboxComposedProps<Meta>): ReactNode {
  const { options, label, renderOption, parts, ...root } = props;

  const row = (option: ListboxOption<Meta>): ReactNode => {
    const defaults = (
      <>
        {option.icon}
        <ListboxItemText {...parts?.itemText}>{option.label}</ListboxItemText>
        <ListboxItemIndicator {...parts?.itemIndicator} />
      </>
    );

    return (
      <ListboxItem
        key={option.value}
        value={option.value}
        label={option.label}
        disabled={option.disabled}
        {...parts?.item}
      >
        {renderOption === undefined ? defaults : renderOption(option, defaults)}
      </ListboxItem>
    );
  };

  return (
    <ListboxRoot {...root}>
      {label == null ? null : <ListboxLabel {...parts?.label}>{label}</ListboxLabel>}
      <ListboxContent {...parts?.content}>
        {options.map((entry) =>
          "options" in entry ? (
            <ListboxItemGroup key={entry.id} id={entry.id} label {...parts?.itemGroup}>
              <ListboxItemGroupLabel {...parts?.itemGroupLabel}>
                {entry.label}
              </ListboxItemGroupLabel>
              {entry.options.map(row)}
            </ListboxItemGroup>
          ) : (
            row(entry)
          ),
        )}
      </ListboxContent>
    </ListboxRoot>
  );
}
