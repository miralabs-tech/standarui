/**
 * The node half of `checkbox`: no document, no framework, the shape a server
 * render has. `checkbox.browser.test.ts` covers the real input and the label
 * relay, which need a page.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./checkbox.connect";
import { machine } from "./checkbox.machine";
import type { CheckboxApi, CheckboxMachineProps, CheckboxSchema } from "./checkbox.types";

type Api = CheckboxApi<PlainPropTypes>;

const build = (props: CheckboxMachineProps = {}) =>
  connectWithoutDom<CheckboxSchema, Api>({ machine, connect, id: "c1", props });

describe("checkbox without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultChecked: true });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps()["data-state"]).toBe("checked");
    expect(api.getHiddenInputProps().type).toBe("checkbox");
    expect(api.getHiddenInputProps().checked).toBe(true);
    expect(api.getHiddenInputProps().value).toBe("on");
  });

  it("carries the third state, which no attribute can express", () => {
    const api = build({ defaultChecked: "indeterminate" }).api();

    expect(api.indeterminate).toBe(true);
    expect(api.getRootProps()["data-state"]).toBe("indeterminate");
    // `indeterminate` is a DOM property written by an action, so the input is
    // unchecked here and nothing pretends otherwise.
    expect(api.getHiddenInputProps().checked).toBe(false);
  });

  it("promises read-only to assistive technology, which HTML ignores on a box", () => {
    const input = build({ readOnly: true, invalid: true }).api().getHiddenInputProps();

    expect(input["aria-readonly"]).toBe("true");
    expect(input["aria-invalid"]).toBe("true");
  });

  it("puts no click handler on the root, because the browser already relays it", () => {
    // The root is the `<label>` and the input is inside it. A second handler
    // would toggle the box back.
    expect(build().api().getRootProps().onClick).toBeUndefined();
  });
});
