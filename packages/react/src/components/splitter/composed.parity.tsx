import type { ParityCase } from "../../composed.harness";
import { Splitter } from "./composed";
import { SplitterHandle, SplitterPanel, SplitterRoot } from "./splitter";

export const parity: readonly ParityCase[] = [
  {
    name: "splitter",
    composed: (
      <Splitter id="side" label="Sidebar">
        <p>Panel</p>
      </Splitter>
    ),
    parts: (
      <SplitterRoot id="side" label="Sidebar">
        <SplitterPanel>
          <p>Panel</p>
          <SplitterHandle />
        </SplitterPanel>
      </SplitterRoot>
    ),
  },
  {
    name: "splitter",
    composed: (
      <Splitter
        id="inspector"
        label="Inspector"
        panelSide="end"
        orientation="vertical"
        unit="px"
        min={120}
        max={480}
        defaultSize={240}
        collapsible
        collapsedSize={32}
      >
        <p>Panel</p>
      </Splitter>
    ),
    parts: (
      <SplitterRoot
        id="inspector"
        label="Inspector"
        panelSide="end"
        orientation="vertical"
        unit="px"
        min={120}
        max={480}
        defaultSize={240}
        collapsible
        collapsedSize={32}
      >
        <SplitterPanel>
          <SplitterHandle />
          <p>Panel</p>
        </SplitterPanel>
      </SplitterRoot>
    ),
  },
  {
    name: "splitter",
    composed: (
      <Splitter
        id="tools"
        label="Tools"
        defaultCollapsed
        collapsible
        parts={{ panel: { className: "wide" }, handle: { className: "grip" } }}
      >
        <p>Panel</p>
      </Splitter>
    ),
    parts: (
      <SplitterRoot id="tools" label="Tools" defaultCollapsed collapsible>
        <SplitterPanel className="wide">
          <p>Panel</p>
          <SplitterHandle className="grip" />
        </SplitterPanel>
      </SplitterRoot>
    ),
  },
];
