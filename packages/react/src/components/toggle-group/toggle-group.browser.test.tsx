import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, fire, mount, unmountAll } from "../../render-harness";
import {
  ToggleGroupFrame,
  ToggleGroupIndicator,
  ToggleGroupItem,
  ToggleGroupRoot,
  ToggleGroupScrollbar,
  ToggleGroupThumb,
} from "./toggle-group";

function Segments(props: {
  readonly multiple?: boolean;
  readonly defaultValue?: readonly string[];
  readonly onValueChange?: (details: { value: readonly string[] }) => void;
  readonly hideMonth?: boolean;
  readonly sizing?: "equal" | "content";
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
}): React.ReactNode {
  const { hideMonth, ...rest } = props;
  return (
    <ToggleGroupRoot aria-label="Range" {...rest}>
      <ToggleGroupIndicator />
      <ToggleGroupItem value="day">Day</ToggleGroupItem>
      <ToggleGroupItem value="week">Week</ToggleGroupItem>
      {hideMonth ? null : <ToggleGroupItem value="month">Month</ToggleGroupItem>}
    </ToggleGroupRoot>
  );
}

function items(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-part~="toggle-group:item"]')];
}

function root(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="toggle-group:root"]');
  if (node === null) throw new Error("the group did not render");
  return node;
}

function indicator(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="toggle-group:indicator"]');
  if (node === null) throw new Error("the indicator did not render");
  return node;
}

function expectMeasured(
  container: HTMLElement,
  item: HTMLElement,
  what: "offset" | "size",
  axis: "horizontal" | "vertical" = "horizontal",
): void {
  const track = root(container);
  const box = item.getBoundingClientRect();
  const frame = track.getBoundingClientRect();
  const read = Number.parseFloat(track.style.getPropertyValue(`--sui-indicator-${what}`));
  const expected =
    axis === "horizontal"
      ? what === "offset"
        ? box.left - frame.left - track.clientLeft
        : box.width
      : what === "offset"
        ? box.top - frame.top - track.clientTop
        : box.height;
  expect(Math.abs(read - expected)).toBeLessThan(0.05);
}

const FLIP_SHEET = `
  .flip { position: relative; display: inline-grid; grid-auto-flow: column; gap: 4px; }
  .flip[data-orientation="vertical"] { grid-auto-flow: row; }
  .flip > button { margin: 0; padding: 0 6px; border: 0; }
  .flip > button:nth-of-type(1) { block-size: 20px; }
  .flip > button:nth-of-type(2) { block-size: 32px; }
  .flip > button:nth-of-type(3) { block-size: 14px; }
  .flip > [data-part~="toggle-group:indicator"] { position: absolute; }
`;

function installFlipSheet(): void {
  const style = document.createElement("style");
  style.setAttribute("data-flip", "");
  style.textContent = FLIP_SHEET;
  document.head.append(style);
}

afterEach(() => {
  unmountAll();
  for (const node of document.querySelectorAll("style[data-flip]")) node.remove();
});

describe("ToggleGroupRoot", () => {
  it("publishes the count that gates the indicator into view, and no index", () => {
    const { container } = mount(<Segments defaultValue={["week"]} />);

    expect(root(container).style.getPropertyValue("--sui-active-index")).toBe("");
    expect(root(container).style.getPropertyValue("--sui-segment-count")).toBe("3");
  });

  it("hands `sizing` to the machine, which then measures the active segment", () => {
    installFlipSheet();
    const { container } = mount(
      <Segments sizing="content" className="flip" defaultValue={["week"]} />,
    );
    const week = items(container)[1];
    if (week === undefined) throw new Error("the segment did not render");

    expect(root(container).getAttribute("data-sizing")).toBe("content");
    expect(root(container).hasAttribute("sizing")).toBe(false);
    expectMeasured(container, week, "offset");
    expectMeasured(container, week, "size");
  });

  it("measures an item that carries an id of its own", () => {
    installFlipSheet();
    const { container } = mount(
      <ToggleGroupRoot aria-label="Range" sizing="content" className="flip" defaultValue={["week"]}>
        <ToggleGroupIndicator />
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="week" id="mine">
          Week
        </ToggleGroupItem>
        <ToggleGroupItem value="month">Month</ToggleGroupItem>
      </ToggleGroupRoot>,
    );
    const week = items(container)[1];
    if (week === undefined) throw new Error("the segment did not render");

    expect(week.id).toBe("mine");
    expectMeasured(container, week, "size");
  });

  it("keeps measuring when the sizing is switched at runtime", () => {
    installFlipSheet();
    const handle = mount(<Segments className="flip" defaultValue={["week"]} />);

    handle.render(<Segments sizing="content" className="flip" defaultValue={["week"]} />);

    const week = items(handle.container)[1];
    if (week === undefined) throw new Error("the segment did not render");
    expect(root(handle.container).getAttribute("data-sizing")).toBe("content");
    expectMeasured(handle.container, week, "size");
  });

  it("lands rather than springs when the sizing is switched back", () => {
    installFlipSheet();
    const handle = mount(<Segments sizing="content" className="flip" defaultValue={["day"]} />);
    fire(() => items(handle.container)[1]?.click());
    expect(indicator(handle.container).hasAttribute("data-immediate")).toBe(false);

    handle.render(<Segments className="flip" defaultValue={["week"]} />);

    expect(indicator(handle.container).hasAttribute("data-immediate")).toBe(true);
    expect(root(handle.container).hasAttribute("data-sizing")).toBe(false);
  });

  it("re-measures on the real watch when the axis flips after a commit", () => {
    installFlipSheet();

    const props = { sizing: "content", className: "flip", defaultValue: ["month"] } as const;
    const handle = mount(<Segments {...props} />);
    const month = items(handle.container)[2];
    if (month === undefined) throw new Error("the segment did not render");
    const read = (name: string): string => root(handle.container).style.getPropertyValue(name);

    expectMeasured(handle.container, month, "offset");
    expectMeasured(handle.container, month, "size");
    const horizontal = read("--sui-indicator-offset");
    fire(() => items(handle.container)[1]?.click());
    fire(() => items(handle.container)[2]?.click());
    expect(indicator(handle.container).hasAttribute("data-immediate")).toBe(false);

    handle.render(<Segments {...props} orientation="vertical" />);

    expectMeasured(handle.container, month, "offset", "vertical");
    expectMeasured(handle.container, month, "size", "vertical");
    expect(read("--sui-indicator-offset")).not.toBe(horizontal);
    expect(indicator(handle.container).hasAttribute("data-immediate")).toBe(true);
  });

  it("leaves the default sizing unmarked, and measures it all the same", () => {
    installFlipSheet();
    const { container } = mount(<Segments className="flip" defaultValue={["week"]} />);
    const week = items(container)[1];
    if (week === undefined) throw new Error("the segment did not render");

    expect(root(container).hasAttribute("data-sizing")).toBe(false);
    expectMeasured(container, week, "size");
  });

  it("selects on click", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Segments onValueChange={onValueChange} />);

    fire(() => items(container)[2]?.click());

    expect(onValueChange).toHaveBeenCalledWith({ value: ["month"] });
  });

  it("re-reads the items when one is rendered away", () => {
    const handle = mount(<Segments defaultValue={["day"]} />);
    expect(root(handle.container).style.getPropertyValue("--sui-segment-count")).toBe("3");

    handle.render(<Segments defaultValue={["day"]} hideMonth />);

    // The count follows the DOM without anyone registering anything — the point
    // of reading the item list rather than being told it.
    expect(root(handle.container).style.getPropertyValue("--sui-segment-count")).toBe("2");
  });

  it("moves and selects with the arrows in single mode", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Segments defaultValue={["day"]} onValueChange={onValueChange} />);
    const list = items(container);

    fire(() => {
      list[0]?.focus();
      list[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    expect(document.activeElement).toBe(list[1]);
    expect(onValueChange).toHaveBeenCalledWith({ value: ["week"] });
  });

  it("says where an item belongs when it is rendered outside its root", () => {
    expect(() => mount(<ToggleGroupItem value="x" />)).toThrow(/inside <ToggleGroupRoot>/);
  });

  it("passes axe in both patterns", async () => {
    const handle = mount(
      <main>
        <Segments defaultValue={["week"]} />
        <Segments multiple defaultValue={["day", "month"]} />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});

describe("ToggleGroupFrame", () => {
  function Framed(props: { readonly onValueChange?: (d: { value: readonly string[] }) => void }) {
    return (
      <ToggleGroupFrame defaultValue={["day"]} onValueChange={props.onValueChange}>
        <ToggleGroupRoot aria-label="Range">
          <ToggleGroupIndicator />
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar>
          <ToggleGroupThumb />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>
    );
  }

  function part(container: HTMLElement, token: string): HTMLElement {
    const node = container.querySelector<HTMLElement>(`[data-part~="toggle-group:${token}"]`);
    if (node === null) throw new Error(`no ${token}`);
    return node;
  }

  it("owns the machine its root, its items and its bar read from", () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Framed onValueChange={onValueChange} />);

    expect(part(container, "frame")).toContainElement(part(container, "root"));
    expect(part(container, "frame")).toContainElement(part(container, "scrollbar"));
    expect(part(container, "root").contains(part(container, "scrollbar"))).toBe(false);
    expect(part(container, "scrollbar").getAttribute("aria-hidden")).toBe("true");
    expect(items(container)[0]?.getAttribute("aria-checked")).toBe("true");

    fire(() => items(container)[1]?.click());

    expect(onValueChange).toHaveBeenCalledWith({ value: ["week"] });
    expect(items(container)[1]?.getAttribute("aria-checked")).toBe("true");
  });

  it("leaves a root without a frame owning its machine, and draws no bar", () => {
    const { container } = mount(<Segments defaultValue={["week"]} />);

    expect(container.querySelector('[data-part~="toggle-group:frame"]')).toBeNull();
    expect(container.querySelector('[data-part~="toggle-group:scrollbar"]')).toBeNull();
    expect(items(container)[1]?.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps a group inside another group's item on its own machine", () => {
    const { container } = mount(
      <ToggleGroupFrame defaultValue={["outer"]}>
        <ToggleGroupRoot aria-label="Outer">
          <ToggleGroupItem value="outer">
            Outer
            <ToggleGroupRoot aria-label="Inner" defaultValue={["inner"]}>
              <ToggleGroupItem value="inner">Inner</ToggleGroupItem>
            </ToggleGroupRoot>
          </ToggleGroupItem>
        </ToggleGroupRoot>
      </ToggleGroupFrame>,
    );
    const roots = [...container.querySelectorAll('[data-part~="toggle-group:root"]')];

    expect(roots).toHaveLength(2);
    expect(new Set(roots.map((node) => node.id)).size).toBe(2);
  });

  it("says so when a root inside a frame is given machine props", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(
      <ToggleGroupFrame>
        <ToggleGroupRoot multiple aria-label="Range">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
        </ToggleGroupRoot>
      </ToggleGroupFrame>,
    );

    expect(spy.mock.calls.some((call) => /frame owns the machine/.test(String(call[0])))).toBe(
      true,
    );
    spy.mockRestore();
  });

  it("stays silent when a root inside a frame is given none of the machine props", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(
      <ToggleGroupFrame multiple>
        <ToggleGroupRoot aria-label="Range" className="strip">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
        </ToggleGroupRoot>
      </ToggleGroupFrame>,
    );

    expect(spy.mock.calls.some((call) => /frame owns the machine/.test(String(call[0])))).toBe(
      false,
    );
    spy.mockRestore();
  });

  it("passes axe with the bar in it", async () => {
    const handle = mount(
      <main>
        <Framed />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
