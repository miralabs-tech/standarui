/**
 * The node half of `switch`: no document, no framework, the shape a server render
 * has. The drag lives in `switch.browser.test.ts` — it is made of real pointer
 * positions and has no meaning here.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./switch.connect";
import { machine } from "./switch.machine";
import type { SwitchApi, SwitchMachineProps, SwitchSchema } from "./switch.types";

type Api = SwitchApi<PlainPropTypes>;

const build = (props: SwitchMachineProps = {}) =>
  connectWithoutDom<SwitchSchema, Api>({ machine, connect, id: "s1", props });

describe("switch without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultChecked: true });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps()["data-state"]).toBe("checked");
    expect(api.getHiddenInputProps().checked).toBe(true);
  });

  it("is a switch to a screen reader, not a checkbox", () => {
    const input = build().api().getHiddenInputProps();

    // APG: "on/off", not "checked/unchecked".
    expect(input.role).toBe("switch");
    expect(input.type).toBe("checkbox");
  });

  it("publishes no drag progress until a finger has actually moved", () => {
    const api = build().api();

    expect(api.dragging).toBe(false);
    expect(api.getRootProps()["data-dragging"]).toBeUndefined();
    // The thumb sits where the state says and the CSS transition carries it
    // there; a `--sui-switch-progress` on the server would freeze it mid-travel.
    expect(api.getThumbProps().style).toBeUndefined();
  });

  it("is md unless asked, and says so on the root only", () => {
    const api = build().api();

    expect(api.getRootProps()["data-size"]).toBe("md");
    expect(api.getControlProps()["data-size"]).toBeUndefined();
    expect(api.getThumbProps()["data-size"]).toBeUndefined();
  });

  it("emits the size it was given", () => {
    expect(build({ size: "sm" }).api().getRootProps()["data-size"]).toBe("sm");
  });

  it("promises read-only to assistive technology, which HTML ignores on a box", () => {
    const input = build({ readOnly: true }).api().getHiddenInputProps();

    expect(input["aria-readonly"]).toBe("true");
  });
});
