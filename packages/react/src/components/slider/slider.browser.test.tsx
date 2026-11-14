/**
 * The slider through React: the ten parts, the field it inherits from, the form
 * it submits into, the pad that takes hold of it — and axe over the matrix the
 * DoD asks for.
 *
 * The machine itself is proved in `packages/core/src/components/slider`; what is
 * here is what only an adapter can get wrong. The gamepad section is the one that
 * could not live anywhere else: it puts a real slider inside a real dialog, on
 * the real input system, and presses B.
 */

import { getTabbables } from "@standarui/core";
import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { FieldHelperText, FieldLabel, FieldRoot } from "../field/field";
import {
  SliderControl,
  SliderHiddenInput,
  SliderLabel,
  SliderMarker,
  SliderMarkerGroup,
  SliderRange,
  SliderRoot,
  type SliderRootProps,
  SliderThumb,
  SliderTrack,
  SliderValueText,
  useSliderContext,
} from "./slider";

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="slider:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

/** The formatted value, read from the context the way a consumer reads it. */
function ValueText(): React.ReactNode {
  const api = useSliderContext();
  return <SliderValueText>{api.valueAsText[0]}</SliderValueText>;
}

function Marks(): React.ReactNode {
  const api = useSliderContext();
  return (
    <SliderMarkerGroup>
      {api.marks.map((mark) => (
        <SliderMarker key={mark} value={mark} />
      ))}
    </SliderMarkerGroup>
  );
}

interface VolumeProps extends SliderRootProps {
  /** `null` renders no label part at all — the shape with no name to borrow. */
  readonly label?: string | null;
  readonly thumbLabel?: string;
  readonly withMarks?: boolean;
  readonly withValueText?: boolean;
}

function Volume(props: VolumeProps): React.ReactNode {
  const { label = "Volume", thumbLabel, withMarks, withValueText, ...root } = props;
  return (
    <SliderRoot {...root}>
      {label === null ? null : <SliderLabel>{label}</SliderLabel>}
      {withValueText === true ? <ValueText /> : null}
      <SliderControl>
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb aria-label={thumbLabel} />
        {withMarks === true ? <Marks /> : null}
      </SliderControl>
      <SliderHiddenInput />
    </SliderRoot>
  );
}

/** A box to measure against: the sheet owns these numbers in an application. */
function size(container: HTMLElement): HTMLElement {
  const control = part(container, "control");
  control.style.position = "relative";
  control.style.display = "block";
  control.style.inlineSize = "200px";
  control.style.blockSize = "44px";
  const thumb = part(container, "thumb");
  thumb.style.position = "absolute";
  thumb.style.inlineSize = "20px";
  thumb.style.blockSize = "20px";
  return control;
}

type PointerType = "pointerdown" | "pointermove" | "pointerup";

function pointer(control: HTMLElement, type: PointerType, offset: number): void {
  const rect = control.getBoundingClientRect();
  fire(() => {
    control.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: rect.left + offset,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
}

function key(node: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  fire(() => node.dispatchEvent(event));
  return event;
}

afterEach(() => {
  unmountAll();
});

describe("SliderRoot", () => {
  it("renders one slider, named by its own label part", () => {
    const { container } = mount(<Volume defaultValue={40} />);
    const thumb = part(container, "thumb");

    expect(thumb.getAttribute("role")).toBe("slider");
    expect(thumb.getAttribute("aria-valuenow")).toBe("40");
    expect(thumb.getAttribute("aria-labelledby")).toBe(part(container, "label").id);
    // A span, because `<label for>` only names labelable elements and a
    // `div[role="slider"]` is not one.
    expect(part(container, "label").tagName).toBe("SPAN");
    expect(container.querySelectorAll('[role="slider"]')).toHaveLength(1);
  });

  it("formats the value for the consumer's own text, and hides it from the reader", () => {
    const { container } = mount(
      <Volume
        defaultValue={0.4}
        min={0}
        max={1}
        step={0.01}
        formatOptions={{ style: "percent" }}
        withValueText
      />,
    );

    expect(part(container, "value-text").textContent).toBe("40%");
    expect(part(container, "value-text").getAttribute("aria-hidden")).toBe("true");
    expect(part(container, "thumb").getAttribute("aria-valuetext")).toBe("40%");
  });

  it("moves on the arrow keys and reports the gesture once each", () => {
    const onValueChange = vi.fn();
    const onValueChangeEnd = vi.fn();
    const { container } = mount(
      <Volume
        defaultValue={50}
        onValueChange={onValueChange}
        onValueChangeEnd={onValueChangeEnd}
      />,
    );
    const thumb = part(container, "thumb");

    expect(key(thumb, { key: "ArrowRight" }).defaultPrevented).toBe(true);

    expect(onValueChange).toHaveBeenCalledWith({ value: [51] });
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
    expect(thumb.getAttribute("aria-valuenow")).toBe("51");

    key(thumb, { key: "End" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("100");
  });

  it("jumps to a press and takes the focus with it", async () => {
    const onValueChangeEnd = vi.fn();
    const { container } = mount(<Volume defaultValue={0} onValueChangeEnd={onValueChangeEnd} />);
    await settle();
    const control = size(container);

    // Past the far end on purpose: the clamp makes the assertion independent of
    // the exact travel, which the stylesheet owns and this test does not load.
    pointer(control, "pointerdown", 400);
    pointer(control, "pointerup", 400);

    expect(part(container, "thumb").getAttribute("aria-valuenow")).toBe("100");
    expect(document.activeElement).toBe(part(container, "thumb"));
    expect(onValueChangeEnd).toHaveBeenCalledTimes(1);
  });

  it("follows a controlled value back down without writing one", () => {
    const onValueChange = vi.fn();
    const handle = mount(<Volume value={20} onValueChange={onValueChange} />);

    key(part(handle.container, "thumb"), { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenCalledWith({ value: [21] });
    expect(part(handle.container, "thumb").getAttribute("aria-valuenow")).toBe("20");

    handle.render(<Volume value={21} onValueChange={onValueChange} />);
    expect(part(handle.container, "thumb").getAttribute("aria-valuenow")).toBe("21");
  });

  it("places every tick the consumer maps over", () => {
    const { container } = mount(<Volume defaultValue={50} marks={3} withMarks />);
    const markers = [...container.querySelectorAll<HTMLElement>('[data-part~="slider:marker"]')];

    expect(markers.map((node) => node.getAttribute("data-value"))).toEqual(["0", "50", "100"]);
    expect(markers.map((node) => node.getAttribute("data-state"))).toEqual([
      "in-range",
      "in-range",
      "out-of-range",
    ]);
  });
});

describe("slider in a form", () => {
  it("submits its value through a hidden input", () => {
    const { container } = mount(
      <form>
        <Volume name="volume" defaultValue={40} />
      </form>,
    );
    const form = container.querySelector("form") as HTMLFormElement;

    const input = part(container, "hidden-input") as HTMLInputElement;
    expect(input.type).toBe("hidden");
    expect(new FormData(form).get("volume")).toBe("40");

    key(part(container, "thumb"), { key: "End" });
    expect(new FormData(form).get("volume")).toBe("100");
  });

  it("is skipped by Tab when it is disabled, even in first position", () => {
    const { container } = mount(
      <form>
        <Volume name="volume" defaultValue={40} disabled />
        <button type="submit">Save</button>
      </form>,
    );

    // The shape the audit called out: a disabled control at the top of a form has
    // to be stepped over, not landed on and refused.
    expect(getTabbables(container)).toEqual([container.querySelector("button")]);
    expect(part(container, "thumb").hasAttribute("tabindex")).toBe(false);
    expect((part(container, "hidden-input") as HTMLInputElement).disabled).toBe(true);
  });

  it("inherits the field's description and its disabled state", () => {
    const { container } = mount(
      <FieldRoot disabled>
        <Volume defaultValue={40} />
        <FieldHelperText>Loudness of the alert sound.</FieldHelperText>
      </FieldRoot>,
    );

    expect(part(container, "thumb").getAttribute("aria-describedby")).toBe(
      container.querySelector<HTMLElement>('[data-part~="field:helper-text"]')?.id,
    );
    // Inherited as machine props, never merged over the output: a field cannot
    // talk over a control, and a control cannot half-obey its field.
    expect(part(container, "thumb").getAttribute("aria-disabled")).toBe("true");
    expect(part(container, "root").hasAttribute("data-disabled")).toBe(true);
  });

  /**
   * The composition the seal was opened on: a field that carries the label and a
   * slider that renders none. `<label for>` cannot name a `div[role="slider"]`, so
   * before this the label pointed at an id in no document *and* the thumb had no
   * name at all — two defects from one missing wire.
   */
  it("borrows the field's label when it renders none, and the field stops pointing `for` at what it cannot name", async () => {
    const { container } = mount(
      <FieldRoot>
        <FieldLabel>Volume</FieldLabel>
        <Volume label={null} defaultValue={40} />
      </FieldRoot>,
    );
    await settle();

    const fieldLabel = container.querySelector<HTMLElement>(
      '[data-part~="field:label"]',
    ) as HTMLElement;
    const thumb = part(container, "thumb");

    await waitFor(() => expect(fieldLabel.hasAttribute("for")).toBe(false));
    expect(thumb.getAttribute("aria-labelledby")).toBe(fieldLabel.id);
    expect(fieldLabel.id).not.toBe("");
    await expectNoAxeViolations(container);
  });

  it("keeps its own label when it has one, rather than being named twice", async () => {
    const { container } = mount(
      <FieldRoot>
        <FieldLabel>Alert sound</FieldLabel>
        <Volume defaultValue={40} />
      </FieldRoot>,
    );
    await settle();

    const own = container.querySelector<HTMLElement>('[data-part~="slider:label"]') as HTMLElement;

    expect(part(container, "thumb").getAttribute("aria-labelledby")).toBe(own.id);
    await expectNoAxeViolations(container);
  });
});

describe("slider on a gamepad", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "select" | "back" | "moveRight" | "pageUp"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  /**
   * A slider inside an open dialog, which is the arrangement the whole engage
   * grammar was written for: B has to let go of the value *without* popping the
   * layer underneath it. Every other component in the library treats B as
   * "dismiss the top layer", so this is the one place that rule is suspended.
   */
  it("takes hold on A, adjusts on the pad, and gives the value back on B without closing the dialog", async () => {
    const onValueChangeEnd = vi.fn();
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Audio</DialogTitle>
                <Volume defaultValue={50} onValueChangeEnd={onValueChangeEnd} />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    const content = document.querySelector('[data-part~="dialog:content"]') as HTMLElement;
    const thumb = part(content, "thumb");
    fire(() => thumb.focus());
    await waitFor(() => expect(document.activeElement).toBe(thumb));

    pad("select");
    expect(thumb.getAttribute("data-engaged")).toBe("");

    pad("moveRight");
    pad("pageUp");
    expect(thumb.getAttribute("aria-valuenow")).toBe("61");

    pad("back");

    expect(thumb.getAttribute("aria-valuenow")).toBe("50");
    expect(thumb.hasAttribute("data-engaged")).toBe(false);
    // The dialog is still there. Without `back` being consumed by the engage
    // scope, letting go of a slider would dismiss whatever it sat in.
    expect(document.querySelector('[data-part~="dialog:content"]')).not.toBeNull();
    expect(onValueChangeEnd).toHaveBeenLastCalledWith({ value: [50] });
  });

  it("answers no pad at all when the consumer says so", async () => {
    const { container } = mount(
      <NavProvider>
        <Capture />
        <Volume defaultValue={50} intents={null} />
      </NavProvider>,
    );
    await settle();
    const thumb = part(container, "thumb");
    fire(() => thumb.focus());

    pad("select");

    // `intents={null}` is how a consumer opts a control out while a provider is
    // mounted above it — `??` would have overridden it back on.
    expect(thumb.hasAttribute("data-engaged")).toBe(false);
  });
});

describe("slider — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  it("passes over the theme × density × orientation × dir matrix", async () => {
    const handle = mount(
      <main>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <Volume label={`${theme} ${density} horizontal`} defaultValue={40} />
              <Volume
                label={`${theme} ${density} vertical`}
                orientation="vertical"
                defaultValue={40}
              />
              <div dir="rtl">
                <Volume label={`${theme} ${density} rtl`} dir="rtl" defaultValue={40} />
              </div>
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });

  it("passes disabled, read-only, ticked — and with no label part at all", async () => {
    const handle = mount(
      <main>
        <Volume label="Unavailable" defaultValue={40} disabled />
        <Volume label="Fixed" defaultValue={40} readOnly />
        <Volume label="Ticked" defaultValue={40} marks="step" step={25} withMarks withValueText />
        {/* The consumer names the thumb instead of rendering a label part —
            `role="slider"` needs a name from somewhere, and this is the other
            place it can come from. */}
        <Volume label={null} thumbLabel="Brightness" defaultValue={40} />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(handle.container);
  });
});
