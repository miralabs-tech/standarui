import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import { MeterLabel, MeterRange, MeterRoot, MeterTrack, MeterValueText } from "./meter";

function Gauge({
  value,
  onValueChange,
}: {
  readonly value?: number;
  readonly onValueChange?: (details: { value: number }) => void;
}): React.ReactNode {
  return (
    <MeterRoot id="battery" value={value} onValueChange={onValueChange} low={20} high={80}>
      <MeterLabel>Battery</MeterLabel>
      <MeterTrack>
        <MeterRange />
      </MeterTrack>
      <MeterValueText>{value === undefined ? "" : `${value}%`}</MeterValueText>
    </MeterRoot>
  );
}

function part(container: HTMLElement, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="meter:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("MeterRoot", () => {
  it("renders all five parts and wires the label to the gauge by id", () => {
    const { container } = mount(<Gauge value={30} />);

    for (const name of ["root", "label", "track", "range", "value-text"]) {
      expect(part(container, name)).toBeDefined();
    }
    const root = part(container, "root");
    expect(root.getAttribute("role")).toBe("meter");
    expect(root.getAttribute("aria-labelledby")).toBe(part(container, "label").id);
    expect(root.getAttribute("aria-valuenow")).toBe("30");
    expect(part(container, "value-text").getAttribute("aria-hidden")).toBe("true");
  });

  it("follows a controlled value down and reports without writing", () => {
    const onValueChange = vi.fn();
    const handle = mount(<Gauge value={10} onValueChange={onValueChange} />);

    handle.render(<Gauge value={90} onValueChange={onValueChange} />);

    const root = part(handle.container, "root");
    expect(root.getAttribute("aria-valuenow")).toBe("90");
    expect(root.style.getPropertyValue("--sui-meter-percent")).toBe("90%");
    expect(root.getAttribute("data-valence")).toBe("suboptimal");
    // The prop went down; nothing was written back up.
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("runs uncontrolled from a defaultValue", () => {
    const { container } = mount(
      <MeterRoot defaultValue={4} min={2} max={8} aria-label="Signal">
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>,
    );

    const root = part(container, "root");
    expect(root.getAttribute("aria-valuenow")).toBe("4");
    expect(root.getAttribute("aria-valuemin")).toBe("2");
    expect(root.getAttribute("aria-valuemax")).toBe("8");
  });

  it("carries dir through to the root", () => {
    const { container } = mount(
      <MeterRoot value={40} dir="rtl" aria-label="Storage">
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>,
    );

    // The attribute is the whole contract here: the fill mirrors through the
    // sheet's logical properties, and the harness loads no stylesheet.
    expect(part(container, "root").getAttribute("dir")).toBe("rtl");
  });

  it("composes without erasing anyone's part tokens", () => {
    const { container } = mount(
      <MeterRoot
        value={30}
        aria-label="Relevance"
        render={<section data-scope="score" data-part="score:root" />}
      >
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
      </MeterRoot>,
    );

    const node = container.querySelector<HTMLElement>("section");
    expect(node).not.toBeNull();
    const scopes = (node?.getAttribute("data-scope") ?? "").split(" ");
    const partTokens = (node?.getAttribute("data-part") ?? "").split(" ");
    expect(scopes).toContain("meter");
    expect(scopes).toContain("score");
    expect(partTokens).toContain("meter:root");
    expect(partTokens).toContain("score:root");
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<MeterLabel />)).toThrow(/inside <MeterRoot>/);
  });

  it("passes axe named by its label part", async () => {
    const handle = mount(
      <main>
        <Gauge value={55} />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });

  it("passes axe named by aria-label alone, with no dangling IDREF", async () => {
    // The commonest way a gauge ships: bare, named by the consumer. These two
    // are the only legitimate paths — a meter with neither has no accessible
    // name, and axe is right to flag it.
    const handle = mount(
      <main>
        <MeterRoot value={30} aria-label="Disk usage">
          <MeterTrack>
            <MeterRange />
          </MeterTrack>
        </MeterRoot>
      </main>,
    );

    expect(part(handle.container, "root").hasAttribute("aria-labelledby")).toBe(false);
    await expectNoAxeViolations(handle.container);
  });
});
