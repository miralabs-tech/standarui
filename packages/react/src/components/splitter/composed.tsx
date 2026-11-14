import { Fragment, type ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { SplitterHandle, SplitterPanel, SplitterRoot, type UseSplitterProps } from "./splitter";

export interface SplitterParts {
  readonly panel?: PartProps<"div"> | undefined;
  readonly handle?: PartProps<"div"> | undefined;
}

export interface SplitterComposedProps extends UseSplitterProps {
  readonly children?: ReactNode;
  readonly parts?: SplitterParts | undefined;
}

export function Splitter(props: SplitterComposedProps): ReactNode {
  const { children, parts, ...rest } = props;
  // Keyed, so a `panelSide` changed at runtime moves the handle instead of
  // remounting it and dropping its focus.
  const handle = <SplitterHandle key="handle" {...parts?.handle} />;
  const content = <Fragment key="content">{children}</Fragment>;
  const leading = rest.panelSide === "end";

  return (
    <SplitterRoot {...rest}>
      <SplitterPanel {...parts?.panel}>
        {leading ? [handle, content] : [content, handle]}
      </SplitterPanel>
    </SplitterRoot>
  );
}
