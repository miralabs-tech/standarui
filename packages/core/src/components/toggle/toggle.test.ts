/**
 * The node half of `toggle`: no document, no framework, the shape a server render
 * has. `toggle.browser.test.ts` is the Phase 2 exit criterion and covers the rest.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./toggle.connect";
import { machine } from "./toggle.machine";
import type { ToggleApi, ToggleMachineProps, ToggleSchema } from "./toggle.types";

type Api = ToggleApi<PlainPropTypes>;

const build = (props: ToggleMachineProps = {}) =>
  connectWithoutDom<ToggleSchema, Api>({ machine, connect, id: "t1", props });

describe("toggle without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultPressed: true });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.type).toBe("button");
    expect(root["aria-pressed"]).toBe("true");
    expect(root["data-state"]).toBe("on");
    expect(root["data-focus-source"]).toBeUndefined();
  });

  it("renders a controlled value from the prop, and re-renders when a new one arrives", () => {
    const harness = build({ pressed: false });

    expect(harness.api().pressed).toBe(false);
    expect(harness.api().getRootProps()["aria-pressed"]).toBe("false");

    harness.setProps({ pressed: true });

    expect(harness.api().pressed).toBe(true);
    expect(harness.api().getRootProps()["data-state"]).toBe("on");
  });

  it("queues an activation that lands before it starts, rather than losing it", () => {
    // A click can land in the same tick as hydration, before the mount effect
    // has run. The service holds it instead of dropping it — and, just as
    // importantly, without warning: the "sent after the service stopped" warning
    // is the library's only leak detector and must stay meaningful.
    const harness = build();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    harness.api().toggle();

    expect(harness.service.status()).toBe("not-started");
    expect(harness.api().pressed).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses the native disabled attribute — a toggle is not a menu item", () => {
    const root = build({ disabled: true }).api().getRootProps();

    expect(root.disabled).toBe(true);
    expect(root["aria-disabled"]).toBeUndefined();
    expect(root["data-disabled"]).toBe("");
  });
});
