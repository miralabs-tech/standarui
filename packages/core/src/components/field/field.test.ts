/**
 * `field` had no test file of its own at all — neither here nor in the adapter —
 * while being the accessibility hub every form control hangs off. This is the
 * node half: no document, no framework, the shape a server render has.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./field.connect";
import { machine } from "./field.machine";
import type { FieldApi, FieldMachineProps, FieldSchema } from "./field.types";

type Api = FieldApi<PlainPropTypes>;

const build = (props: FieldMachineProps = {}) =>
  connectWithoutDom<FieldSchema, Api>({ machine, connect, id: "f1", props });

describe("field without a DOM", () => {
  it("connects on a server, where the presence of its texts is unknowable", () => {
    const harness = build();
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps().id).toBe("field:f1:root");
    expect(api.getLabelProps().for).toBe("field:f1:control");
    // `aria-describedby` may only point at ids that exist, and from here none
    // provably do. Withholding it is the same answer as the first client render;
    // the observer fills it in on mount.
    expect(api.controlProps["aria-describedby"]).toBeUndefined();
  });

  it("describes nothing on the server even when it is invalid", () => {
    // The tempting bug: assume the error text is rendered because `invalid` is
    // set. It points at an id that may never exist.
    const api = build({ invalid: true, required: true }).api();

    expect(api.controlProps["aria-describedby"]).toBeUndefined();
    expect(api.controlProps["aria-invalid"]).toBe("true");
    expect(api.controlProps.required).toBe(true);
    expect(api.getErrorTextProps().hidden).toBe(false);
  });

  it("names a group through its own label, and a single field through its control", () => {
    const single = build().api();
    const group = build({ group: true }).api();

    expect(single.getRootProps().role).toBeUndefined();
    expect(single.getRootProps()["aria-labelledby"]).toBeUndefined();
    expect(single.getLabelProps().for).toBe("field:f1:control");

    expect(group.getRootProps().role).toBe("group");
    // Same rule as `aria-describedby` above, and it costs a group its name on the
    // server: a legend is optional, so from here its id is not provably in the
    // document. The observer names the group on mount.
    expect(group.getRootProps()["aria-labelledby"]).toBeUndefined();
    expect(group.labelId).toBeUndefined();
    // `for` on a group would name one member and hide the rest.
    expect(group.getLabelProps().for).toBeUndefined();
  });

  it("still points `for` at its control on the server, where no control has mounted", () => {
    // The inverse default of `hasLabel`, and deliberately so: `for` is not an ARIA
    // reference, withholding it breaks click-to-focus on every labelable control,
    // and the only correction the observer ever makes is to *remove* it — which it
    // does for a control a label may not name, such as a `div[role="slider"]`.
    expect(build().api().getLabelProps().for).toBe("field:f1:control");
  });

  it("hides the required asterisk from the accessibility tree", () => {
    const indicator = build({ required: true }).api().getRequiredIndicatorProps();

    expect(indicator["aria-hidden"]).toBe("true");
    expect(indicator.hidden).toBe(false);
  });
});
