/**
 * `<EmptyState title="…"/>` — the placeholder in one node, and the layer with the
 * least behaviour in the library: there is no machine under it at all.
 *
 * The core's `empty-state.ts` is a `connect` and nothing else — two props in, five
 * attribute bags out, no service, no ids, no events. So this module forwards
 * `variant` and `announce` untouched and decides exactly one thing: which of the
 * five parts exist. That is also the whole of what a consumer gets wrong writing
 * the parts by hand, because the vertical rhythm lives on the *optional* parts'
 * own margins (`_empty-state.scss`) — so a part placed empty is not free, it is a
 * gap.
 *
 * **`title` is required, and it is the placeholder's only voice.**
 * `getTitleProps` writes no ARIA whatsoever — the semantics is the `h2` the part
 * renders — and the root carries no `aria-labelledby` to fall back on, unlike
 * `dialog`, whose machine names its surface from `label` when it has read no title
 * part. The indicator is `aria-hidden` by the machine's own hand and the
 * description is prose. A title-less empty state is therefore a decorative box,
 * and under `announce` it is a `role="status"` region that announces nothing when
 * it appears. `ReactNode` alone admitted exactly that — `title={loaded && "No
 * results"}` typechecked its way to it — so `null`, `undefined` and `false` are
 * excluded from the slot.
 *
 * **The element's own `title` is omitted rather than shadowed.** A `div` carries
 * `title?: string`, the native tooltip, and an interface cannot narrow an
 * inherited member to an incompatible type. Given the two, this form keeps the
 * heading: a placeholder wants words on screen, not on hover. A consumer who does
 * want the attribute writes the parts, where `EmptyStateRoot` still takes it.
 *
 * **`icon` is withheld when it is absent, and that is a layout fact rather than a
 * taste.** The sheet gives `empty-state:indicator` `--sui-empty-state-symbol-size`
 * on both axes and a `margin-block-end` of `--sui-space-4`, and it draws
 * **nothing** under `:empty` — there is no default glyph here, unlike
 * `collapsible:indicator` and its chevron. Placed unconditionally, the part is a
 * sized hole above the title followed by a margin belonging to a symbol that is
 * not there. `false` is refused beside `null` and `undefined` because
 * `icon={hasSymbol && <Icon/>}` is how the condition gets written and React
 * renders `false` as nothing at all. `actions` is guarded the same way for the
 * milder version of the same reason: that row has a `margin-block-start` and no
 * content of its own.
 *
 * **`actions` is a `ReactNode` and not a `readonly ComposedAction[]`**, which is
 * the one place this layer parts company with `dialog`. The anatomy has five parts
 * and `actions` is the last of them: there is no `empty-state:action-trigger` for
 * an `onPress`, a `cancel` or a `destructive` to land on. Translating a list of
 * labels into buttons would mean this module choosing their component and minting
 * their ids — inventing a part rather than placing one. So the buttons stay the
 * consumer's, and the sheet lays the row out around them (wrapping flex, centred,
 * `--sui-space-gap-stack`).
 *
 * **There is no `children` slot.** The root is a grid whose spacing lives on those
 * optional margins, so a raw child would take a row with no margin rule at all —
 * and the layer may not wrap it, because a wrapper is not a part. Prose belongs in
 * `description`, controls in `actions`.
 */

import type { EmptyStateMachineProps } from "@standarui/core/empty-state";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIndicator,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./empty-state";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it. Four keys for the four parts
 * below the root — the root's own props are the rest of `EmptyStateComposedProps`,
 * which is why it has no key here.
 *
 * No `Omit` of `id` or of the IDREFs, unlike the collections: each of these parts
 * is placed once, so a fixed id is a fixed id and not the same one repeated down a
 * list. There are no IDREFs to break in any case — this component writes none.
 */
export interface EmptyStateParts {
  readonly indicator?: PartProps<"div"> | undefined;
  readonly title?: PartProps<"h2"> | undefined;
  readonly description?: PartProps<"p"> | undefined;
  readonly actions?: PartProps<"div"> | undefined;
}

export interface EmptyStateComposedProps
  extends EmptyStateMachineProps,
    Omit<PartProps<"div", EmptyStateMachineProps>, "children" | "title"> {
  /**
   * The symbol above the title — an inline SVG, never a text character. Left out,
   * the indicator part is not placed at all, which is the third
   * configuration (title and description alone) and not a `variant` value.
   */
  readonly icon?: ReactNode;
  /**
   * What the placeholder says, and required for that reason — see above. Always
   * placed, so the heading is what a reader and a screen reader both get.
   */
  readonly title: Exclude<ReactNode, null | undefined | boolean>;
  /** The sentence under it: why the container is empty, or what would fill it. */
  readonly description?: ReactNode;
  /**
   * The row of ways out — the consumer's own buttons or links, in document order.
   * Not a list of labels: there is no action-trigger part here for the library to
   * place them on.
   */
  readonly actions?: ReactNode;
  readonly parts?: EmptyStateParts | undefined;
}

export function EmptyState(props: EmptyStateComposedProps): ReactNode {
  const { icon, title, description, actions, parts, ...root } = props;

  return (
    <EmptyStateRoot {...root}>
      {/* `false` alongside `null`: the sheet sizes this box and draws nothing in
          it, so a falsy `icon` would place a hole and its margin. */}
      {icon == null || icon === false ? null : (
        <EmptyStateIndicator {...parts?.indicator}>{icon}</EmptyStateIndicator>
      )}
      <EmptyStateTitle {...parts?.title}>{title}</EmptyStateTitle>
      {description == null ? null : (
        <EmptyStateDescription {...parts?.description}>{description}</EmptyStateDescription>
      )}
      {/* Same guard, milder cause: an empty row is `--sui-space-4` of dead space
          under the description rather than a sized box. */}
      {actions == null || actions === false ? null : (
        <EmptyStateActions {...parts?.actions}>{actions}</EmptyStateActions>
      )}
    </EmptyStateRoot>
  );
}
