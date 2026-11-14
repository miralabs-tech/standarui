/**
 * `<RadioGroup options={…}/>` — a flat collection: one root, one optional label,
 * one optional sliding highlight, and a single loop over `options`. Every entry
 * renders `RadioGroupItem > RadioGroupItemHiddenInput + RadioGroupItemControl +
 * RadioGroupItemText`, in that order — the same order `ssr.test.tsx` pins.
 *
 * A `{ separator: true }` entry is a `SeparatorRoot`, borrowed from the standalone
 * component rather than re-implemented: `radio-group.anatomy.ts` has no
 * `separator` part of its own, and `checkbox-group`'s composed layer (this same
 * wave, `checkbox-group/composed.tsx`) already crosses that exact boundary for
 * the same reason. `ComposedGroup`, on the other hand, has no home here — a
 * labelled sub-group needs a group-label part to point `aria-labelledby` at, the
 * way `SelectItemGroupLabel` is for `select`, and this anatomy has none (root,
 * label, item, itemControl, itemText, itemHiddenInput, indicator — seven, and
 * none of them is a second label). `checkbox-group` draws the identical line for
 * the identical reason. Inventing an unlabelled wrapper `<div>` to fake one would
 * be the one thing rule 2 forbids, so this stays reported rather than worked
 * around.
 *
 * `label` is required on an option, and it is not a narrowing of an optional
 * core field the way `SelectOption.label` is: `RadioItemProps` (core) carries
 * only `value` and `disabled` — a radio's value is opaque to the machine, and the
 * text a person reads comes from nowhere but `RadioGroupItemText`'s children. An
 * option with none would be a `role="radio"` with no accessible name, so this is
 * the one field that has to be there rather than merely defaulted.
 */

import type { RadioItemProps as CoreRadioItemProps } from "@standarui/core/radio-group";
import type { ReactNode } from "react";
import type { ComposedSeparator } from "../../composed";
import type { PartProps } from "../../create-part";
import { SeparatorRoot } from "../separator/separator";
import {
  RadioGroupIndicator,
  RadioGroupItem,
  RadioGroupItemControl,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupLabel,
  RadioGroupRoot,
  type UseRadioGroupProps,
} from "./radio-group";

/**
 * An option is the core's own item shape — `disabled`, nothing else — plus the
 * two fields no machine owns: the text, and the consumer's payload.
 */
export type RadioGroupOption<V extends string = string, Meta = never> = Omit<
  CoreRadioItemProps,
  "value"
> & {
  readonly value: V;
  readonly label: string;
  /** Handed back untouched to `renderOption`. Erased at emit, so it costs nothing. */
  readonly meta?: Meta | undefined;
};

/** Narrowed structurally — `"separator" in entry` — the test `Select` already uses. */
export type RadioGroupEntry<V extends string = string, Meta = never> =
  | RadioGroupOption<V, Meta>
  | ComposedSeparator;

export interface RadioGroupComposedProps<V extends string = string, Meta = never>
  extends UseRadioGroupProps,
    Omit<PartProps<"div", UseRadioGroupProps>, "children"> {
  readonly options: readonly RadioGroupEntry<V, Meta>[];
  /** The group's own name. Renders `RadioGroupLabel` only when given — a `Field` above names it otherwise. */
  readonly label?: ReactNode;
  /** The sliding highlight behind the selected item. Off by default, as in the plain-radio story. */
  readonly indicator?: boolean | undefined;
  /**
   * Replaces the CHILDREN of an item, never the item. `defaults` is the row the
   * layer would have rendered — hidden input, control, text — handed over so
   * that decorating is the cheapest thing to do.
   *
   * What replacing costs, in full: the part that names the option
   * (`RadioGroupItemText`), and the part that draws the selected disc
   * (`RadioGroupItemControl`). Dropping the input itself leaves the row
   * unreachable — the arrows and their arrow-to-select are the browser's, the
   * tab stop is written by the group, and all of them live on it.
   *
   * The focus ring is NOT among the costs, and it used to be: it is painted by
   * `RadioGroupItemControl`, so a row drawn without one took focus with nothing
   * marking it. The sheet now rings the row itself when that part is absent.
   *
   * This list is longer than the one it replaces even so. That one named the
   * accessible name and stopped there, and the silence about the rest is what
   * kept the missing ring invisible for as long as it was.
   */
  readonly renderOption?:
    | ((option: RadioGroupOption<V, Meta>, defaults: ReactNode) => ReactNode)
    | undefined;
}

function renderItem<V extends string, Meta>(
  option: RadioGroupOption<V, Meta>,
  render: ((option: RadioGroupOption<V, Meta>, defaults: ReactNode) => ReactNode) | undefined,
): ReactNode {
  const { meta, label, ...item } = option;
  const defaults = (
    <>
      <RadioGroupItemHiddenInput />
      <RadioGroupItemControl />
      <RadioGroupItemText>{label}</RadioGroupItemText>
    </>
  );

  return (
    <RadioGroupItem key={option.value} {...item}>
      {render === undefined ? defaults : render(option, defaults)}
    </RadioGroupItem>
  );
}

export function RadioGroup<V extends string = string, Meta = never>(
  props: RadioGroupComposedProps<V, Meta>,
): ReactNode {
  const { options, label, indicator, renderOption, ...root } = props;

  return (
    <RadioGroupRoot {...root}>
      {label == null ? null : <RadioGroupLabel>{label}</RadioGroupLabel>}
      {indicator === true ? <RadioGroupIndicator /> : null}
      {options.map((entry, index) => {
        // A separator holds no value to key on and no state to preserve across a
        // re-render — the same reasoning `Select`'s composed layer states for its
        // own separators.
        if ("separator" in entry) {
          // biome-ignore lint/suspicious/noArrayIndexKey: safe on a separator, and on nothing else in this list — see above.
          return <SeparatorRoot key={`sep:${index}`} />;
        }
        return renderItem(entry, renderOption);
      })}
    </RadioGroupRoot>
  );
}
