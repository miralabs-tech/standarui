/**
 * The node half of `radio-group`: no document, no framework, the shape a server
 * render has. The indicator is measured off layout, so where it goes is the fact
 * that has to degrade honestly here.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./radio-group.connect";
import { machine } from "./radio-group.machine";
import type { RadioGroupApi, RadioGroupMachineProps, RadioGroupSchema } from "./radio-group.types";

type Api = RadioGroupApi<PlainPropTypes>;

const build = (props: RadioGroupMachineProps = {}) =>
  connectWithoutDom<RadioGroupSchema, Api>({ machine, connect, id: "r1", props });

describe("radio-group without a DOM", () => {
  it("connects on a server, where it can find none of its own items", () => {
    const harness = build({ defaultValue: "b" });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.role).toBe("radiogroup");
    expect(root["aria-labelledby"]).toBeUndefined();
    // Nothing has been measured, so the highlight has no place. Emitting an
    // offset of 0 would park it on the first item and then jump it on hydration.
    expect(root.style).toEqual({});
    expect(harness.api().getIndicatorProps()["data-empty"]).toBe("");
  });

  it("paints the first frame without a spring", () => {
    // `data-immediate` is the styles' "do not travel". A highlight that animated
    // into place on the first paint would slide in from wherever
    // `inset-block-start: 0` put it, on every page load.
    expect(build({ defaultValue: "b" }).api().getIndicatorProps()["data-immediate"]).toBe("");
  });

  it("still carries the value it was given, which is not read from the DOM", () => {
    const api = build({ defaultValue: "b" }).api();

    expect(api.value).toBe("b");
    expect(api.isSelected("b")).toBe(true);
    expect(api.isSelected("a")).toBe(false);
  });

  it("renders real radios sharing a name derived from the scope", () => {
    const input = build({ defaultValue: "b" }).api().getItemHiddenInputProps({ value: "b" });

    expect(input.type).toBe("radio");
    // Unique by construction: two groups sharing a name are one group to the
    // browser, and the arrows would walk from one into the other.
    expect(input.name).toBe("radio-group:r1:root");
    expect(input.checked).toBe(true);
  });

  it("promises read-only on the group, the only role ARIA allows it on", () => {
    const api = build({ readOnly: true, invalid: true }).api();
    const input = api.getItemHiddenInputProps({ value: "a" });

    // ARIA 1.2 lists `aria-readonly` among the supported properties of
    // `radiogroup` and not of `radio`: on the inputs it is an attribute no role
    // accepts, and assistive technology is told nothing by it.
    expect(api.getRootProps()["aria-readonly"]).toBe("true");
    expect(input["aria-readonly"]).toBeUndefined();
    expect(input["aria-invalid"]).toBe("true");
  });

  it("marks the group read-only for the sheet, as it already marks it disabled", () => {
    // The items carry `data-readonly` already; the container did not, so no rule
    // could reach a read-only group at the one level that owns the whole set.
    expect(build({ readOnly: true }).api().getRootProps()["data-readonly"]).toBe("");
    expect(build().api().getRootProps()["data-readonly"]).toBeUndefined();
  });
});
