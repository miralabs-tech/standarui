/**
 * `<ToggleGroup options={…}/>` — a root, a label, a sliding indicator, and a row
 * of items, all four of `toggle-group.anatomy.ts`. Unlike `select` or `menu`,
 * `ToggleGroupRoot` renders a real element (`toggle-group.tsx:44-62`, the `root`
 * part), so this is the `Pagination`/`Button` shape — a root plus a collection —
 * never the context-only shape.
 *
 * One translation the type system cannot make on its own, and it is an a11y
 * defect if it is skipped: an item's `label` is **both** the width-reservation
 * text (`data-label`, read by the styles so a selected segment does not widen
 * the whole track — `toggle-group.connect.ts:128-130`) **and** the text the
 * segment shows. `value` stays the item's identity alone — the machine reads
 * item order and selection off it — and is never what names the button. The two
 * are easy to conflate because they are both strings on the same entry; keeping
 * them apart is the entire translation this layer does.
 *
 * `label` at the top is the group's own visible name (`ToggleGroupLabel`,
 * `"Basic"` in the stories), optional and placed only when given — the same
 * shape as `Dialog.closeLabel`: the machine wires `aria-labelledby` on its own
 * once it has read the part off the DOM (`hasLabel`, `toggle-group.dom.ts:51-53`),
 * so a group named some other way (`aria-label`, a `Field`'s legend) simply
 * never gets the part. There is no `icon` slot: the anatomy has one leading
 * track and it is the whole button, not a cell inside it — a segmented control's
 * items are text, exactly as every story here writes them.
 */

import type { ToggleGroupItemProps as CoreToggleGroupItemProps } from "@standarui/core/toggle-group";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { splitProps } from "../../split-props";
import {
  MACHINE_PROPS,
  ToggleGroupFrame,
  ToggleGroupIndicator,
  ToggleGroupItem,
  ToggleGroupLabel,
  ToggleGroupRoot,
  ToggleGroupScrollbar,
  ToggleGroupThumb,
  type UseToggleGroupProps,
} from "./toggle-group";

/**
 * One segment. An intersection, never a `Pick`, so a field added to
 * `ToggleGroupItemProps` shows up here without anyone thinking about it —
 * `label` is narrowed from optional to required, because this is the only place
 * both meanings of it (the drawn text, the reserved width) come from.
 */
export type ToggleGroupOption = Omit<CoreToggleGroupItemProps, "value" | "label"> & {
  readonly value: string;
  readonly label: string;
};

/**
 * The escape hatch, applied **last** on every part: the layer's own defaults are
 * defaults, and the consumer's entry wins over them.
 */
export interface ToggleGroupParts {
  /**
   * The outer box, which is the item of a flex or a grid parent: the layout of the
   * group (`flex: none`, `align-self`, a width) goes here, while `className` and
   * `style` on the group itself stay on the root.
   */
  readonly frame?: PartProps<"div", UseToggleGroupProps> | undefined;
  readonly scrollbar?: PartProps<"div"> | undefined;
  readonly thumb?: PartProps<"div"> | undefined;
  readonly label?: PartProps<"span"> | undefined;
  readonly indicator?: PartProps<"div"> | undefined;
  /**
   * Applied to EVERY item, hence no `value`, `label` or `disabled` — the entry's
   * own fields, excluded through `Own` the way `ToggleGroupItemProps` itself
   * excludes them — and no `id` **or IDREF**: one id repeated down a group is a
   * broken reference per segment, and one `aria-labelledby` repeated gives every
   * segment the same name, which no dangling-IDREF check can see because the id
   * it points at does resolve. `ref` goes for the same reason: a single ref held
   * by N segments ends up holding the last one.
   */
  readonly item?:
    | Omit<
        PartProps<"button", CoreToggleGroupItemProps>,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
}

export interface ToggleGroupComposedProps
  extends UseToggleGroupProps,
    Omit<PartProps<"div", UseToggleGroupProps>, "children"> {
  /**
   * The group's own visible name. The part is placed only when this is given —
   * left out, nothing is added, and the group is named some other way instead
   * (`aria-label`, a `Field`'s legend), exactly as the machine's own
   * `hasLabel` read expects.
   */
  readonly label?: ReactNode;
  readonly options: readonly ToggleGroupOption[];
  readonly parts?: ToggleGroupParts | undefined;
}

export function ToggleGroup(props: ToggleGroupComposedProps): ReactNode {
  const { label, options, parts, ...rest } = props;
  const [machineProps, root] = splitProps(rest, MACHINE_PROPS);

  return (
    <ToggleGroupFrame {...machineProps} {...parts?.frame}>
      <ToggleGroupRoot {...root}>
        {label == null ? null : <ToggleGroupLabel {...parts?.label}>{label}</ToggleGroupLabel>}
        {/* Written first so it paints under the items it slides beneath. */}
        <ToggleGroupIndicator {...parts?.indicator} />
        {options.map((option) => (
          <ToggleGroupItem key={option.value} {...option} {...parts?.item}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroupRoot>
      <ToggleGroupScrollbar {...parts?.scrollbar}>
        <ToggleGroupThumb {...parts?.thumb} />
      </ToggleGroupScrollbar>
    </ToggleGroupFrame>
  );
}
