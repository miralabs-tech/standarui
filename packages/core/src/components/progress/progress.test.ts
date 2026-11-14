/**
 * The node half of `progress`: no document, no framework, no page — the shape a
 * server render has. `progress.browser.test.ts` covers what needs a real engine.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./progress.connect";
import { machine } from "./progress.machine";
import type { ProgressApi, ProgressMachineProps, ProgressSchema } from "./progress.types";

type Api = ProgressApi<PlainPropTypes>;

const build = (props: ProgressMachineProps = {}) =>
  connectWithoutDom<ProgressSchema, Api>({ machine, connect, id: "p1", props });

describe("progress without a DOM", () => {
  it("connects on a server, where its label lookup has nothing to look in", () => {
    const harness = build({ defaultValue: 40 });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.role).toBe("progressbar");
    expect(root["aria-valuenow"]).toBe(40);
    expect(root["aria-valuetext"]).toBe("40%");
    // The label part cannot be seen from here, so the IDREF is withheld — the
    // same answer as the first client render, before the mount effect. Naming
    // the bar after an id that the server never emitted is the hydration
    // mismatch this has to avoid.
    expect(root["aria-labelledby"]).toBeUndefined();
    expect(root.style).toEqual({ "--sui-progress-percent": "40%" });
  });

  it("keeps `null` a value rather than an absence, with no DOM to ask", () => {
    const root = build({ defaultValue: null }).api().getRootProps();

    expect(root["data-state"]).toBe("indeterminate");
    // Dropped, never zeroed: a bar reporting 0 says the work has not started.
    expect(root["aria-valuenow"]).toBeUndefined();
    expect(root["aria-valuemin"]).toBeUndefined();
    expect(root["aria-valuemax"]).toBeUndefined();
    expect(root["aria-valuetext"]).toBeUndefined();
  });

  it("maps the percentage against a non-default range", () => {
    const api = build({ defaultValue: 5, min: 0, max: 20 }).api();

    expect(api.percent).toBe(25);
    expect(api.valueAsText).toBe("25%");
  });
});
