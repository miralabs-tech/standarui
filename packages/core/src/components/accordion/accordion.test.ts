/**
 * The node half of `accordion`: no document, no framework — the shape a server
 * render has, plus the one thing in this component that is genuinely pure.
 *
 * Everything the machine *does* needs a document. `setFocusedValue` reads the
 * modality off one, `navigate` reads the header order off one, and the whole
 * collapse choreography measures one; `connectWithoutDom` deliberately never
 * calls `start()`, because a server never runs a mount effect. So the behaviour
 * lives in `accordion.browser.test.ts`, against a real engine, and what is proved
 * here is the markup that goes over the wire — which is also the markup the first
 * client render has to agree with — and the keyboard table, which is a pure
 * function of the key.
 *
 * `hidden` on the server is the point of the first half. A panel that arrived
 * open would be painted and then collapsed on hydration, which is the flash this
 * component exists to make impossible.
 */

import { describe, expect, it } from "vitest";
import type { EventHandler } from "../../machine/prop-types";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./accordion.connect";
import { machine } from "./accordion.machine";
import type { AccordionApi, AccordionMachineProps, AccordionSchema } from "./accordion.types";

type Api = AccordionApi<PlainPropTypes>;

const build = (props: AccordionMachineProps = {}) =>
  connectWithoutDom<AccordionSchema, Api>({ machine, connect, id: "a1", props });

interface FakeKey {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

/**
 * A keyboard event with only the fields `connect` reads. There is no
 * `KeyboardEvent` constructor in node, and building one would prove nothing
 * extra: what is under test is which keys are claimed.
 */
function press(props: Record<string, unknown>, init: FakeKey): boolean {
  let prevented = false;
  const event = {
    key: init.key,
    shiftKey: init.shiftKey === true,
    altKey: init.altKey === true,
    ctrlKey: init.ctrlKey === true,
    metaKey: init.metaKey === true,
    defaultPrevented: false,
    preventDefault(): void {
      prevented = true;
    },
  };
  (props.onKeyDown as EventHandler<KeyboardEvent>)(event as unknown as KeyboardEvent);
  return prevented;
}

describe("accordion without a DOM", () => {
  it("connects on a server, where it can find none of its own headers", () => {
    const harness = build({ defaultValue: ["billing"] });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.service.state.get()).toBe("idle");
    expect(api.value).toEqual(["billing"]);
    expect(api.isOpen("billing")).toBe(true);
    expect(api.isOpen("general")).toBe(false);
    expect(api.focusedValue).toBeNull();
    expect(api.disabled).toBe(false);
  });

  it("names the header, the panel and the pair between them", () => {
    const api = build({ defaultValue: ["general"] }).api();
    const item = api.getItemProps({ value: "general" });
    const trigger = api.getTriggerProps({ value: "general" });
    const content = api.getContentProps({ value: "general" });

    expect(api.getRootProps().id).toBe("accordion:a1:root");
    expect(item.id).toBe("accordion:a1:item:general");
    expect(trigger.id).toBe("accordion:a1:trigger:general");
    expect(content.id).toBe("accordion:a1:content:general");

    expect(trigger.type).toBe("button");
    expect(trigger["aria-expanded"]).toBe("true");
    // Never dangling: the panel is never unmounted and never lazily built, so the
    // IDREF is always resolvable — the one accessibility failure a headless
    // component can ship in silence.
    expect(trigger["aria-controls"]).toBe("accordion:a1:content:general");
    expect(content.role).toBe("region");
    expect(content["aria-labelledby"]).toBe("accordion:a1:trigger:general");
  });

  it("hides a closed panel on the server, and only a closed one", () => {
    const api = build({ defaultValue: ["general"] }).api();

    expect(api.getContentProps({ value: "general" }).hidden).toBeUndefined();
    expect(api.getContentProps({ value: "billing" }).hidden).toBe(true);
  });

  it("asks for find-in-page only when the consumer opted in", () => {
    const plain = build().api().getContentProps({ value: "general" });
    const findable = build({ hiddenUntilFound: true }).api().getContentProps({ value: "general" });

    expect(plain.hidden).toBe(true);
    // The third value of the attribute, which the writers serialise verbatim. An
    // engine that does not know the keyword reads the attribute as the plain
    // boolean it looks like, which is the correct degradation.
    expect(findable.hidden).toBe("until-found");
  });

  it("paints the first frame without an arrival", () => {
    // `data-immediate` is the sheet's "do not play this". A panel opened by a
    // `defaultValue` would otherwise expand from zero on every page load. A closed
    // one needs no gate: it carries `hidden`, and the sheet keys its exit
    // animation on the absence of that attribute.
    const api = build({ defaultValue: ["general"] }).api();

    expect(api.getContentProps({ value: "general" })["data-immediate"]).toBe("");
    expect(api.getContentProps({ value: "billing" })["data-immediate"]).toBeUndefined();
  });

  it("states every part's state, so the sheet needs no ancestor to read it", () => {
    const api = build({ defaultValue: ["general"] }).api();

    for (const props of [
      api.getItemProps({ value: "general" }),
      api.getHeaderProps({ value: "general" }),
      api.getTriggerProps({ value: "general" }),
      api.getIndicatorProps({ value: "general" }),
      api.getContentProps({ value: "general" }),
      api.getBodyProps({ value: "general" }),
    ]) {
      expect(props["data-state"]).toBe("open");
    }

    expect(api.getItemProps({ value: "billing" })["data-state"]).toBe("closed");
    expect(api.getIndicatorProps({ value: "general" })["aria-hidden"]).toBe("true");
  });

  it("disables every part of an item, and every item of a disabled group", () => {
    const item = build().api();
    expect(item.getTriggerProps({ value: "general", disabled: true }).disabled).toBe(true);
    expect(item.getItemProps({ value: "general", disabled: true })["data-disabled"]).toBe("");
    expect(item.getTriggerProps({ value: "billing" }).disabled).toBe(false);

    const group = build({ disabled: true }).api();
    expect(group.disabled).toBe(true);
    expect(group.getRootProps()["data-disabled"]).toBe("");
    expect(group.getTriggerProps({ value: "general" }).disabled).toBe(true);
    expect(group.getIndicatorProps({ value: "general" })["data-disabled"]).toBe("");
  });

  it("carries the description a field handed down, and nothing when there is none", () => {
    expect(build({ describedBy: "hint" }).api().getRootProps()["aria-describedby"]).toBe("hint");
    expect(build().api().getRootProps()["aria-describedby"]).toBeUndefined();
  });

  it("shows no focus ring for a focus that has not happened", () => {
    const trigger = build().api().getTriggerProps({ value: "general" });

    expect(trigger["data-focus-visible"]).toBeUndefined();
    expect(trigger["data-focus-source"]).toBeUndefined();
  });
});

describe("accordion — which keys it claims", () => {
  const trigger = () => build().api().getTriggerProps({ value: "general" });

  it("claims the vertical arrows and the two ends", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(press(trigger(), { key })).toBe(true);
    }
  });

  it("leaves the horizontal arrows to the browser", () => {
    // There is no horizontal axis here, so ←/→ are never claimed and the page
    // still scrolls under a header that has the focus. `bothAxes: false` is what
    // keeps `preventDefault` from being spent on a key nothing answered.
    expect(press(trigger(), { key: "ArrowLeft" })).toBe(false);
    expect(press(trigger(), { key: "ArrowRight" })).toBe(false);
  });

  it("claims neither Enter nor Space", () => {
    // The browser turns both into a click on a real `<button>` — Enter as the key
    // goes down, Space as it comes back up. `TRIGGER.TOGGLE` is not idempotent, so
    // a handler here would toggle the panel twice per press.
    expect(press(trigger(), { key: "Enter" })).toBe(false);
    expect(press(trigger(), { key: " " })).toBe(false);
  });

  it("stands aside for every modifier, Shift included", () => {
    expect(press(trigger(), { key: "ArrowDown", altKey: true })).toBe(false);
    expect(press(trigger(), { key: "ArrowDown", ctrlKey: true })).toBe(false);
    expect(press(trigger(), { key: "ArrowDown", metaKey: true })).toBe(false);
    // Shift+arrow is the range-selection gesture, and it belongs to the components
    // that have ranges.
    expect(press(trigger(), { key: "ArrowDown", shiftKey: true })).toBe(false);
  });
});
