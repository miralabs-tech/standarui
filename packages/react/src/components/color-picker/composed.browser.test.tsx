/**
 * The composed picker in a real engine.
 *
 * `packages/react/src/composed.test.tsx` proves the markup is the parts', to the
 * character, and `composed.parity.tsx` holds its rows. What a string comparison
 * cannot see is a part that is wrong on *both* sides of it: every row of that
 * table is `presentation="inline"`, and the two arms agreed for three phases on
 * rendering a trigger and a ✕ there — a button that announces a panel it cannot
 * open and one that cannot close a panel that never closes. Parity is blind to an
 * error the two forms share, and this file is where that class of defect is caught.
 *
 * It also holds what the panel *says*. The composed layer printed the machine's own
 * channel keys as visible labels, so a slider was called "alpha" where the reference design
 * writes "Opacity" — a string the parity table happily compared to itself.
 */

import { eyedropper } from "@standarui/core/color-picker/eyedropper";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { ColorPicker } from "./composed";

afterEach(() => {
  unmountAll();
});

const textOfLabel = (channel: string): string | undefined =>
  queryParts(document.body, "channel-label")
    .find((node) => node.dataset.channel === channel)
    ?.textContent?.trim();

describe("the channel labels the composed layer prints", () => {
  it("are the library's names, not the machine's keys", async () => {
    mount(<ColorPicker id="tint" presentation="inline" defaultValue="#0088ff" />);
    await settle();

    // "Opacity" is what the reference design writes; `alpha` is what the machine calls it.
    expect(textOfLabel("alpha")).toBe("Opacity");
    expect(textOfLabel("hue")).toBe("Hue");
  });

  it("go through `translations.channelLabel` when a consumer supplies one", async () => {
    mount(
      <ColorPicker
        id="tint"
        presentation="inline"
        defaultValue="#0088ff"
        translations={{ channelLabel: (channel) => channel.toUpperCase() }}
      />,
    );
    await settle();

    // The seam was reachable only through the `aria-label` of a channel whose label
    // is *not* rendered — which is the opposite of the case that needs it.
    expect(textOfLabel("alpha")).toBe("ALPHA");
  });
});

describe("an inline panel", () => {
  it("renders no trigger, because it has nothing to open", async () => {
    mount(<ColorPicker id="tint" presentation="inline" defaultValue="#0088ff" />);
    await settle();

    expect(queryPart(document.body, "trigger")).toBeNull();
  });

  it("renders no close button, because it never closes", async () => {
    mount(<ColorPicker id="tint" presentation="inline" defaultValue="#0088ff" />);
    await settle();

    expect(queryPart(document.body, "close-trigger")).toBeNull();
    // And the panel really is the thing that stays: the content is there without
    // anything having been opened.
    expect(queryPart(document.body, "content")).not.toBeNull();
  });

  it("has no axe violation once those two are gone", async () => {
    // With the screen picker's module, so the engine that draws its trigger audits it.
    const view = mount(
      <ColorPicker
        id="tint"
        presentation="inline"
        defaultValue="#0088ff"
        eyedropper={eyedropper}
      />,
    );
    await settle();

    await expectNoAxeViolations(view.container);
  });
});

describe("a popup panel", () => {
  it("keeps the trigger, and its `aria-expanded` is honest", async () => {
    mount(<ColorPicker id="tint" presentation="popup" defaultValue="#0088ff" />);
    await settle();

    const trigger = queryPart(document.body, "trigger");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.getAttribute("aria-controls")).toBeNull();

    fire(() => trigger?.click());
    await waitFor(() => {
      expect(queryPart(document.body, "content")).not.toBeNull();
    });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-controls")).not.toBeNull();
  });

  it("keeps the close button, and clicking it closes the panel", async () => {
    mount(<ColorPicker id="tint" presentation="popup" defaultOpen defaultValue="#0088ff" />);
    await settle();

    const close = queryPart(document.body, "close-trigger");
    expect(close).not.toBeNull();

    fire(() => close?.click());
    await waitFor(() => {
      expect(queryPart(document.body, "content")).toBeNull();
    });
  });
});

describe("the swatch grid", () => {
  it("is placed when there are swatches to place", async () => {
    mount(
      <ColorPicker
        id="tint"
        presentation="inline"
        defaultValue="#0088ff"
        swatches={["#ff3b30", "#34c759", "#0a84ff"]}
      />,
    );
    await settle();

    expect(queryPart(document.body, "swatch-group")).not.toBeNull();
    expect(queryParts(document.body, "swatch").length).toBe(3);
    expect(queryPart(document.body, "swatch-indicator")).not.toBeNull();
    // The "+" is a sibling of the grid, never a cell of it: a `<button>` inside a
    // `gridcell` is `nested-interactive`.
    const trigger = queryPart(document.body, "swatch-trigger");
    expect(trigger).not.toBeNull();
    expect(trigger?.closest('[role="gridcell"]')).toBeNull();
  });

  it("is absent entirely when there are none, rather than empty", async () => {
    mount(<ColorPicker id="tint" presentation="inline" defaultValue="#0088ff" />);
    await settle();

    expect(queryPart(document.body, "swatch-group")).toBeNull();
    expect(queryPart(document.body, "swatch-trigger")).toBeNull();
  });
});
