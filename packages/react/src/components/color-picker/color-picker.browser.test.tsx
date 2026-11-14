/**
 * The colour picker through React, and only what an adapter can get wrong: the
 * portal, the two presences, the inline panel that never portals, the screen
 * picker that renders `null` where the engine has none, and the tab order through
 * a surface with up to eight stops in it. The machine itself is proved in
 * `packages/core/src/components/color-picker`.
 *
 * The axe passes are the DoD's a11y line on the real component: the closed
 * trigger, the open dialog in both the anchored and the modal presentation, and
 * the inline panel — the shape with no trigger at all. Every pass over an open
 * panel is handed the screen picker's opt-in module, so the engine that draws its
 * trigger audits it.
 */

import { getLiveAnnouncer, isScrollLocked } from "@standarui/core";
import { eyedropper } from "@standarui/core/color-picker/eyedropper";
import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  realKey,
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
import {
  ColorPickerArea,
  ColorPickerAreaBackground,
  ColorPickerAreaThumb,
  ColorPickerAreaXInput,
  ColorPickerAreaYInput,
  ColorPickerBackdrop,
  ColorPickerCancelTrigger,
  ColorPickerChannelInput,
  ColorPickerChannelLabel,
  ColorPickerChannelSlider,
  ColorPickerChannelSliderRange,
  ColorPickerChannelSliderThumb,
  ColorPickerChannelSliderTrack,
  ColorPickerCloseTrigger,
  ColorPickerContent,
  ColorPickerEyedropperTrigger,
  ColorPickerFormatSelect,
  ColorPickerHiddenInput,
  ColorPickerLabel,
  ColorPickerPortal,
  ColorPickerPositioner,
  ColorPickerRoot,
  type ColorPickerRootProps,
  ColorPickerSwatch,
  ColorPickerSwatchGroup,
  ColorPickerSwatchIndicator,
  ColorPickerSwatchRow,
  ColorPickerSwatchTrigger,
  ColorPickerTitle,
  ColorPickerTransparencyGrid,
  ColorPickerTrigger,
  ColorPickerTriggerSwatch,
  ColorPickerValueText,
  useColorPickerContext,
} from "./color-picker";
// The composed layer, because the defect lives in how it nests the parts — the
// parts spelling below is not the arm that broke.
import { ColorPicker } from "./composed";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

/** A trusted pointer sequence; the update it causes is scheduled by the browser. */
async function realClick(node: HTMLElement): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "up", x, y },
    ]);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
}

const SWATCHES = ["#ff0000", "#00ff00", "#0000ff", "#ffffff"];

let input: InputSystem | null = null;

function Capture(): React.ReactNode {
  const system = useInputSystem();
  useEffect(() => {
    input = system;
  }, [system]);
  return null;
}

/** The swatch matrix, laid out from the api the way a consumer would lay it out. */
function Swatches(): React.ReactNode {
  const api = useColorPickerContext();
  const rows = Array.from({ length: api.swatchRows }, (_, row) => row);
  return (
    <>
      <ColorPickerSwatchGroup>
        {rows.map((row) => (
          <ColorPickerSwatchRow key={row} row={row}>
            {api.swatches
              .map((value, index) => ({ value, index }))
              .filter((cell) => Math.floor(cell.index / api.swatchColumns) === row)
              .map((cell) => (
                <ColorPickerSwatch key={cell.value} index={cell.index}>
                  <ColorPickerSwatchIndicator />
                </ColorPickerSwatch>
              ))}
          </ColorPickerSwatchRow>
        ))}
      </ColorPickerSwatchGroup>
      <ColorPickerSwatchTrigger />
    </>
  );
}

function Channels(): React.ReactNode {
  const api = useColorPickerContext();
  return (
    <>
      {api.channels.map((channel) => (
        <div key={channel}>
          <ColorPickerChannelSlider channel={channel}>
            <ColorPickerChannelLabel>{channel}</ColorPickerChannelLabel>
            <ColorPickerChannelSliderTrack>
              <ColorPickerChannelSliderRange />
            </ColorPickerChannelSliderTrack>
            <ColorPickerChannelSliderThumb />
          </ColorPickerChannelSlider>
          <ColorPickerChannelInput channel={channel} />
        </div>
      ))}
    </>
  );
}

interface DemoProps extends ColorPickerRootProps {
  readonly minimal?: boolean;
  readonly withTitle?: boolean;
  /** Only the axe scenes pass one — see `landmarkedHost`. */
  readonly portalContainer?: Element | null;
}

function Demo(props: DemoProps): React.ReactNode {
  const { minimal, withTitle, portalContainer, children, ...root } = props;

  if (minimal === true) {
    return (
      <ColorPickerRoot {...root}>
        <ColorPickerTrigger>
          <ColorPickerTriggerSwatch />
        </ColorPickerTrigger>
      </ColorPickerRoot>
    );
  }

  return (
    <ColorPickerRoot swatches={SWATCHES} swatchColumns={2} {...root}>
      <ColorPickerLabel>Tint</ColorPickerLabel>
      <ColorPickerTrigger>
        <ColorPickerTriggerSwatch />
        <ColorPickerValueText />
      </ColorPickerTrigger>
      <ColorPickerHiddenInput />
      <ColorPickerPortal container={portalContainer}>
        <ColorPickerBackdrop />
        <ColorPickerPositioner>
          <ColorPickerContent>
            {withTitle === true ? <ColorPickerTitle>Colors</ColorPickerTitle> : null}
            <ColorPickerEyedropperTrigger />
            <ColorPickerCloseTrigger />
            <ColorPickerArea>
              <ColorPickerAreaBackground />
              <ColorPickerTransparencyGrid />
              <ColorPickerAreaThumb>
                <ColorPickerAreaXInput />
                <ColorPickerAreaYInput />
              </ColorPickerAreaThumb>
            </ColorPickerArea>
            <Channels />
            <ColorPickerFormatSelect />
            <Swatches />
          </ColorPickerContent>
          <ColorPickerCancelTrigger>Cancel</ColorPickerCancelTrigger>
        </ColorPickerPositioner>
      </ColorPickerPortal>
    </ColorPickerRoot>
  );
}

/**
 * axe wants a landmark around the content it audits, and a portalled surface has
 * none. Created outside React and handed to the portal as its container, never
 * moved after the fact: relocating a portalled node leaves React holding a parent
 * that no longer owns it, and the unmount then throws.
 */
function landmarkedHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Color picker surface");
  document.body.append(host);
  return host;
}

afterEach(() => {
  unmountAll();
  for (const host of document.querySelectorAll('[aria-label="Color picker surface"]')) {
    host.remove();
  }
  input = null;
  vi.unstubAllGlobals();
});

describe("ColorPickerRoot — the surface", () => {
  it("mounts nothing while closed and unmounts it again on the way out", async () => {
    const view = mount(<Demo defaultValue="#0088ff" />);
    expect(queryPart(document.body, "content")).toBeNull();

    fire(() => (queryPart(view.container, "trigger") as HTMLElement).click());
    await settle();
    expect(queryPart(document.body, "content")).not.toBeNull();
    expect(queryPart(document.body, "positioner")).not.toBeNull();

    fire(() => (queryPart(view.container, "trigger") as HTMLElement).click());
    // Asserted as a *removal*, never as `data-state="closed"`: no stylesheet is
    // loaded here, so the exit lasts one frame and reading the attribute would be
    // a race this suite has lost before.
    await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
  });

  it("renders the inline panel in place, with no portal and no way to close it", async () => {
    const view = mount(<Demo presentation="inline" defaultValue="#0088ff" />);
    await settle();

    const content = queryPart(view.container, "content");
    expect(content).not.toBeNull();
    expect(content?.getAttribute("data-presentation")).toBe("inline");
    expect(content?.getAttribute("data-state")).toBe("open");
    expect(content?.getAttribute("role")).toBe("group");
    expect(content?.hasAttribute("aria-modal")).toBe(false);
    // No trigger part rendered by the machine's own choice — the consumer simply
    // does not write one — and no positioner or backdrop either.
    expect(queryPart(view.container, "positioner")).toBeNull();
    expect(queryPart(view.container, "backdrop")).toBeNull();

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(queryPart(view.container, "content")).not.toBeNull();
  });

  it("draws the scrim and the cancel card in a sheet, and neither in a popup", async () => {
    const sheet = mount(<Demo presentation="sheet" defaultOpen />);
    await settle();
    expect(queryPart(document.body, "backdrop")).not.toBeNull();
    expect(queryPart(document.body, "cancel-trigger")).not.toBeNull();
    expect(queryPart(document.body, "content")?.getAttribute("aria-modal")).toBe("true");
    sheet.unmount();

    mount(<Demo presentation="popup" defaultOpen />);
    await settle();
    expect(queryPart(document.body, "backdrop")).toBeNull();
    // Out of the document rather than hidden in CSS: hiding it would leave `End`
    // landing on a row the sheet does not draw.
    expect(queryPart(document.body, "cancel-trigger")).toBeNull();
  });

  /**
   * R63: WebKit never focuses a button it is pressed on, so a real press on the
   * trigger of a popup blurs the focus onto `body` before the click closes it.
   * `body` is nowhere, and the restore has to run.
   */
  it("a real press on the trigger of a popup closes it and refocuses the trigger (R63)", async () => {
    const view = mount(<Demo defaultValue="#0088ff" />);
    await settle();
    const trigger = queryPart(view.container, "trigger") as HTMLElement;

    await realClick(trigger);
    await waitFor(() =>
      expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
    );
    expect(queryPart(document.body, "content")?.hasAttribute("aria-modal")).toBe(false);

    await realClick(trigger);

    await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
    await settle();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ColorPickerRoot — `modal` against the inline panel", () => {
  let outside: HTMLButtonElement | null = null;

  afterEach(() => {
    outside?.remove();
    outside = null;
  });

  function outsideButton(): HTMLButtonElement {
    outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.append(outside);
    return outside;
  }

  it("ignores `modal` inline: no trap, no scroll lock, and the page stays live", async () => {
    const button = outsideButton();
    const view = mount(<Demo presentation="inline" modal defaultValue="#0088ff" />);
    await settle();

    const content = queryPart(view.container, "content");
    expect(content?.getAttribute("role")).toBe("group");
    expect(content?.hasAttribute("aria-modal")).toBe(false);
    expect(content?.hasAttribute("data-snav-trap")).toBe(false);
    expect(button.hasAttribute("inert")).toBe(false);
    expect(isScrollLocked(document)).toBe(false);
  });

  it("still makes the page inert under a modal sheet, the arm the inline one is read against", async () => {
    const button = outsideButton();
    mount(<Demo presentation="sheet" defaultOpen />);
    await settle();

    expect(button.hasAttribute("inert")).toBe(true);
    expect(isScrollLocked(document)).toBe(true);
  });
});

describe("ColorPickerRoot — the keyboard", () => {
  it("visits every stop of the surface once, in the order the spec fixes", async () => {
    mount(<Demo defaultOpen defaultFormat="rgb" withTitle eyedropper={eyedropper} />);
    await settle();

    // The screen picker is a Chromium-only enhancement, and this test used to
    // assume the engine it was written on: it waited for the button unconditionally
    // and hard-coded it as the first of fourteen stops, so the whole case failed on
    // Firefox and WebKit (found by the matrix, 2026-09-05 — 112/113 on firefox).
    //
    // Branching on the API and not on the browser name, so the day an engine gains
    // `EyeDropper` this test follows it without being edited. The absent branch
    // asserts the button is **not there**, which is stronger than skipping the
    // case: a picker that rendered a dead trigger on Firefox would fail here.
    const hasEyedropper = "EyeDropper" in window;
    if (hasEyedropper) {
      // It joins the order once the mount effects have run — the read itself is
      // synchronous, but it happens in an effect and never at render — so the
      // sequence is only complete after a commit: asserting before that would
      // freeze a shape the user never sees.
      await waitFor(() => expect(queryPart(document.body, "eyedropper-trigger")).not.toBeNull());
    } else {
      expect(queryPart(document.body, "eyedropper-trigger")).toBeNull();
    }

    const content = queryPart(document.body, "content") as HTMLElement;
    const tabbable = [...content.querySelectorAll<HTMLElement>("*")].filter(
      (node) => node.tabIndex >= 0 && !node.hasAttribute("disabled"),
    );
    const parts = tabbable.map((node) =>
      (node.getAttribute("data-part") ?? "").replace("color-picker:", ""),
    );

    // `content` itself is `tabindex="-1"`, the second area axis is `-1`, and the
    // swatch grid contributes exactly one cell — so the sequence is the panel's
    // controls and nothing else. Four channels in `rgb` + alpha, each followed by
    // its own field.
    expect(parts).toEqual([
      ...(hasEyedropper ? ["eyedropper-trigger"] : []),
      "close-trigger",
      "area-x-input",
      "channel-slider-thumb",
      "channel-input",
      "channel-slider-thumb",
      "channel-input",
      "channel-slider-thumb",
      "channel-input",
      "channel-slider-thumb",
      "channel-input",
      "format-select",
      "swatch",
      "swatch-trigger",
    ]);
    // Eight of those fourteen are the four channels and their fields — the trap
    // the spec called the most likely keyboard defect of the component.
    expect(parts.filter((part) => part.startsWith("channel-"))).toHaveLength(8);
    expect(queryParts(content, "swatch").filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
  });

  it("types into a field without moving the colour, and commits on Enter", async () => {
    const onValueChange = vi.fn();
    const onValueChangeEnd = vi.fn();
    mount(
      <Demo
        defaultOpen
        defaultValue="#000000"
        onValueChange={onValueChange}
        onValueChangeEnd={onValueChangeEnd}
      />,
    );
    await settle();

    const field = queryParts<HTMLInputElement>(
      document.body,
      "channel-input",
    )[0] as HTMLInputElement;
    fire(() => {
      field.focus();
      // React's `onChange` is the native `input` event; the native setter is what
      // lets React see a value the test wrote.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as (
        this: HTMLInputElement,
        value: string,
      ) => void;
      setter.call(field, "180");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).not.toHaveBeenCalled();

    fire(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    // One report for the commit, and none more for the blur that follows it.
    expect(onValueChangeEnd).toHaveBeenCalledOnce();
    fire(() => field.blur());
    expect(onValueChangeEnd).toHaveBeenCalledOnce();
  });

  describe("a controlled hue track on End", () => {
    // `onValueChangeEnd` reads the colour before the parent's state lands; the
    // emission has to survive that read.
    function Controlled(props: {
      readonly initial: string;
      readonly onEndOnly: boolean;
    }): React.ReactNode {
      const [value, setValue] = useState(props.initial);
      const apply = (details: { value: string }): void => setValue(details.value);
      return props.onEndOnly ? (
        <Demo defaultOpen value={value} onValueChangeEnd={apply} />
      ) : (
        <Demo defaultOpen value={value} onValueChange={apply} onValueChangeEnd={vi.fn()} />
      );
    }

    const hue = (part: string): HTMLElement | undefined =>
      queryParts(document.body, part).find((node) => node.getAttribute("data-channel") === "hue");

    // Read right after the commit the key caused, never through `waitFor`: an
    // unrelated later render would paint the value and hide the missing one.
    async function pressEnd(initial: string, onEndOnly = false): Promise<void> {
      mount(<Controlled initial={initial} onEndOnly={onEndOnly} />);
      await settle();
      const thumb = hue("channel-slider-thumb") as HTMLElement;
      fire(() => thumb.focus());
      fire(() => {
        thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      });
      await settle();
    }

    it("paints 360 when the parent's string changes to the one End emits", async () => {
      await pressEnd("hsb(200 100% 100%)");
      expect(hue("channel-slider-thumb")?.getAttribute("aria-valuenow")).toBe("360");
      expect((hue("channel-input") as HTMLInputElement).value).toBe("360");
    });

    it("paints 360 when the parent already held the string End emits", async () => {
      await pressEnd("#ff0000");
      expect(hue("channel-slider-thumb")?.getAttribute("aria-valuenow")).toBe("360");
      expect((hue("channel-input") as HTMLInputElement).value).toBe("360");
    });

    it("paints 360 when the parent sets its state from the end of the gesture alone", async () => {
      await pressEnd("hsb(200 100% 100%)", true);
      expect(hue("channel-slider-thumb")?.getAttribute("aria-valuenow")).toBe("360");
      expect((hue("channel-input") as HTMLInputElement).value).toBe("360");
    });

    // Green on main; red when the marker follows only the emitted change, which swallows B's write.
    it("paints the entry hue after B for a parent that sets its state from the end alone", async () => {
      mount(
        <NavProvider>
          <Capture />
          <Controlled initial="#00aaff" onEndOnly />
        </NavProvider>,
      );
      await settle();
      const thumb = hue("channel-slider-thumb") as HTMLElement;
      fire(() => thumb.focus());
      fire(() => input?.emit({ intent: "select", source: "gamepad" }));
      expect(queryPart(document.body, "root")?.getAttribute("data-engaged")).toBe("");

      fire(() => input?.emit({ intent: "moveRight", source: "gamepad" }));
      fire(() => input?.emit({ intent: "moveRight", source: "gamepad" }));
      fire(() => input?.emit({ intent: "back", source: "gamepad" }));
      await settle();
      expect(queryPart(document.body, "root")?.hasAttribute("data-engaged")).toBe(false);
      expect(hue("channel-slider-thumb")?.getAttribute("aria-valuenow")).toBe("200");
    });

    // R37: the report is the parent's own string when the colour is the one it holds.
    it("hands a parent that re-parses what it is told its own non-hex string back, after B", async () => {
      const own = "hsb(200 60% 80%)";
      const reported: string[] = [];
      function Holder(): React.ReactNode {
        const [value, setValue] = useState(own);
        return (
          <Demo
            defaultOpen
            value={value}
            onValueChangeEnd={(details) => {
              reported.push(details.value);
              setValue(details.value);
            }}
          />
        );
      }
      mount(
        <NavProvider>
          <Capture />
          <Holder />
        </NavProvider>,
      );
      await settle();
      const areaBefore = (
        queryPart(document.body, "area-thumb") as HTMLElement | null
      )?.style.getPropertyValue("--sui-color-picker-area-x");
      expect(areaBefore).toBe("60%");
      const thumb = hue("channel-slider-thumb") as HTMLElement;
      fire(() => thumb.focus());
      fire(() => input?.emit({ intent: "select", source: "gamepad" }));
      fire(() => input?.emit({ intent: "moveRight", source: "gamepad" }));
      fire(() => input?.emit({ intent: "moveRight", source: "gamepad" }));
      fire(() => input?.emit({ intent: "back", source: "gamepad" }));
      await settle();

      expect(hue("channel-slider-thumb")?.getAttribute("aria-valuenow")).toBe("200");
      const areaX = (): string | undefined =>
        (queryPart(document.body, "area-thumb") as HTMLElement | null)?.style.getPropertyValue(
          "--sui-color-picker-area-x",
        );
      expect(areaX()).toBe(areaBefore);
      expect(reported).toEqual([own]);
    });
  });
});

/**
 * The popup portalled out of a modal dialog. Without a proxy, Tab from its last
 * stop went past the end of the document and out of the modal, and Shift+Tab from
 * its first went to whatever preceded the portal.
 */
describe("ColorPickerRoot — Tab out of the popup, inside a modal dialog", () => {
  async function openInDialog(): Promise<HTMLElement[]> {
    mount(
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Theme</DialogTitle>
              <ColorPicker id="tint" defaultValue="#0088ff" />
              <button type="button">After</button>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );
    await settle();
    await waitFor(() => {
      expect(
        document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
      ).toBe(true);
    });
    const trigger = queryPart(document.body, "color-picker:trigger") as HTMLElement;
    fire(() => {
      trigger.focus();
      trigger.click();
    });
    await settle();
    const content = queryPart(document.body, "color-picker:content") as HTMLElement;
    return [...content.querySelectorAll<HTMLElement>("*")].filter(
      (node) => node.tabIndex >= 0 && !node.hasAttribute("disabled"),
    );
  }

  it("sends a real Tab from the last stop to the element after the trigger", async () => {
    const stops = await openInDialog();
    fire(() => stops.at(-1)?.focus());
    expect(document.activeElement).toBe(stops.at(-1));
    await realKey("{Tab}");
    expect(document.activeElement?.textContent).toBe("After");
  });

  it("sends a real Shift+Tab from the first stop back to the trigger", async () => {
    const stops = await openInDialog();
    fire(() => stops[0]?.focus());
    expect(document.activeElement).toBe(stops[0]);
    await realKey("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(queryPart(document.body, "color-picker:trigger"));
  });
});

describe("ColorPickerRoot — the screen picker", () => {
  it("renders no trigger without the module, even on an engine that has an EyeDropper", async () => {
    // Stubbed so the three engines read the same: Chromium has one of its own.
    vi.stubGlobal(
      "EyeDropper",
      class {
        open(): Promise<{ sRGBHex: string }> {
          return new Promise(() => {});
        }
      },
    );
    const view = mount(<Demo defaultOpen defaultValue="#0088ff" />);
    await settle();

    // The positive control: the parts sync that names the trigger runs in the same
    // mount pass as the detection, so once it has landed the detection has too.
    await waitFor(() =>
      expect(queryPart(view.container, "trigger")?.hasAttribute("aria-labelledby")).toBe(true),
    );
    expect(queryPart(document.body, "content")).not.toBeNull();
    expect(queryPart(document.body, "eyedropper-trigger")).toBeNull();
  });

  it("renders the trigger with the module where the engine has an EyeDropper, and none elsewhere", async () => {
    // Conditional on the engine rather than skipped in silence: Firefox and WebKit
    // genuinely have none, and Chromium genuinely does.
    const supported = "EyeDropper" in window;
    mount(<Demo defaultOpen eyedropper={eyedropper} />);
    await settle();

    if (supported) {
      // The machine looks in a mount effect and never at render — synchronously,
      // the moment the effect runs: a render-time read would either mismatch on
      // hydration or ship a button that throws.
      await waitFor(() => expect(queryPart(document.body, "eyedropper-trigger")).not.toBeNull());
      expect(queryPart(document.body, "eyedropper-trigger")?.getAttribute("aria-label")).toBe(
        "Pick a color from the screen",
      );
    } else {
      expect(queryPart(document.body, "eyedropper-trigger")).toBeNull();
    }
  });

  it("writes nothing when the pick is cancelled, and hands the focus back", async () => {
    const onValueChangeEnd = vi.fn();
    let reject: ((reason: Error) => void) | null = null;
    class StubPicker {
      open(): Promise<{ sRGBHex: string }> {
        return new Promise((_resolve, no) => {
          reject = no;
        });
      }
    }
    vi.stubGlobal("EyeDropper", StubPicker);

    mount(
      <Demo
        defaultOpen
        defaultValue="#0088ff"
        eyedropper={eyedropper}
        onValueChangeEnd={onValueChangeEnd}
      />,
    );
    await settle();
    // The stub makes the trigger appear on every engine — after the frame the
    // machine spends looking.
    await waitFor(() => expect(queryPart(document.body, "eyedropper-trigger")).not.toBeNull());
    const trigger = queryPart(document.body, "eyedropper-trigger") as HTMLElement;

    fire(() => trigger.click());
    const error = new Error("cancelled");
    error.name = "AbortError";
    await fire(() => {
      reject?.(error);
    });
    await settle();

    // A cancelled gesture is not an event to narrate: no value, no report, and no
    // text pushed into a live region. `.not.toBe(null)` used to stand here, which
    // passes whether or not anything changed — and even if the element were
    // missing (`undefined !== null` too) — so it never actually asked whether the
    // mounted colour survived the cancel.
    expect(onValueChangeEnd).not.toHaveBeenCalled();
    expect(queryPart(document.body, "hidden-input")?.getAttribute("value")).toBe("#0088ff");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  describe("names the picked colour, not the one the parent still holds", () => {
    afterEach(() => getLiveAnnouncer(document).destroy());

    function Parent(props: { readonly arm: "adopts" | "endOnly" }): React.ReactNode {
      const [value, setValue] = useState("hsb(200 60% 80%)");
      const apply = (details: { value: string }): void => setValue(details.value);
      return props.arm === "adopts" ? (
        <Demo defaultOpen value={value} eyedropper={eyedropper} onValueChange={apply} />
      ) : (
        <Demo defaultOpen value={value} eyedropper={eyedropper} onValueChangeEnd={apply} />
      );
    }

    async function pick(view: React.ReactNode): Promise<string | null | undefined> {
      let resolve: ((result: { sRGBHex: string }) => void) | null = null;
      vi.stubGlobal(
        "EyeDropper",
        class {
          open(): Promise<{ sRGBHex: string }> {
            return new Promise((yes) => {
              resolve = yes;
            });
          }
        },
      );
      mount(view);
      await settle();
      await waitFor(() => expect(queryPart(document.body, "eyedropper-trigger")).not.toBeNull());
      fire(() => (queryPart(document.body, "eyedropper-trigger") as HTMLElement).click());
      await fire(() => {
        resolve?.({ sRGBHex: "#ff0000" });
      });
      await settle();
      const region = document.querySelector('[data-sui-live-region="polite"]');
      await waitFor(() => expect(region?.textContent).not.toBe(""));
      expect(queryPart(document.body, "hidden-input")?.getAttribute("value")).toBe("#ff0000");
      return region?.textContent;
    }

    it("under a parent that adopts every change", async () => {
      expect(await pick(<Parent arm="adopts" />)).toBe("red selected");
    });

    it("under a parent that listens to the end of the gesture alone", async () => {
      expect(await pick(<Parent arm="endOnly" />)).toBe("red selected");
    });

    it("uncontrolled", async () => {
      expect(
        await pick(<Demo defaultOpen defaultValue="hsb(200 60% 80%)" eyedropper={eyedropper} />),
      ).toBe("red selected");
    });
  });
});

describe("ColorPickerRoot — the screen picker follows its prop after the mount", () => {
  /** An engine that has an `EyeDropper`; every pick it is asked for stays open until aborted. */
  function stubPicker(): AbortSignal[] {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "EyeDropper",
      class {
        open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }> {
          return new Promise((_yes, no) => {
            const signal = options?.signal;
            if (signal === undefined) return;
            signals.push(signal);
            signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              no(error);
            });
          });
        }
      },
    );
    return signals;
  }

  const trigger = (): HTMLElement | null => queryPart(document.body, "eyedropper-trigger");

  async function tabFromContent(): Promise<Element | null> {
    fire(() => (queryPart(document.body, "content") as HTMLElement).focus());
    await realKey("{Tab}");
    return document.activeElement;
  }

  it("takes the part out of the page and of the tab order when the module is removed", async () => {
    stubPicker();
    const view = mount(<Demo defaultOpen eyedropper={eyedropper} />);
    await settle();
    await waitFor(() => expect(trigger()).not.toBeNull());
    // The positive control: the same Tab reaches the part while the module is there.
    expect(await tabFromContent()).toBe(trigger());

    view.render(<Demo defaultOpen />);
    await settle();

    await waitFor(() => expect(trigger()).toBeNull());
    expect(await tabFromContent()).toBe(queryPart(document.body, "close-trigger"));
  });

  it("offers the part when a module arrives on an engine that has the API", async () => {
    stubPicker();
    const view = mount(<Demo defaultOpen />);
    await settle();
    await waitFor(() =>
      expect(queryPart(view.container, "trigger")?.hasAttribute("aria-labelledby")).toBe(true),
    );
    expect(trigger()).toBeNull();

    view.render(<Demo defaultOpen eyedropper={eyedropper} />);
    await settle();

    await waitFor(() => expect(trigger()).not.toBeNull());
    expect(await tabFromContent()).toBe(trigger());
  });

  it("follows the prop both ways, any number of times", async () => {
    stubPicker();
    const view = mount(<Demo defaultOpen />);
    await settle();

    for (const _round of [0, 1]) {
      view.render(<Demo defaultOpen eyedropper={eyedropper} />);
      await waitFor(() => expect(trigger()).not.toBeNull());
      view.render(<Demo defaultOpen eyedropper={undefined} />);
      await waitFor(() => expect(trigger()).toBeNull());
    }
  });

  it("calls off a pick in flight, and hands the focus the part held to the area", async () => {
    const signals = stubPicker();
    const onValueChangeEnd = vi.fn();
    const view = mount(
      <Demo
        defaultOpen
        defaultValue="#0088ff"
        eyedropper={eyedropper}
        onValueChangeEnd={onValueChangeEnd}
      />,
    );
    await settle();
    await waitFor(() => expect(trigger()).not.toBeNull());
    fire(() => {
      trigger()?.focus();
      trigger()?.click();
    });
    await settle();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    expect(document.activeElement).toBe(trigger());

    view.render(<Demo defaultOpen defaultValue="#0088ff" onValueChangeEnd={onValueChangeEnd} />);
    await settle();

    await waitFor(() => expect(trigger()).toBeNull());
    expect(signals[0]?.aborted).toBe(true);
    // Not `body`, and not the part that is gone: the area's input, the panel's
    // control that the machine itself hands the focus to. In this tree the close
    // trigger sits between the two, so it is not the next tab stop.
    expect(document.activeElement).toBe(queryPart(document.body, "area-x-input"));
    expect(onValueChangeEnd).not.toHaveBeenCalled();
    expect(queryPart(document.body, "hidden-input")?.getAttribute("value")).toBe("#0088ff");
  });

  it("keeps the part and its focus, and ends the pick, when another module takes over", async () => {
    const signals = stubPicker();
    const view = mount(<Demo defaultOpen eyedropper={eyedropper} />);
    await settle();
    await waitFor(() => expect(trigger()).not.toBeNull());
    fire(() => {
      trigger()?.focus();
      trigger()?.click();
    });
    await settle();
    expect(signals[0]?.aborted).toBe(false);

    view.render(<Demo defaultOpen eyedropper={{ ...eyedropper }} />);
    await settle();

    // The outgoing module's disposer ran, as it does for a picker that goes away.
    expect(signals[0]?.aborted).toBe(true);
    expect(trigger()).not.toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("hands the focus to the panel when the composition has no area to hand it to", async () => {
    stubPicker();
    function NoArea(props: ColorPickerRootProps): React.ReactNode {
      return (
        <ColorPickerRoot defaultOpen {...props}>
          <ColorPickerTrigger>
            <ColorPickerTriggerSwatch />
          </ColorPickerTrigger>
          <ColorPickerPortal>
            <ColorPickerPositioner>
              <ColorPickerContent>
                <ColorPickerEyedropperTrigger />
                <ColorPickerCloseTrigger />
              </ColorPickerContent>
            </ColorPickerPositioner>
          </ColorPickerPortal>
        </ColorPickerRoot>
      );
    }
    const view = mount(<NoArea eyedropper={eyedropper} />);
    await settle();
    await waitFor(() => expect(trigger()).not.toBeNull());
    fire(() => trigger()?.focus());
    expect(document.activeElement).toBe(trigger());

    view.render(<NoArea />);
    await settle();

    await waitFor(() => expect(trigger()).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(queryPart(document.body, "content"));
  });
});

describe("ColorPickerRoot — the gamepad", () => {
  it("takes hold of a channel on A and lets go on B without closing the surface", async () => {
    mount(
      <NavProvider>
        <Capture />
        <Demo defaultOpen defaultValue="hsb(200 50% 50%)" />
      </NavProvider>,
    );
    await settle();

    const thumb = queryPart(document.body, "channel-slider-thumb") as HTMLElement;
    fire(() => thumb.focus());
    fire(() => input?.emit({ intent: "select", source: "gamepad" }));

    const root = queryPart(document.body, "root") as HTMLElement;
    expect(root.getAttribute("data-engaged")).toBe("");
    expect(queryPart(document.body, "channel-slider")?.getAttribute("data-engaged")).toBe("");

    fire(() => input?.emit({ intent: "moveRight", source: "gamepad" }));
    fire(() => input?.emit({ intent: "back", source: "gamepad" }));

    expect(root.hasAttribute("data-engaged")).toBe(false);
    // B let go of the value; it did not pop the layer underneath.
    expect(queryPart(document.body, "content")).not.toBeNull();
  });

  /**
   * R17: `inline` is open from mount, so the A scope opens before the trap of the
   * dialog around it.
   */
  it("takes hold of a channel on A inline, inside a modal dialog that traps", async () => {
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Tint</DialogTitle>
                <Demo presentation="inline" defaultValue="hsb(200 50% 50%)" />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the thumb before the pad is pressed.
    const dialog = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(dialog?.contains(document.activeElement)).toBe(true));
    const thumb = queryPart(document.body, "channel-slider-thumb") as HTMLElement;
    fire(() => thumb.focus());
    await settle();
    expect(document.activeElement).toBe(thumb);

    fire(() => input?.emit({ intent: "select", source: "gamepad" }));
    await settle();

    const root = document.querySelector('[data-part~="color-picker:root"]');
    expect(root?.getAttribute("data-engaged")).toBe("");
  });
});

describe("ColorPickerRoot — the crossed shape", () => {
  it("mounts with no alpha, a wheel, inline and right-to-left all at once", async () => {
    const view = mount(
      <Demo
        alpha={false}
        variant="wheel"
        presentation="inline"
        dir="rtl"
        defaultValue="#0088ff"
        eyedropper={eyedropper}
      />,
    );
    await settle();

    // The crossing is what has broken components before, so it is asserted rather
    // than assumed: no alpha part anywhere in the document.
    expect(
      queryParts(view.container, "channel-slider").map((node) => node.getAttribute("data-channel")),
    ).toEqual(["hue"]);
    expect(
      queryParts(view.container, "channel-input").map((node) => node.getAttribute("data-channel")),
    ).toEqual(["hue"]);
    expect(view.container.querySelector('[data-channel="alpha"]')).toBeNull();
    expect(queryPart(view.container, "root")?.getAttribute("dir")).toBe("rtl");
    expect(queryPart(view.container, "root")?.getAttribute("data-variant")).toBe("wheel");

    await expectNoAxeViolations(view.container);
  });
});

describe("ColorPickerRoot — the shapes the audit made mandatory", () => {
  it("connects with none of the optional parts rendered", async () => {
    const view = mount(<Demo minimal defaultValue="#0088ff" />);
    await settle();

    const trigger = queryPart(view.container, "trigger") as HTMLElement;
    expect(trigger.getAttribute("aria-label")).toBe("#0088ff");
    expect(trigger.hasAttribute("aria-labelledby")).toBe(false);
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    await expectNoAxeViolations(view.container);
  });

  /**
   * A labelled picker has to announce *which colour* it holds, not just what it
   * is for. The trigger says so through `aria-labelledby`, and the parity table
   * cannot see this: it compares two markups, and both spellings render
   * `valueText` beside the button, so they agree while being equally silent.
   *
   * Measured on the shipped demo before the fix: both triggers came out named
   * "Accent" and "Brand". The button's only child is the swatch, and the swatch
   * is `aria-hidden`, so pointing `aria-labelledby` at the trigger's own id —
   * ARIA's way of saying "and my own contents" — added nothing at all.
   */
  it("names a labelled trigger with the colour, not the label alone", async () => {
    const view = mount(<ColorPicker id="accent" label="Accent" defaultValue="#0088ff" />);
    await settle();

    const trigger = queryPart(view.container, "trigger") as HTMLElement;
    const label = queryPart(view.container, "label") as HTMLElement;
    const valueText = queryPart(view.container, "value-text") as HTMLElement;

    // Every IDREF resolves — a dangling one is no name *and* an axe failure.
    const ids = (trigger.getAttribute("aria-labelledby") ?? "").split(" ").filter(Boolean);
    expect(ids).toHaveLength(2);
    const targets = ids.map((id) => view.container.ownerDocument.getElementById(id));
    expect(targets.every((node) => node !== null)).toBe(true);

    expect(ids[0]).toBe(label.id);
    expect(ids[1]).toBe(valueText.id);

    // The name ARIA computes from that list, in order.
    const name = targets.map((node) => node?.textContent?.trim()).join(" ");
    expect(name).toBe("Accent #0088ff");

    // And the fallback still stands where it always did: with no label part, the
    // colour arrives through `aria-label` instead.
    expect(trigger.hasAttribute("aria-label")).toBe(false);

    await expectNoAxeViolations(view.container);
  });

  it("leaves no tab stop in the inline panel once the picker is disabled", async () => {
    const view = mount(<Demo disabled presentation="inline" eyedropper={eyedropper} />);
    await settle();

    for (const cell of queryParts(view.container, "swatch")) {
      expect(cell.hasAttribute("tabindex")).toBe(false);
    }
    expect(queryPart(view.container, "channel-slider-thumb")?.hasAttribute("tabindex")).toBe(false);
    await expectNoAxeViolations(view.container);
  });
});

/**
 * R58: opened, then disabled (decision 61), then closed. The trigger is
 * `disabled` and takes nothing, and the unmounted content takes the focus down
 * to `body` unless the restore falls back on the trigger's neighbour. The
 * consumer's own button inside the content stays a stop, so the close is reached
 * by a real Tab.
 */
describe("ColorPickerRoot — closed after it was disabled while open", () => {
  function Scene(props: {
    readonly disabled: boolean;
    readonly presentation: "popup" | "sheet";
  }): React.ReactNode {
    return (
      <NavProvider>
        <Capture />
        <button type="button">Before</button>
        <ColorPickerRoot
          defaultValue="#0088ff"
          disabled={props.disabled}
          presentation={props.presentation}
        >
          <ColorPickerTrigger>
            <ColorPickerTriggerSwatch />
          </ColorPickerTrigger>
          <ColorPickerPortal>
            <ColorPickerPositioner>
              <ColorPickerContent>
                <button type="button">Inside</button>
                <ColorPickerCloseTrigger />
              </ColorPickerContent>
            </ColorPickerPositioner>
          </ColorPickerPortal>
        </ColorPickerRoot>
        <button type="button">After</button>
      </NavProvider>
    );
  }

  async function openThen(presentation: "popup" | "sheet", disable: boolean): Promise<HTMLElement> {
    const view = mount(<Scene disabled={false} presentation={presentation} />);
    await settle();
    const trigger = queryPart(view.container, "trigger") as HTMLElement;
    fire(() => trigger.focus());
    fire(() => trigger.click());
    await settle();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Inside"));
    if (disable) {
      view.render(<Scene disabled presentation={presentation} />);
      await settle();
      expect((trigger as HTMLButtonElement).disabled).toBe(true);
    }
    return trigger;
  }

  const closes: Record<string, () => Promise<void>> = {
    "the close trigger, on a real Enter": async () => {
      await realKey("{Tab}");
      expect(document.activeElement).toBe(queryPart(document.body, "close-trigger"));
      await realKey("{Enter}");
    },
    "a real Escape": async () => {
      await realKey("{Escape}");
    },
    "the pad's B": async () => {
      fire(() => {
        input?.emit({ intent: "back", source: "gamepad" });
      });
    },
  };

  for (const presentation of ["popup", "sheet"] as const) {
    for (const [route, close] of Object.entries(closes)) {
      it(`hands the focus to the next tab stop when closed by ${route} (${presentation})`, async () => {
        await openThen(presentation, true);
        await close();
        await settle();
        await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
        await waitFor(() => expect(document.activeElement?.textContent).toBe("After"));
        expect(document.activeElement).not.toBe(document.body);
      });

      it(`still hands the focus to an enabled trigger when closed by ${route} (${presentation})`, async () => {
        const trigger = await openThen(presentation, false);
        await close();
        await settle();
        await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
      });
    }
  }
});

describe("ColorPickerRoot — axe", () => {
  it("passes with the trigger closed", async () => {
    const view = mount(<Demo defaultValue="#0088ff" />);
    await settle();
    await expectNoAxeViolations(view.container);
  });

  it("passes with the anchored surface open", async () => {
    const host = landmarkedHost();
    mount(<Demo defaultOpen withTitle portalContainer={host} eyedropper={eyedropper} />);
    await settle();

    expect(queryPart(host, "content")?.getAttribute("role")).toBe("dialog");
    await expectNoAxeViolations(host);
  });

  it("passes with the modal sheet open, cancel card and all", async () => {
    const host = landmarkedHost();
    mount(
      <Demo
        presentation="sheet"
        defaultOpen
        withTitle
        portalContainer={host}
        eyedropper={eyedropper}
      />,
    );
    await settle();

    expect(queryPart(host, "cancel-trigger")).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  /**
   * `required` used to reach the DOM as `aria-required` on the trigger, and the
   * trigger has no `role`: it is an implicit `button`, whose role-specific ARIA
   * set is `aria-expanded` and `aria-pressed`. `aria-required` is neither of
   * those nor a global attribute, unlike the `aria-invalid` it sat beside. No axe
   * scene mounted a required picker, which is how it shipped.
   */
  it("passes with `required`, which the trigger's implicit button role forbids as ARIA", async () => {
    const view = mount(<Demo required defaultValue="#0088ff" />);
    await settle();
    await expectNoAxeViolations(view.container);

    expect(queryPart(view.container, "trigger")?.hasAttribute("aria-required")).toBe(false);
    expect(queryPart(view.container, "root")?.getAttribute("data-required")).toBe("");
  });

  it("passes as an inline panel, which is the shape with no dialog at all", async () => {
    const view = mount(
      <Demo presentation="inline" withTitle defaultValue="#0088ff" eyedropper={eyedropper} />,
    );
    await settle();

    const content = queryPart(view.container, "content");
    expect(content?.getAttribute("role")).toBe("group");
    expect(content?.getAttribute("aria-labelledby")).toBe(
      queryPart(view.container, "title")?.getAttribute("id"),
    );
    await expectNoAxeViolations(view.container);
  });

  it("passes read-only, with the area's two range inputs read-only like the rest", async () => {
    const view = mount(
      <Demo readOnly presentation="inline" defaultValue="#0088ff" eyedropper={eyedropper} />,
    );
    await settle();

    for (const part of ["area-x-input", "area-y-input", "channel-slider-thumb"]) {
      for (const node of queryParts(view.container, part)) {
        expect(node.getAttribute("aria-readonly"), part).toBe("true");
      }
    }
    expect(queryParts(view.container, "area-x-input")).toHaveLength(1);
    expect(queryParts(view.container, "area-y-input")).toHaveLength(1);
    expect(queryParts(view.container, "channel-slider-thumb").length).toBeGreaterThan(0);
    await expectNoAxeViolations(view.container);
  });
});

/**
 * R77, decision 68: in a sheet, Escape and the pad's B outside a hold cancel as
 * the cancel card does — the entry colour comes back, then the surface closes.
 * A popup has no cancel, so there both keep the colour. The colour is moved by a
 * real arrow key first, so there is something to put back.
 */
describe("ColorPickerRoot — Escape and B cancel in a sheet, keep in a popup (R77)", () => {
  const ENTRY = "#0088ff";

  async function openAndMove(
    presentation: "popup" | "sheet",
    pad: boolean,
  ): Promise<{ reasons: string[]; ends: string[] }> {
    const reasons: string[] = [];
    const ends: string[] = [];
    const picker = (
      <Demo
        presentation={presentation}
        defaultOpen
        defaultValue={ENTRY}
        onDismiss={(details) => reasons.push(details.reason)}
        onValueChangeEnd={(details) => ends.push(details.value)}
      />
    );
    mount(
      pad ? (
        <NavProvider>
          <Capture />
          {picker}
        </NavProvider>
      ) : (
        picker
      ),
    );
    await settle();
    // The surface places its own first focus; wait for it before taking it.
    await waitFor(() =>
      expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
    );
    const thumb = queryParts(document.body, "channel-slider-thumb").find(
      (node) => node.getAttribute("data-channel") === "hue",
    ) as HTMLElement;
    fire(() => thumb.focus());
    expect(document.activeElement).toBe(thumb);
    await realKey("{ArrowRight}");
    expect(hidden().value).not.toBe(ENTRY);
    return { reasons, ends };
  }

  const hidden = (): HTMLInputElement =>
    queryPart(document.body, "hidden-input") as HTMLInputElement;

  const routes = {
    "a real Escape": { pad: false, reason: "escape", press: () => realKey("{Escape}") },
    "the pad's B": {
      pad: true,
      reason: "back",
      press: async () => {
        fire(() => input?.emit({ intent: "back", source: "gamepad" }));
        await settle();
      },
    },
  } as const;

  for (const [route, { pad, reason, press }] of Object.entries(routes)) {
    it(`sheet: ${route} puts the entry colour back, then closes with "${reason}"`, async () => {
      const { reasons, ends } = await openAndMove("sheet", pad);
      await press();
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      expect(reasons).toEqual([reason]);
      expect(hidden().value).toBe(ENTRY);
      expect(ends.at(-1)).toBe(ENTRY);
    });

    it(`popup: ${route} closes with "${reason}" and keeps the colour`, async () => {
      const { reasons } = await openAndMove("popup", pad);
      const moved = hidden().value;
      await press();
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      expect(reasons).toEqual([reason]);
      expect(hidden().value).toBe(moved);
    });
  }

  const hueField = (): HTMLInputElement =>
    queryParts(document.body, "channel-input").find(
      (node) => node.getAttribute("data-channel") === "hue",
    ) as HTMLInputElement;

  // Under `NavProvider` too: the keyboard's `back` must not outrun the layer's
  // veto and close the sheet over a draft.
  for (const pad of [false, true]) {
    it(`sheet${pad ? " under NavProvider" : ""}: Escape in a field with a draft reverts the draft and leaves the panel open`, async () => {
      const { reasons } = await openAndMove("sheet", pad);
      const moved = hidden().value;
      fire(() => hueField().focus());
      const shown = hueField().value;
      await realKey("{Backspace}");
      expect(hueField().value).not.toBe(shown);
      await realKey("{Escape}");
      await settle();
      expect(queryPart(document.body, "content")).not.toBeNull();
      expect(hueField().value).toBe(shown);
      expect(hidden().value).toBe(moved);
      expect(reasons).toEqual([]);
    });
  }

  it("sheet under NavProvider: a real Escape cancels once, with one reason and one report", async () => {
    const { reasons, ends } = await openAndMove("sheet", true);
    const moved = hidden().value;
    expect(ends).toEqual([moved]);
    await realKey("{Escape}");
    await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
    await settle();
    expect(reasons).toEqual(["escape"]);
    expect(ends).toEqual([moved, ENTRY]);
    expect(hidden().value).toBe(ENTRY);
  });
});

/**
 * R36, decision 68: a hold replaces the snapshot B restores inside it (decision
 * 64), but the sheet's cancel and its doubles put back the colour the surface
 * *opened* with, whatever holds came and went in between.
 */
describe("ColorPickerRoot — a sheet's cancel puts back the opening colour after a hold (R36)", () => {
  const ENTRY = "#0088ff";

  const hidden = (): HTMLInputElement =>
    queryPart(document.body, "hidden-input") as HTMLInputElement;

  const hueThumb = (): HTMLElement =>
    queryParts(document.body, "channel-slider-thumb").find(
      (node) => node.getAttribute("data-channel") === "hue",
    ) as HTMLElement;

  async function pad(intent: "select" | "moveRight" | "back"): Promise<void> {
    fire(() => input?.emit({ intent, source: "gamepad" }));
    await settle();
  }

  async function openSheet(): Promise<{ ends: string[] }> {
    const ends: string[] = [];
    mount(
      <NavProvider>
        <Capture />
        <Demo
          presentation="sheet"
          defaultOpen
          defaultValue={ENTRY}
          onValueChangeEnd={(details) => ends.push(details.value)}
        />
      </NavProvider>,
    );
    await settle();
    await waitFor(() =>
      expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
    );
    fire(() => hueThumb().focus());
    expect(document.activeElement).toBe(hueThumb());
    return { ends };
  }

  const sequences = {
    "a committed hold (A, right, right, A)": async () => {
      await pad("select");
      expect(queryPart(document.body, "root")?.hasAttribute("data-engaged")).toBe(true);
      await pad("moveRight");
      await pad("moveRight");
      await pad("select");
      expect(hidden().value).not.toBe(ENTRY);
    },
    "an arrow, then a cancelled hold (right, A, right, B)": async () => {
      await realKey("{ArrowRight}");
      const moved = hidden().value;
      expect(moved).not.toBe(ENTRY);
      await pad("select");
      await pad("moveRight");
      expect(hidden().value).not.toBe(moved);
      await pad("back");
      // Decision 64: B inside the hold puts back the hold's own start.
      expect(hidden().value).toBe(moved);
      expect(queryPart(document.body, "content")).not.toBeNull();
    },
  } as const;

  const closes = {
    "the pad's B": () => pad("back"),
    "a real Escape": () => realKey("{Escape}"),
    "the cancel": async () => {
      fire(() => (queryPart(document.body, "cancel-trigger") as HTMLElement).click());
      await settle();
    },
  } as const;

  // Neither B nor Escape is in this one: inside a hold both end the hold (decision 68).
  it("during an arrow then a hold still running (right, A, right), the cancel puts back the opening colour", async () => {
    const { ends } = await openSheet();
    await realKey("{ArrowRight}");
    await pad("select");
    await pad("moveRight");
    expect(queryPart(document.body, "root")?.hasAttribute("data-engaged")).toBe(true);
    await closes["the cancel"]();
    await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
    await settle();
    expect(hidden().value).toBe(ENTRY);
    expect(ends.at(-1)).toBe(ENTRY);
  });

  /**
   * Decision 68, in the reference app's topology: the `NavProvider` is mounted before the
   * surface opens, so its keydown listener runs ahead of the layer's. Both
   * orders are held to the same answer.
   */
  for (const opened of ["after the NavProvider", "with defaultOpen"] as const) {
    it(`opened ${opened}: Escape during a hold lets the hold go, a second Escape cancels`, async () => {
      const reasons: string[] = [];
      const ends: string[] = [];
      mount(
        <NavProvider>
          <Capture />
          <Demo
            presentation="sheet"
            defaultOpen={opened === "with defaultOpen"}
            defaultValue={ENTRY}
            onDismiss={(details) => reasons.push(details.reason)}
            onValueChangeEnd={(details) => ends.push(details.value)}
          />
        </NavProvider>,
      );
      await settle();
      if (opened === "after the NavProvider") {
        fire(() => (queryPart(document.body, "trigger") as HTMLElement).click());
        await settle();
      }
      await waitFor(() =>
        expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
      );
      fire(() => hueThumb().focus());
      await realKey("{ArrowRight}");
      const moved = hidden().value;
      expect(moved).not.toBe(ENTRY);
      await pad("select");
      await pad("moveRight");
      expect(hidden().value).not.toBe(moved);
      expect(queryPart(document.body, "root")?.hasAttribute("data-engaged")).toBe(true);

      await realKey("{Escape}");
      await settle();
      expect(queryPart(document.body, "content")).not.toBeNull();
      expect(queryPart(document.body, "root")?.hasAttribute("data-engaged")).toBe(false);
      expect(hidden().value).toBe(moved);
      expect(ends.at(-1)).toBe(moved);
      expect(reasons).toEqual([]);

      await realKey("{Escape}");
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      await settle();
      expect(reasons).toEqual(["escape"]);
      expect(hidden().value).toBe(ENTRY);
      expect(ends.at(-1)).toBe(ENTRY);
    });
  }

  // R36: the colour put back is the one of *this* opening, not the initial value.
  for (const [close, press] of Object.entries(closes)) {
    it(`after a reopening and a committed hold, ${close} puts back the second opening's colour`, async () => {
      const { ends } = await openSheet();
      await realKey("{ArrowRight}");
      const reopened = hidden().value;
      expect(reopened).not.toBe(ENTRY);
      fire(() => (queryPart(document.body, "close-trigger") as HTMLElement).click());
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      expect(hidden().value).toBe(reopened);

      fire(() => (queryPart(document.body, "trigger") as HTMLElement).click());
      await settle();
      await waitFor(() =>
        expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
      );
      fire(() => hueThumb().focus());
      await pad("select");
      await pad("moveRight");
      await pad("select");
      expect(hidden().value).not.toBe(reopened);

      await press();
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      await settle();
      expect(hidden().value).toBe(reopened);
      expect(ends.at(-1)).toBe(reopened);
    });
  }

  for (const [sequence, run] of Object.entries(sequences)) {
    for (const [close, press] of Object.entries(closes)) {
      it(`after ${sequence}, ${close} puts back the opening colour`, async () => {
        const { ends } = await openSheet();
        await run();
        await press();
        await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
        expect(hidden().value).toBe(ENTRY);
        expect(ends.at(-1)).toBe(ENTRY);
      });
    }
  }
});
