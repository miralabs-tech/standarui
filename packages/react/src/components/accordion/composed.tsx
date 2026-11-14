/**
 * `<Accordion items={…}/>` — one loop, six nodes per section, and the second
 * composed layer whose hand-written twin was already on the documentation site
 * (`apps/docs/demos/accordion-basic.tsx` had a local `Panels`).
 *
 * **`value` is required, and it is the machine's identity rather than a key.**
 * `AccordionItem` reads position, neighbours and arrow reachability back off the
 * DOM keyed by this string — nothing here is derived from the array's order — so
 * an entry without one would be an item the machine cannot address. It doubles as
 * the React key, which is why `label` being a `ReactNode` costs nothing.
 *
 * **The indicator is placed unconditionally and rendered empty**, which is a
 * change this wave made rather than a fact it found: `_accordion.scss` now draws
 * the chevron under `:where(:empty)`, the same polygon as `_collapsible.scss`.
 * Before that the sheet rotated a box the consumer had to fill, and a composed
 * layer had no way to fill it without a slot outside the closed vocabulary. A
 * consumer who wants their own glyph puts it in `parts.indicator`, and the
 * `:empty` guard steps aside on its own.
 *
 * **`AccordionHeader` stays an `h3`**, and the layer does not offer to change it.
 * The heading level is a fact about the consumer's document outline, not about
 * the accordion; `parts.header` carries `render={<h2/>}` for the page that needs
 * it, which is the same answer the parts form gives and one this layer would only
 * have restated.
 *
 * **Content and body are both placed**, never collapsed into one. The content is
 * the box whose height animates and therefore carries no padding; the body is
 * where the padding lives, which is what makes `content.scrollHeight` a usable
 * number. A layer that emitted only one of them would animate to the wrong height
 * and look like an easing bug.
 */

import type { ReactNode } from "react";
import type { ComposedDecoration } from "../../composed";
import type { PartProps } from "../../create-part";
import {
  AccordionBody,
  AccordionContent,
  AccordionHeader,
  AccordionIndicator,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
  type UseAccordionProps,
} from "./accordion";

/** One section. */
export interface AccordionSection<Meta = never> extends ComposedDecoration<Meta> {
  /** The machine's identity for this section, and this layer's key. */
  readonly value: string;
  readonly label: ReactNode;
  /** The panel's content. A section with an empty panel still has one to point at. */
  readonly content?: ReactNode;
  /** This section alone. The whole accordion is disabled by `disabled` on the root. */
  readonly disabled?: boolean | undefined;
}

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it.
 *
 * Every key here reaches EVERY section, hence no `value` or `disabled` — the
 * entry's own fields — and no `id` **or IDREF**: one id repeated down a list is a
 * broken reference per section, and one `aria-labelledby` repeated gives every
 * section the same name, which no dangling-IDREF check can see because the id it
 * points at does resolve. `ref` goes because a single ref held by N sections ends
 * up holding the last one.
 */
type Shared<Element extends keyof React.JSX.IntrinsicElements> = Omit<
  PartProps<Element>,
  "id" | "ref" | "aria-labelledby" | "aria-describedby" | "aria-controls"
>;

export interface AccordionParts {
  readonly item?: Shared<"div"> | undefined;
  /** `render={<h2/>}` lands here — see above. */
  readonly header?: Shared<"h3"> | undefined;
  readonly trigger?: Shared<"button"> | undefined;
  readonly indicator?: Shared<"span"> | undefined;
  readonly content?: Shared<"div"> | undefined;
  readonly body?: Shared<"div"> | undefined;
}

export interface AccordionComposedProps<Meta = never>
  extends UseAccordionProps,
    Omit<PartProps<"div", UseAccordionProps>, "children"> {
  readonly items: readonly AccordionSection<Meta>[];
  readonly parts?: AccordionParts | undefined;
}

export function Accordion<Meta = never>(props: AccordionComposedProps<Meta>): ReactNode {
  const { items, parts, ...root } = props;

  return (
    <AccordionRoot {...root}>
      {items.map((section) => (
        <AccordionItem
          key={section.value}
          value={section.value}
          disabled={section.disabled}
          {...parts?.item}
        >
          <AccordionHeader {...parts?.header}>
            <AccordionTrigger {...parts?.trigger}>
              <AccordionIndicator {...parts?.indicator} />
              {section.icon}
              {section.label}
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent {...parts?.content}>
            <AccordionBody {...parts?.body}>{section.content}</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      ))}
    </AccordionRoot>
  );
}
