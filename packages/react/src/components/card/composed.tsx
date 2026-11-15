/**
 * `<Card title="…">…</Card>` — seven parts placed by their conditions, over the
 * one component here that has no machine at all: the core's `card.ts` builds no
 * service and holds a single module-level `connect`, so what a consumer saves is
 * never state. It is the placement rules the anatomy leaves to whoever assembles
 * it, and every one of them is a rule about an **absent** node.
 *
 * **A part is placed only when its slot holds something, and that is layout
 * rather than tidiness.** `card:root` is a flex column with a `gap`, so an empty
 * part is not an invisible node — it is a gap row. The header is the sharpest
 * case: `_card.scss` reserves its second column through
 * `:has([data-part~="card:action"])`, so a header rendered around nothing spends
 * a stack gap and reserves no gutter for the button that is not there. Hence the
 * disjunction — the header exists exactly when one of the three nodes inside it
 * does.
 *
 * **A falsy slot counts as absent, `false` included.** `children={rows.length > 0
 * && <Rows/>}` is the shape everybody writes and React renders `false` as
 * nothing, so a `!= null` guard alone would wrap it in `card:body` and buy the
 * gap row the paragraph above is about.
 *
 * **`title` admits neither `null` nor `false`, and that is an accessibility fact
 * rather than a taste.** `CardTitle` renders an `h3` — a card is a repeated unit
 * inside a page rather than a window-level surface, and the level is corrected
 * per context through `parts.title.render` — so a title slot that resolves to
 * nothing is an empty heading, which is what axe calls `empty-heading`.
 * `ReactNode` alone admits both, so `title={row.name && …}` typechecked its way
 * there. The empty *string* cannot be excluded by a type (`Exclude<string, "">`
 * is still `string`) and this layer ships no dev warning, so `title=""` is left
 * where the type ends.
 *
 * **The HTML `title` attribute is unreachable from the composed root**, and it is
 * the one thing the parts form can do that this cannot. `HTMLAttributes` carries
 * a global `title?: string`; a `ReactNode` slot of the same name on an interface
 * that inherits it is an incompatible override at the declaration site, so the
 * inherited one is omitted here. A card that needs the tooltip attribute writes
 * `CardRoot` and places its own parts.
 *
 * **No `parts.root` key.** The root's props *are* the composed props — `variant`,
 * `className`, `render`, `asChild` and every `div` attribute travel in the rest —
 * so a second door onto the same element would only be a way to disagree with the
 * first. Nothing here claims an ARIA role either: `connect` writes `data-variant`
 * and nothing else, because no APG pattern exists for a card and its semantics
 * come from whatever is composed inside it.
 */

import type { CardMachineProps } from "@standarui/core/card";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  CardAction,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./card";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it. No `Omit` of `id` or of the
 * IDREFs, unlike the collections: each of these six parts is placed at most once
 * per card, so a fixed id is a fixed id and not the same one repeated down a
 * list.
 */
export interface CardParts {
  readonly header?: PartProps<"div"> | undefined;
  readonly title?: PartProps<"h3"> | undefined;
  readonly description?: PartProps<"p"> | undefined;
  readonly action?: PartProps<"div"> | undefined;
  readonly body?: PartProps<"div"> | undefined;
  readonly footer?: PartProps<"div"> | undefined;
}

export interface CardComposedProps
  extends CardMachineProps,
    Omit<PartProps<"div", CardMachineProps>, "children" | "title"> {
  /**
   * The heading, and the one slot no condition can rescue: `null` and `false` are
   * excluded because the part they would empty is an `h3` — see above.
   */
  readonly title?: Exclude<ReactNode, null | boolean>;
  /** The line under the heading, in the same column. */
  readonly description?: ReactNode;
  /**
   * What sits in the header's second column, spanning both its rows — an icon
   * button, most often. Placed as `CardAction`'s children rather than handed to a
   * `render`: `card:action` is a `div`, so a control nested inside it is a control
   * inside a plain box rather than a button inside a button.
   */
  readonly action?: ReactNode;
  /** The body. */
  readonly children?: ReactNode;
  /** The row of controls the sheet pins to the bottom of the surface. */
  readonly footer?: ReactNode;
  readonly parts?: CardParts | undefined;
}

/**
 * Absent, in the sense every guard below needs: `false` is what a `cond && …`
 * slot resolves to, and a part wrapped around it is an empty box on a surface
 * whose every gap is a real one.
 */
const given = (slot: ReactNode): boolean => slot != null && slot !== false;

export function Card(props: CardComposedProps): ReactNode {
  const { title, description, action, children, footer, parts, ...root } = props;

  return (
    <CardRoot {...root}>
      {given(title) || given(description) || given(action) ? (
        <CardHeader {...parts?.header}>
          {/* The order is the grid's: only the action is placed explicitly, in
              column 2 across both rows, so the title and the description land in
              column 1 by auto-flow — which holds only while they precede it. */}
          {given(title) ? <CardTitle {...parts?.title}>{title}</CardTitle> : null}
          {given(description) ? (
            <CardDescription {...parts?.description}>{description}</CardDescription>
          ) : null}
          {given(action) ? <CardAction {...parts?.action}>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      {given(children) ? <CardBody {...parts?.body}>{children}</CardBody> : null}
      {given(footer) ? <CardFooter {...parts?.footer}>{footer}</CardFooter> : null}
    </CardRoot>
  );
}
