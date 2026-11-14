/**
 * The node half of `button`: no document, no framework, the shape a server render
 * has. `button.browser.test.ts` covers the press primitive and real events.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./button.connect";
import { machine } from "./button.machine";
import type { ButtonApi, ButtonMachineProps, ButtonSchema } from "./button.types";

type Api = ButtonApi<PlainPropTypes>;

const build = (props: ButtonMachineProps = {}) =>
  connectWithoutDom<ButtonSchema, Api>({ machine, connect, id: "b1", props });

describe("button without a DOM", () => {
  it("connects on a server", () => {
    const harness = build();
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.id).toBe("button:b1:root");
    expect(root.type).toBe("button");
    expect(root.role).toBeUndefined();
    expect(root["data-variant"]).toBe("filled");
    // Never focused yet, so there is no source to report — the attribute is
    // absent rather than guessed from an ambient modality the server has no
    // access to anyway.
    expect(root["data-focus-source"]).toBeUndefined();
    expect(root["data-focus-visible"]).toBeUndefined();
  });

  it("has two spellings of disabled, and picks by whether the element is native", () => {
    const native = build({ disabled: true }).api().getRootProps();
    const focusable = build({ disabled: true, focusableWhenDisabled: true }).api().getRootProps();
    const substituted = build({ disabled: true, nativeButton: false }).api().getRootProps();

    // A lone button leaves the tab order; a toolbar item stays reachable to
    // explain why it cannot be used.
    expect(native.disabled).toBe(true);
    expect(native["aria-disabled"]).toBeUndefined();
    expect(focusable.disabled).toBe(false);
    expect(focusable["aria-disabled"]).toBe("true");

    // A substituted element has no native tab order to lose.
    expect(substituted.role).toBe("button");
    expect(substituted.tabIndex).toBe(-1);
    expect(substituted.type).toBeUndefined();
  });

  it("treats loading as a refusal, not only as a decoration", () => {
    const api = build({ loading: true }).api();

    expect(api.getRootProps()["aria-busy"]).toBe("true");
    expect(api.getRootProps()["aria-disabled"]).toBe("true");
    expect(api.getLoadingIndicatorProps()["aria-hidden"]).toBe("true");
    expect(api.getLoadingIndicatorProps().hidden).toBe(false);
  });
});
