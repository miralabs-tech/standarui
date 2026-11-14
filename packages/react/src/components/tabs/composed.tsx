/**
 * `<Tabs items={…}/>` — and the first composed layer that places every entry
 * **twice, in two different parents**.
 *
 * Every composed component before this one had a single loop: `select` and
 * `radio-group` place one item per option, `pagination` one cell per page. A tab
 * list has a trigger inside `TabsList` and a panel outside it, both keyed by the
 * same `value`, and the two collections are not interleaved in the markup — the
 * whole list comes first, then the whole set of panels (`ssr.test.tsx:498-510`).
 * So this file loops the same array twice rather than building one tree, and the
 * shape is the anatomy's rather than a choice: `getTriggerEls` reads the list, and
 * a panel written inside it would be a `role="tabpanel"` owned by a
 * `role="tablist"`.
 *
 * **`flatMap` rather than a keyed fragment**, and it is the close button that
 * decides it. A close trigger is a *sibling* of the tab it closes and never its
 * child (`tabs.tsx:164-169`) — a `<button>` may hold no interactive content, and a
 * nested one would hand its click to the tab on the way out, selecting the tab the
 * user just asked to be rid of. A `<Fragment key>` around the pair would render no
 * node and pass the parity comparison, but it would also write the pair as a unit
 * in the source, which is the one thing the anatomy says they are not.
 *
 * **`label` is the text and the reservation, and here that matters more than it
 * does on a segmented control.** `TabsTriggerProps.label` is written to
 * `data-label` so the styles can reserve the width the tab takes at its *selected*
 * weight (`tabs.types.ts:30-36`). Skip it and the tab widens when it is selected —
 * and the indicator, which is measured off the DOM rather than derived from an
 * index (`--sui-indicator-offset`/`-size`), then chases a width it caused itself.
 * So `label` is required on an entry and spent twice, exactly as
 * `toggle-group/composed.tsx` spends its own.
 *
 * **The close trigger asks for no name, and that is the finding worth writing
 * down.** `dialog:close-trigger` and `input:visibility-trigger` have no default
 * accessible name, so a composed layer has to require one or not render the part.
 * This one is not in that family: `getCloseTriggerProps` writes `aria-hidden` and
 * `tabIndex: -1` itself (`tabs.connect.ts:288-291`) because `role="tablist"` may
 * own nothing but `role="tab"`, and the keyboard route to closing is `Delete` on
 * the tab, per APG. A `closeLabel` per entry would therefore be a name nothing
 * ever announces — a slot that reads like a11y and buys none. The part is placed
 * under `closable` and left nameless.
 */

import type {
  TabsCloseTriggerProps as CoreTabsCloseTriggerProps,
  TabsContentProps as CoreTabsContentProps,
  TabsTriggerProps as CoreTabsTriggerProps,
} from "@standarui/core/tabs";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  TabsCloseTrigger,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsScrollbar,
  TabsThumb,
  TabsTrigger,
  type UseTabsProps,
} from "./tabs";

/**
 * One tab and its panel. `value` is the identity the machine reads everything else
 * back off — position, neighbours, the tab stop — and `label` is narrowed from
 * optional to required because this is the only place both of its meanings, the
 * drawn text and the reserved width, come from.
 */
export interface TabsItem {
  readonly value: string;
  readonly label: string;
  /** The panel's content. A tab with an empty panel still has one to point at. */
  readonly content?: ReactNode;
  /** This tab alone. The whole list is disabled by `disabled` on the root. */
  readonly disabled?: boolean | undefined;
}

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 */
export interface TabsParts {
  readonly list?: PartProps<"div"> | undefined;
  readonly indicator?: PartProps<"span"> | undefined;
  readonly scrollbar?: PartProps<"div"> | undefined;
  readonly thumb?: PartProps<"div"> | undefined;
  /**
   * Applied to EVERY tab, hence no `value`, `label` or `disabled` — the entry's
   * own fields, already excluded through `Own` — and no `id` **or IDREF**: one id
   * repeated down a list is a broken reference per tab, and one `aria-labelledby`
   * repeated gives every tab the same name, which no dangling-IDREF check can see
   * because the id it points at does resolve. `aria-controls` goes with them for a
   * sharper reason than the others: the machine writes it only where the panel it
   * names is provably in the same markup (`ssr.test.tsx:494-496`), and a fixed one
   * here would undo exactly that guarantee. `ref` goes because a single ref held
   * by N tabs ends up holding the last one.
   */
  readonly trigger?:
    | Omit<
        PartProps<"button", CoreTabsTriggerProps>,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  /**
   * Applied to EVERY close button, and excluded for the same reasons. The `Own`
   * parameter is not decoration here: `<button>` has a DOM attribute called
   * `value`, typed `string | number | readonly string[]`, and without it the hatch
   * would widen the part's own `value: string` — a spread applied last wins on the
   * type as well as at runtime.
   */
  readonly closeTrigger?:
    | Omit<
        PartProps<"button", CoreTabsCloseTriggerProps>,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
  /** Applied to EVERY panel, and excluded for the same reasons. */
  readonly content?:
    | Omit<
        PartProps<"div", CoreTabsContentProps>,
        "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
      >
    | undefined;
}

export interface TabsComposedProps
  extends UseTabsProps,
    Omit<PartProps<"div", UseTabsProps>, "children"> {
  readonly items: readonly TabsItem[];
  readonly parts?: TabsParts | undefined;
}

export function Tabs(props: TabsComposedProps): ReactNode {
  const { items, parts, ...root } = props;

  return (
    <TabsRoot {...root}>
      <TabsList {...parts?.list}>
        {/* Written first so it paints under the tabs it slides beneath. */}
        <TabsIndicator {...parts?.indicator} />
        {items.flatMap((item) => [
          <TabsTrigger
            key={item.value}
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            {...parts?.trigger}
          >
            {item.label}
          </TabsTrigger>,
          root.closable === true ? (
            <TabsCloseTrigger
              key={`${item.value}:close`}
              value={item.value}
              disabled={item.disabled}
              {...parts?.closeTrigger}
            />
          ) : null,
        ])}
      </TabsList>
      <TabsScrollbar {...parts?.scrollbar}>
        <TabsThumb {...parts?.thumb} />
      </TabsScrollbar>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value} {...parts?.content}>
          {item.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}
