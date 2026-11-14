/**
 * `<Toggle>` — the same fork as `<Button>`, one part shorter: a root and a single
 * indicator, no loading state and no accessory. `children` and `icon` both land in
 * `ToggleIndicator`, in that order, because the indicator is the only part this
 * machine has to name itself with — a toggle with an icon and no `aria-label` is
 * still nameless, exactly as `IconOnly` in the stories documents.
 *
 * `render` and `asChild` travel in `rest` untouched, same as `ButtonRoot`.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { ToggleIndicator, ToggleRoot, type UseToggleProps } from "./toggle";

export interface ToggleComposedProps
  extends UseToggleProps,
    Omit<PartProps<"button", UseToggleProps>, "children"> {
  /** The label. Text, and text is the only thing that names a toggle by default. */
  readonly children?: ReactNode;
  /** The glyph — an inline SVG, never a text character. Pair it with `aria-label` alone. */
  readonly icon?: ReactNode;
}

export function Toggle(props: ToggleComposedProps): ReactNode {
  const { children, icon, ...rest } = props;

  return (
    <ToggleRoot {...rest}>
      <ToggleIndicator>
        {icon}
        {children}
      </ToggleIndicator>
    </ToggleRoot>
  );
}
