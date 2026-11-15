/**
 * `<Collapsible label="…">…</Collapsible>` — four nodes, no collection, and the
 * layer's clearest case of a composed form that already existed in the wild.
 *
 * The documentation site had written this exact function by hand
 * (`apps/docs/demos/collapsible-basic.tsx`, a local `Disclosure` taking a `label`
 * and children) before the composed layer reached this component. That is the
 * argument for the shape rather than a coincidence: when the only way to use the
 * parts is to first write the same four-node wrapper, the wrapper is the API.
 *
 * **`label` is required, and it is an accessibility fact rather than a taste.**
 * `CollapsibleTrigger` has no default accessible name — `getTriggerProps` writes
 * the `aria-expanded`/`aria-controls` pair and nothing that names the button. A
 * disclosure whose trigger is empty is a nameless button in the tab order, so the
 * name comes from the consumer or the part is not rendered, and there is no
 * useful disclosure without its trigger. Compare `checkbox`, where `label` is
 * optional because a `Field` above it can name the box through the native
 * `label[for]` the root already wires; nothing plays that role here.
 *
 * **The indicator is placed unconditionally**, and it is the one node here that
 * costs nothing to a consumer who does not want it. `getIndicatorProps` writes
 * `aria-hidden`, so it is never announced, and the sheet draws the chevron under
 * `:where(:empty)` — the same rule `checkbox` and `pagination` use — so an empty
 * span is the affordance rather than a placeholder for one. A consumer who wants
 * their own glyph puts it in `parts.indicator`, and the `:empty` guard steps
 * aside on its own.
 *
 * **`children` is the panel, not the root's slot.** What the root contains is the
 * two parts below, hardcoded; the consumer's children belong to the content. So
 * `children` is excluded from the root's props and re-declared for the panel,
 * exactly as `checkbox` excludes it outright.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleRoot,
  CollapsibleTrigger,
  type UseCollapsibleProps,
} from "./collapsible";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it. No `Omit` of `id` or of the
 * IDREFs here, unlike the collections: each of these three parts is placed once,
 * so a fixed id is a fixed id and not the same one repeated down a list.
 */
export interface CollapsibleParts {
  readonly trigger?: PartProps<"button"> | undefined;
  readonly indicator?: PartProps<"span"> | undefined;
  readonly content?: PartProps<"div"> | undefined;
}

export interface CollapsibleComposedProps
  extends UseCollapsibleProps,
    Omit<PartProps<"div", UseCollapsibleProps>, "children"> {
  /** Names the trigger. Required — see above. */
  readonly label: ReactNode;
  /** The panel's content. */
  readonly children?: ReactNode;
  readonly parts?: CollapsibleParts | undefined;
}

export function Collapsible(props: CollapsibleComposedProps): ReactNode {
  const { label, children, parts, ...root } = props;

  return (
    <CollapsibleRoot {...root}>
      <CollapsibleTrigger {...parts?.trigger}>
        <CollapsibleIndicator {...parts?.indicator} />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent {...parts?.content}>{children}</CollapsibleContent>
    </CollapsibleRoot>
  );
}
