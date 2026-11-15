/**
 * `<Button>` — the bare name beside the parts, and the smallest composed layer
 * there is: one root, three slots, no collection.
 *
 * The gain is not the icon slot. It is `loading`: `ButtonRoot` alone already says
 * `aria-busy` and carries `data-loading`, and then draws nothing, because the
 * spinner is a part — so a consumer who set `loading` and forgot
 * `ButtonLoadingIndicator` got a busy button with no sign of it. Here the part
 * comes with the flag, empty, and `_button.scss` draws the ring under `::after`.
 *
 * `render` and `asChild` travel in `rest` untouched, and that is behaviour rather
 * than passthrough sugar: `ButtonRoot` infers `nativeButton` from the element it
 * is about to render, which is what earns a substituted `<a>` its `role="button"`
 * and its synthesised Enter/Space.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { ButtonLoadingIndicator, ButtonRoot, type UseButtonProps } from "./button";

export interface ButtonComposedProps
  extends UseButtonProps,
    Omit<PartProps<"button", UseButtonProps>, "children"> {
  /** The label. Text, and text is the only thing that names a button. */
  readonly children?: ReactNode;
  /** The leading glyph — an inline SVG, never a text character. */
  readonly icon?: ReactNode;
  /** The trailing one: a chevron, a shortcut, a count. */
  readonly accessory?: ReactNode;
}

export function Button(props: ButtonComposedProps): ReactNode {
  const { children, icon, accessory, ...rest } = props;

  return (
    <ButtonRoot {...rest}>
      {icon}
      {children}
      {accessory}
      {/* Last, and the order is not layout: the indicator is `position: absolute;
          inset: 0` over the whole root, so where it sits among the children moves
          nothing on screen. Last is where the `States` story puts it, and it keeps
          the label first in the DOM for anything reading the source order. */}
      {rest.loading === true ? <ButtonLoadingIndicator /> : null}
    </ButtonRoot>
  );
}
