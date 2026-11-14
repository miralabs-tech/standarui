import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, unmountAll } from "../../render-harness";
import {
  ProgressCircle,
  ProgressCircleRange,
  ProgressCircleTrack,
  ProgressLabel,
  ProgressRange,
  ProgressRoot,
  ProgressTrack,
  ProgressValueText,
} from "./progress";

function Linear({
  value,
  id = "upload",
}: {
  readonly value: number | null;
  readonly id?: string;
}): React.ReactNode {
  return (
    <ProgressRoot id={id} value={value}>
      <ProgressLabel>Uploading</ProgressLabel>
      <ProgressTrack>
        <ProgressRange />
      </ProgressTrack>
      <ProgressValueText>{value === null ? "…" : `${value}%`}</ProgressValueText>
    </ProgressRoot>
  );
}

function part(container: HTMLElement, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="progress:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("ProgressRoot", () => {
  it("wires the label to the bar by id", () => {
    const { container } = mount(<Linear value={30} />);

    expect(part(container, "root").getAttribute("aria-labelledby")).toBe(
      part(container, "label").id,
    );
    expect(part(container, "root").getAttribute("aria-valuenow")).toBe("30");
  });

  it("follows a controlled value down", () => {
    const handle = mount(<Linear value={10} />);

    handle.render(<Linear value={80} />);

    expect(part(handle.container, "root").getAttribute("aria-valuenow")).toBe("80");
    expect(part(handle.container, "root").style.getPropertyValue("--sui-progress-percent")).toBe(
      "80%",
    );
  });

  it("renders the circular presentation from the same machine", () => {
    const { container } = mount(
      <ProgressRoot value={25}>
        <ProgressLabel>Sync</ProgressLabel>
        <ProgressCircle>
          <ProgressCircleTrack />
          <ProgressCircleRange />
        </ProgressCircle>
      </ProgressRoot>,
    );

    expect(part(container, "circle").tagName).toBe("svg");
    expect(part(container, "circle-range").getAttribute("stroke-dasharray")).not.toBeNull();
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<ProgressLabel />)).toThrow(/inside <ProgressRoot>/);
  });

  it("does not point at a label it never rendered", async () => {
    // The commonest way a bar ships: bare, named by the consumer. A dangling
    // `aria-labelledby` would leave it with no accessible name at all, and stop
    // this `aria-label` from winning.
    const handle = mount(
      <main>
        <ProgressRoot value={30} aria-label="Uploading">
          <ProgressTrack>
            <ProgressRange />
          </ProgressTrack>
        </ProgressRoot>
      </main>,
    );

    expect(part(handle.container, "root").hasAttribute("aria-labelledby")).toBe(false);
    await expectNoAxeViolations(handle.container);
  });

  it("passes axe determinate, indeterminate and complete", async () => {
    // One id each: four bars pinned to the same `id` mint the same `…:label`
    // four times, which is a `duplicate-id-aria` the fixture wrote and not one
    // the component can be blamed for (found once the harness started reading
    // axe's `incomplete` results, 2026-09-05).
    const handle = mount(
      <main>
        <Linear id="empty" value={0} />
        <Linear id="partial" value={55} />
        <Linear id="unknown" value={null} />
        <Linear id="done" value={100} />
      </main>,
    );

    await expectNoAxeViolations(handle.container);
  });
});
