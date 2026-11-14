import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  type UseScrollAreaProps,
} from "./scroll-area";

export interface ScrollAreaParts {
  readonly viewport?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly content?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly scrollbar?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly thumb?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
  readonly corner?: Omit<PartProps<"div">, "id" | "ref"> | undefined;
}

export interface ScrollAreaComposedProps
  extends UseScrollAreaProps,
    Omit<PartProps<"div", UseScrollAreaProps>, "children"> {
  readonly children?: ReactNode;
  readonly parts?: ScrollAreaParts | undefined;
}

export function ScrollArea(props: ScrollAreaComposedProps): ReactNode {
  const { children, parts, ...root } = props;
  const vertical = root.orientation !== "horizontal";
  const horizontal = root.orientation === "horizontal" || root.orientation === "both";

  return (
    <ScrollAreaRoot {...root}>
      <ScrollAreaViewport {...parts?.viewport}>
        <ScrollAreaContent {...parts?.content}>{children}</ScrollAreaContent>
      </ScrollAreaViewport>
      {vertical ? (
        <ScrollAreaScrollbar orientation="vertical" {...parts?.scrollbar}>
          <ScrollAreaThumb orientation="vertical" {...parts?.thumb} />
        </ScrollAreaScrollbar>
      ) : null}
      {horizontal ? (
        <ScrollAreaScrollbar orientation="horizontal" {...parts?.scrollbar}>
          <ScrollAreaThumb orientation="horizontal" {...parts?.thumb} />
        </ScrollAreaScrollbar>
      ) : null}
      {root.orientation === "both" ? <ScrollAreaCorner {...parts?.corner} /> : null}
    </ScrollAreaRoot>
  );
}
