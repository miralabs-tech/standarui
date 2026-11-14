/**
 * The node half of `checkbox-group`: no document, no framework, the shape a
 * server render has. It reads its items out of the DOM, so this is where the
 * "no items to be found" answer has to stay honest.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./checkbox-group.connect";
import { machine } from "./checkbox-group.machine";
import type {
  CheckboxGroupApi,
  CheckboxGroupMachineProps,
  CheckboxGroupSchema,
} from "./checkbox-group.types";

type Api = CheckboxGroupApi<PlainPropTypes>;

const build = (props: CheckboxGroupMachineProps = {}) =>
  connectWithoutDom<CheckboxGroupSchema, Api>({ machine, connect, id: "g1", props });

describe("checkbox-group without a DOM", () => {
  it("connects on a server, where it can find none of its own items", () => {
    const harness = build({ defaultValue: ["a"] });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.role).toBe("group");
    expect(root["aria-labelledby"]).toBeUndefined();
    // Floored at 1 rather than 0: the styles divide by it.
    expect(root.style).toEqual({ "--sui-item-count": "1" });
  });

  it("still carries the value it was given, which is not read from the DOM", () => {
    const api = build({ defaultValue: ["a", "c"] }).api();

    expect(api.value).toEqual(["a", "c"]);
    expect(api.isChecked("a")).toBe(true);
    expect(api.isChecked("b")).toBe(false);
  });

  it("summarises nothing when nothing reachable is known, and says so", () => {
    const api = build({ defaultValue: ["a"] }).api();

    // Not "indeterminate": a summary over an empty set of reachable items is not
    // a partial selection, and a box that does nothing when pressed is worse
    // than one that says it cannot be.
    expect(api.parentChecked).toBe(false);
    expect(api.parentDisabled).toBe(true);
  });

  it("derives a submit name unique to the group when none is given", () => {
    expect(build().api().name).toBe("checkbox-group:g1:root");
    expect(build({ name: "toppings" }).api().name).toBe("toppings");
  });

  it("never spells `aria-required` on a role that does not allow it", () => {
    const root = build({ required: true }).api().getRootProps();

    expect(root["aria-required"]).toBeUndefined();
    expect(root["data-required"]).toBe("");
  });
});
