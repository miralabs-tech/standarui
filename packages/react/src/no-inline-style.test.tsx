/**
 * The adapter never renders a `style=` attribute from the core.
 *
 * A page under `style-src 'self'` blocks an inline `style` in server HTML while
 * it lets the CSSOM write through, so every style `connect` emits is written
 * with `setProperty` after mount instead. This file reads the markup a server
 * produces; the writes themselves are measured in `use-render.browser.test.tsx`.
 *
 * The catalogue is the composed layer's parity table, discovered by the same glob
 * as `composed.test.tsx`: both forms of every row, one `renderToString` each.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxRoot,
  useCheckbox,
} from "./components/checkbox";
import { ProgressRange, ProgressRoot, ProgressTrack } from "./components/progress";
import { TabsContent, TabsIndicator, TabsList, TabsRoot, TabsTrigger } from "./components/tabs";
import type { ParityCase } from "./composed.harness";
import { useVirtualizer } from "./use-virtualizer";

interface ParityModule {
  readonly parity: readonly ParityCase[];
}

const MODULES: Record<string, ParityModule> = import.meta.glob<ParityModule>(
  "./components/*/composed.parity.tsx",
  { eager: true },
);

const ROWS: readonly ParityCase[] = Object.values(MODULES).flatMap((module) => module.parity);

const INLINE_STYLE = /\sstyle=/;

describe("the detector would notice", () => {
  it("matches an inline style attribute", () => {
    expect(renderToString(<div style={{ color: "red" }} />)).toMatch(INLINE_STYLE);
  });

  it("does not match a data attribute that ends in style", () => {
    expect(renderToString(<div data-style="a" />)).not.toMatch(INLINE_STYLE);
  });

  it("reads a catalogue that is not empty", () => {
    expect(ROWS.length).toBeGreaterThan(30);
  });
});

describe("server HTML carries no inline style", () => {
  it.each(ROWS.map((row, index) => [`${index} ${row.name}`, row] as const))(
    "%s, composed and in parts",
    (_label, row) => {
      expect(renderToString(row.composed)).not.toMatch(INLINE_STYLE);
      expect(renderToString(row.parts)).not.toMatch(INLINE_STYLE);
    },
  );

  it("leaves the hidden input of a checkbox unstyled", () => {
    const html = renderToString(
      <CheckboxRoot id="agree" name="agree">
        <CheckboxHiddenInput />
        <CheckboxControl>
          <CheckboxIndicator />
        </CheckboxControl>
      </CheckboxRoot>,
    );

    expect(html).toContain("<input");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  it("keeps the style of a getter that is spread by hand", () => {
    function Bare(): ReturnType<typeof CheckboxRoot> {
      const api = useCheckbox({ id: "agree", name: "agree" });
      return <input {...api.getHiddenInputProps()} />;
    }

    const html = renderToString(<Bare />);

    expect(html).toMatch(INLINE_STYLE);
    expect(html).toContain("position:absolute");
  });

  it("leaves a progress range unstyled", () => {
    const html = renderToString(
      <ProgressRoot id="upload" defaultValue={40}>
        <ProgressTrack>
          <ProgressRange />
        </ProgressTrack>
      </ProgressRoot>,
    );

    expect(html).toContain('data-part="progress:range"');
    expect(html).not.toMatch(INLINE_STYLE);
  });
});

describe("a virtualized list spread by hand", () => {
  function Bare({ style }: { style?: boolean }): ReturnType<typeof CheckboxRoot> {
    const api = useVirtualizer({
      count: 100,
      estimateSize: () => 30,
      getScrollElement: () => null,
      initialSize: 300,
    });
    return (
      <div {...api.getContainerProps()} {...(style === true ? { style: { color: "red" } } : {})}>
        {api.items.map((item) => (
          <div key={item.key} {...api.getItemProps(item.index)}>
            Row {item.index}
          </div>
        ))}
      </div>
    );
  }

  it("renders its first window with no inline style", () => {
    const html = renderToString(<Bare />);

    expect(html.match(/data-sui-virtual-item/g)).toHaveLength(13);
    expect(html).toContain("data-sui-virtual");
    expect(html).not.toMatch(INLINE_STYLE);
  });

  it("would notice a style written by the consumer", () => {
    expect(renderToString(<Bare style />)).toMatch(INLINE_STYLE);
  });
});

describe("tabs keep every panel in the server HTML under keepMounted", () => {
  const html = renderToString(
    <TabsRoot id="doc" defaultValue="overview" keepMounted>
      <TabsList aria-label="Sections">
        <TabsIndicator />
        <TabsTrigger value="overview" label="Overview">
          Overview
        </TabsTrigger>
        <TabsTrigger value="activity" label="Activity">
          Activity
        </TabsTrigger>
        <TabsTrigger value="files" label="Files">
          Files
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="activity">Activity panel</TabsContent>
      <TabsContent value="files">Files panel</TabsContent>
    </TabsRoot>,
  );

  it("renders the content of every panel", () => {
    expect(html).toContain("Overview panel");
    expect(html).toContain("Activity panel");
    expect(html).toContain("Files panel");
  });

  it("marks the inactive panels hidden and the active one not", () => {
    const panels = [...html.matchAll(/<div[^>]*data-part="tabs:content"[^>]*>/g)].map(
      (match) => match[0],
    );

    expect(panels).toHaveLength(3);
    expect(panels[0]).not.toMatch(/\shidden/);
    expect(panels[1]).toMatch(/\shidden/);
    expect(panels[2]).toMatch(/\shidden/);
  });

  it("carries no inline style", () => {
    expect(html).not.toMatch(INLINE_STYLE);
  });
});
