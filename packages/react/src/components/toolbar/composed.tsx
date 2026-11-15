/**
 * `<Toolbar items={…}/>` — one loop over five entry shapes, narrowed
 * structurally: `"separator" in entry`, `"spacer" in entry`, `"options" in entry`,
 * a title when there is no `value`, and an action otherwise. The title is told from
 * an action by the one field an action cannot be without, never by `title`, which is
 * also an HTML attribute a consumer may well write on a stop. No `kind` field, the
 * same rule `menu` and `select` already follow.
 *
 * **`value` is required on an action**, where the part defaults it. `ToolbarItem`
 * falls back to a `useId` when given none, which is right for a bar written by
 * hand — a stop still needs an identity and inventing one is better than
 * refusing. It is wrong here for two reasons at once: the identity would be
 * allocated fresh on a render that reorders the array, and this layer also needs a
 * React key, which cannot come from `label` because `label` is a `ReactNode`. One
 * required string answers both, and the second is the one that would have been
 * discovered late.
 *
 * **A group is `aria-label`, not a label part**, and this is the one place
 * `ComposedGroup`'s contract does not transfer. Elsewhere the group's own `label`
 * prop is a *boolean* pointing an `aria-labelledby` at a label part the layer must
 * render — `SelectItemGroup`, `MenuItemGroup`. `ToolbarGroup` has no such part and
 * no such prop: it is a plain cluster whose name is an attribute. So the shape is
 * borrowed for its fields and its `id` still pins the key, but the label lands on
 * the group itself.
 *
 * **`render` per entry rather than one `renderItem` for the bar.** A toolbar's
 * stops are heterogeneous by nature — the documentation site's own bar composes
 * three `ToggleRoot`s, two `ButtonRoot`s and a share button in a single row — so
 * the substitution belongs to the entry, exactly as `ComposedTrigger` puts it on
 * the trigger. A single `render*` for the whole bar would have to switch on the
 * entry to give the same result, which is the loop this file already is.
 */

import type { ReactElement, ReactNode } from "react";
import type { ComposedDecoration, ComposedGroup, ComposedSeparator } from "../../composed";
import type { PartProps } from "../../create-part";
import {
  ToolbarGroup,
  ToolbarItem,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSpacer,
  ToolbarTitle,
  type UseToolbarProps,
} from "./toolbar";

/** One stop of the roving order. */
export interface ToolbarAction<Meta = never> extends ComposedDecoration<Meta> {
  /** The stop's identity, and this layer's key. Required — see above. */
  readonly value: string;
  readonly label: ReactNode;
  /**
   * The control this stop *is*, handed to the part's `render` — never wrapped by
   * it. `ToolbarItem` is the focusable itself, so a control nested inside one
   * would leave the bar roving over an element the browser cannot focus.
   */
  readonly render?: ReactElement | undefined;
  readonly disabled?: boolean | undefined;
  /** Refused: `title` is the key of the title entry, never an attribute of a stop. */
  readonly title?: never;
}

/** What pushes everything after it to the far edge. */
export interface ToolbarSpacerEntry {
  readonly spacer: true;
}

/** The title of a navigation bar, in the row of controls or large under it. */
export interface ToolbarTitleEntry {
  readonly title: ReactNode;
  readonly size?: "inline" | "large" | undefined;
  readonly label?: never;
}

export type ToolbarEntry<Meta = never> =
  | ToolbarAction<Meta>
  | ComposedSeparator
  | ToolbarSpacerEntry
  | ToolbarTitleEntry
  | ComposedGroup<ToolbarAction<Meta>>;

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 */
export interface ToolbarParts {
  readonly group?: Omit<PartProps<"div">, "id" | "ref" | "aria-label"> | undefined;
  readonly separator?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly spacer?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly title?: Omit<PartProps<"h1">, "id" | "ref"> | undefined;
  /**
   * Applied to EVERY stop, hence no `value` — the entry's own field — and no `id`
   * **or IDREF**: one id repeated down a bar is a broken reference per stop, and
   * one `aria-labelledby` repeated gives every stop the same name, which no
   * dangling-IDREF check can see because the id it points at does resolve. `ref`
   * goes because a single ref held by N stops ends up holding the last one, and
   * `render` because the substitution is the entry's.
   */
  readonly item?:
    | Omit<
        PartProps<"button">,
        "id" | "ref" | "render" | "value" | "aria-labelledby" | "aria-describedby"
      >
    | undefined;
}

export interface ToolbarComposedProps<Meta = never>
  extends UseToolbarProps,
    Omit<PartProps<"div", UseToolbarProps>, "children"> {
  readonly items: readonly ToolbarEntry<Meta>[];
  readonly parts?: ToolbarParts | undefined;
}

export function Toolbar<Meta = never>(props: ToolbarComposedProps<Meta>): ReactNode {
  const { items, parts, ...root } = props;

  const stop = (action: ToolbarAction<Meta>): ReactNode => (
    <ToolbarItem
      key={action.value}
      value={action.value}
      disabled={action.disabled}
      render={action.render}
      {...parts?.item}
    >
      {action.icon}
      {action.label}
    </ToolbarItem>
  );

  // Extracted rather than written inline, and keyed on the position, exactly as
  // `menu/composed.tsx` keys its own separators: neither a rule nor a spacer is
  // focusable, holds state or has a subtree to unmount, so a position key costs
  // nothing here where one on a stop would move the focus mid-interaction — the
  // collection being the live DOM the machine reads.
  const renderEntry = (entry: ToolbarEntry<Meta>, index: number): ReactNode => {
    if ("separator" in entry) {
      return <ToolbarSeparator key={`rule:${index}`} {...parts?.separator} />;
    }
    if ("spacer" in entry) {
      return <ToolbarSpacer key={`gap:${index}`} {...parts?.spacer} />;
    }
    if ("options" in entry) {
      return (
        <ToolbarGroup key={entry.id} aria-label={entry.label} {...parts?.group}>
          {entry.options.map(stop)}
        </ToolbarGroup>
      );
    }
    if (!("value" in entry)) {
      return (
        <ToolbarTitle key={`title:${index}`} size={entry.size} {...parts?.title}>
          {entry.title}
        </ToolbarTitle>
      );
    }
    return stop(entry);
  };

  return <ToolbarRoot {...root}>{items.map(renderEntry)}</ToolbarRoot>;
}
