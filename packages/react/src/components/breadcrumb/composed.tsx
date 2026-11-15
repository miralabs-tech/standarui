/**
 * `<Breadcrumb items={…}/>` — one loop, and two things the layer derives rather
 * than asks for.
 *
 * **The last entry is the current one**, and that is the trail's definition and
 * not a convenience. APG marks the page you are on with `aria-current="page"`, and
 * a trail whose final level still linked somewhere would be a link to the document
 * already open. So the last entry drops its `href` and renders through `<span>` —
 * which stays valid, `aria-current` being a global attribute — exactly as the
 * parts form on the documentation site already wrote by hand. An entry cannot
 * override it: "which level am I on" is positional information, and a second
 * spelling of it would be a way to publish a trail with two current levels or
 * none.
 *
 * **The ellipsis is placed, not listed.** `collapsed` marks the levels that live
 * behind the fold; the button that reveals them belongs immediately before the
 * first of them, and nowhere else. Asking a consumer to interleave it in `items`
 * would let them put it after the fold, or twice, and the machine has no way to
 * refuse either. So the layer finds the first collapsed entry and emits the
 * `Ellipsis` there. A trail with no collapsed entry gets no ellipsis at all, which
 * is what `findIndex` returning `-1` already means.
 *
 * **`flatMap` rather than a fragment around the pair**, for the reason `tabs`
 * gives: `BreadcrumbList` renders an `ol` and screen readers count levels off
 * `ol > li`. A fragment renders no node and would pass the parity comparison, but
 * writing the ellipsis and the item as a unit in the source says they are one
 * level, and they are two.
 */

import type {
  BreadcrumbItemProps as CoreBreadcrumbItemProps,
  BreadcrumbLinkProps as CoreBreadcrumbLinkProps,
} from "@standarui/core/breadcrumb";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  BreadcrumbEllipsis,
  BreadcrumbEllipsisTrigger,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbRoot,
  type UseBreadcrumbProps,
} from "./breadcrumb";

/**
 * The current level renders through this rather than as an anchor. Hoisted to the
 * module so the element is allocated once for every trail on the page — `useRender`
 * clones it, so sharing one is safe.
 */
const CURRENT = <span />;

/** One level of the trail. */
export interface BreadcrumbEntry {
  readonly label: ReactNode;
  /** Where this level points. Ignored on the last entry — see above. */
  readonly href?: string | undefined;
  /** Behind the fold. The reveal button is placed before the first of these. */
  readonly collapsed?: boolean | undefined;
}

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 */
export interface BreadcrumbParts {
  readonly list?: PartProps<"ol"> | undefined;
  readonly ellipsis?: PartProps<"li"> | undefined;
  readonly ellipsisTrigger?: PartProps<"button"> | undefined;
  /**
   * Applied to EVERY level, hence no `collapsed` — the entry's own field, already
   * excluded through `Own` — and no `id` **or IDREF**: one id repeated down a list
   * is a broken reference per level, and one `aria-labelledby` repeated gives every
   * level the same name, which no dangling-IDREF check can see because the id it
   * points at does resolve. `ref` goes because a single ref held by N items ends up
   * holding the last one.
   */
  readonly item?:
    | Omit<
        PartProps<"li", CoreBreadcrumbItemProps>,
        "id" | "ref" | "aria-labelledby" | "aria-describedby"
      >
    | undefined;
  /**
   * Applied to EVERY link, and excluded for the same reasons — plus `href` and
   * `current`, which are the two the layer derives. A fixed `href` here would point
   * every level at one place, and a fixed `current` would publish a trail with as
   * many current levels as it has entries.
   */
  readonly link?:
    | Omit<
        PartProps<"a", CoreBreadcrumbLinkProps>,
        "id" | "ref" | "href" | "current" | "aria-labelledby" | "aria-describedby"
      >
    | undefined;
}

export interface BreadcrumbComposedProps
  extends UseBreadcrumbProps,
    Omit<PartProps<"nav", UseBreadcrumbProps>, "children"> {
  readonly items: readonly BreadcrumbEntry[];
  readonly parts?: BreadcrumbParts | undefined;
}

export function Breadcrumb(props: BreadcrumbComposedProps): ReactNode {
  const { items, parts, ...root } = props;
  const fold = items.findIndex((item) => item.collapsed === true);
  const last = items.length - 1;

  // Extracted rather than written inline. `href` is the natural key and the usual
  // one, but a level is allowed to have none — the current one never does — so the
  // position is the fallback, which is safe for the reason `menu/composed.tsx`
  // gives for its separators: a trail is ordered and does not reorder, and no
  // level holds focus or state that a re-key could move.
  const renderLevel = (item: BreadcrumbEntry, index: number): readonly ReactNode[] => [
    index === fold ? (
      <BreadcrumbEllipsis key="fold" {...parts?.ellipsis}>
        <BreadcrumbEllipsisTrigger {...parts?.ellipsisTrigger} />
      </BreadcrumbEllipsis>
    ) : null,
    <BreadcrumbItem key={item.href ?? `level:${index}`} collapsed={item.collapsed} {...parts?.item}>
      <BreadcrumbLink
        href={index === last ? undefined : item.href}
        current={index === last}
        render={index === last ? CURRENT : undefined}
        {...parts?.link}
      >
        {item.label}
      </BreadcrumbLink>
    </BreadcrumbItem>,
  ];

  return (
    <BreadcrumbRoot {...root}>
      <BreadcrumbList {...parts?.list}>{items.flatMap(renderLevel)}</BreadcrumbList>
    </BreadcrumbRoot>
  );
}
