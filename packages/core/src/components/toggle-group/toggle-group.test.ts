/**
 * The node half of `toggle-group`: no document, no framework, the shape a server
 * render has. Both the item order and the single tab stop are settled against the
 * real item list, so this is where their "nothing found yet" answers are pinned.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./toggle-group.connect";
import { machine } from "./toggle-group.machine";
import type {
  ToggleGroupApi,
  ToggleGroupMachineProps,
  ToggleGroupSchema,
} from "./toggle-group.types";

type Api = ToggleGroupApi<PlainPropTypes>;

const build = (props: ToggleGroupMachineProps = {}) =>
  connectWithoutDom<ToggleGroupSchema, Api>({ machine, connect, id: "t1", props });

describe("toggle-group without a DOM", () => {
  it("connects on a server, where it can find none of its own items", () => {
    const harness = build({ defaultValue: ["b"] });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root["aria-labelledby"]).toBeUndefined();
    expect(root.style).toEqual({ "--sui-segment-count": "1" });
    expect(harness.api().getIndicatorProps()["data-empty"]).toBe("");

    // And this is the attribute that has to survive into the served HTML. The
    // numbers above place the pill a full track to the left of the control; what
    // keeps it from sliding in from there when the page hydrates is that the
    // markup already said "do not travel" before the client ever ran.
    expect(harness.api().getIndicatorProps()["data-immediate"]).toBe("");
  });

  it("marks the measured sizing on the root and publishes nothing measured on a server", () => {
    const content = build({ sizing: "content", defaultValue: ["b"] });
    const root = content.api().getRootProps();

    expect(root["data-sizing"]).toBe("content");
    expect(root.style).toEqual({ "--sui-segment-count": "1" });
    expect(content.api().getIndicatorProps()["data-empty"]).toBe("");
    expect(content.api().getIndicatorProps()["data-immediate"]).toBe("");

    expect(build().api().getRootProps()["data-sizing"]).toBeUndefined();
  });

  it("is two APG patterns in one presentation", () => {
    const single = build().api().getRootProps();
    const multiple = build({ multiple: true }).api().getRootProps();

    expect(single.role).toBe("radiogroup");
    // `aria-orientation` is supported on `radiogroup` and not on `group`.
    expect(single["aria-orientation"]).toBe("horizontal");
    expect(multiple.role).toBe("group");
    expect(multiple["aria-orientation"]).toBeUndefined();
  });

  it("spells an item as a radio or as a pressed button, never as both", () => {
    const single = build({ defaultValue: ["b"] })
      .api()
      .getItemProps({ value: "b" });
    const multiple = build({ multiple: true, defaultValue: ["b"] })
      .api()
      .getItemProps({ value: "b" });

    expect(single.role).toBe("radio");
    expect(single["aria-checked"]).toBe("true");
    expect(single["aria-pressed"]).toBeUndefined();

    expect(multiple.role).toBeUndefined();
    expect(multiple["aria-pressed"]).toBe("true");
    expect(multiple["aria-checked"]).toBeUndefined();
  });

  it("leaves the tab order alone until the item list has been read", () => {
    // The composite's single tab stop is settled by the machine against the real
    // items, and a server render has none. Saying `-1` on all of them — the
    // selected one included — took the whole control out of the tab order until
    // hydration; saying nothing leaves the items as the buttons they are.
    const api = build({ defaultValue: ["b"] }).api();

    expect(api.getItemProps({ value: "a" }).tabIndex).toBeUndefined();
    expect(api.getItemProps({ value: "b" }).tabIndex).toBeUndefined();
  });
});

describe("toggle-group — the frame and the drawn bar", () => {
  it("names the frame, the bar and the thumb, and hides the bar from the tree", () => {
    const api = build({ dir: "rtl" }).api();
    const frame = api.getFrameProps();
    const bar = api.getScrollbarProps();
    const thumb = api.getThumbProps();

    expect(frame["data-part"]).toBe("toggle-group:frame");
    expect(frame["dir"]).toBe("rtl");
    expect(frame["data-orientation"]).toBe("horizontal");
    expect(bar["data-part"]).toBe("toggle-group:scrollbar");
    expect(bar["aria-hidden"]).toBe("true");
    expect(bar["data-orientation"]).toBe("horizontal");
    expect(thumb["data-part"]).toBe("toggle-group:thumb");
    expect(new Set([frame["id"], api.getRootProps()["id"], bar["id"], thumb["id"]]).size).toBe(4);
  });

  it("writes no state a bar owns: the effect does", () => {
    const api = build().api();

    expect(api.getScrollbarProps()["data-state"]).toBeUndefined();
    expect(api.getScrollbarProps()["data-dragging"]).toBeUndefined();
    expect(api.getThumbProps()["style"]).toBeUndefined();
  });
});
