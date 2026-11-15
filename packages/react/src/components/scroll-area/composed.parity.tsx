import type { ParityCase } from "../../composed.harness";
import { ScrollArea } from "./composed";
import {
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "./scroll-area";

export const parity: readonly ParityCase[] = [
  {
    name: "scroll-area",
    composed: (
      <ScrollArea id="log" label="Log">
        <p>Content</p>
      </ScrollArea>
    ),
    parts: (
      <ScrollAreaRoot id="log" label="Log">
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <p>Content</p>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb orientation="vertical" />
        </ScrollAreaScrollbar>
      </ScrollAreaRoot>
    ),
  },
  {
    name: "scroll-area",
    composed: (
      <ScrollArea id="strip" labelledBy="strip-title" orientation="horizontal" always>
        <p>Content</p>
      </ScrollArea>
    ),
    parts: (
      <ScrollAreaRoot id="strip" labelledBy="strip-title" orientation="horizontal" always>
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <p>Content</p>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="horizontal">
          <ScrollAreaThumb orientation="horizontal" />
        </ScrollAreaScrollbar>
      </ScrollAreaRoot>
    ),
  },
  {
    name: "scroll-area",
    composed: (
      <ScrollArea
        id="board"
        label="Board"
        orientation="both"
        hideDelay={400}
        parts={{
          viewport: { className: "view" },
          content: { className: "body" },
          scrollbar: { className: "bar" },
          thumb: { className: "grip" },
          corner: { className: "square" },
        }}
      >
        <p>Content</p>
      </ScrollArea>
    ),
    parts: (
      <ScrollAreaRoot id="board" label="Board" orientation="both" hideDelay={400}>
        <ScrollAreaViewport className="view">
          <ScrollAreaContent className="body">
            <p>Content</p>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical" className="bar">
          <ScrollAreaThumb orientation="vertical" className="grip" />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar orientation="horizontal" className="bar">
          <ScrollAreaThumb orientation="horizontal" className="grip" />
        </ScrollAreaScrollbar>
        <ScrollAreaCorner className="square" />
      </ScrollAreaRoot>
    ),
  },
];
