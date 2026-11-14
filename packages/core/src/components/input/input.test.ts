/**
 * The node half of `input`: no document, no framework, the shape a server render
 * has. One machine, three presentations (CDC D10), so the three are pinned here
 * as one.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes, plainNormalizer } from "../node-harness";
import { connect } from "./input.connect";
import { machine } from "./input.machine";
import type { InputApi, InputMachineProps, InputSchema } from "./input.types";

type Api = InputApi<PlainPropTypes>;

const build = (props: InputMachineProps = {}) =>
  connectWithoutDom<InputSchema, Api>({ machine, connect, id: "i1", props });

describe("input without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultValue: "hello" });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps().id).toBe("input:i1:root");
    expect(api.getControlProps().type).toBe("text");
    expect(api.getControlProps().value).toBe("hello");
    expect(api.getControlProps().id).toBe("input:i1:control");
  });

  it("marks the search field, and nothing else, as one", () => {
    // What the field *is*, read off `type` and nothing else. Since the 2026-08-31
    // amendment this buys the search inset alone, not the shape.
    expect(build({ type: "search" }).api().getRootProps()["data-variant"]).toBe("search");
    expect(build({ type: "text" }).api().getRootProps()["data-variant"]).toBeUndefined();
    expect(build({ type: "password" }).api().getRootProps()["data-variant"]).toBeUndefined();
  });

  it("draws a capsule until asked for another shape", () => {
    expect(build().api().getRootProps()["data-shape"]).toBe("capsule");
    expect(build({ shape: "soft" }).api().getRootProps()["data-shape"]).toBe("soft");
    expect(build({ shape: "rect" }).api().getRootProps()["data-shape"]).toBe("rect");
    // The two axes are independent, which is the whole point of splitting them:
    // a search field can be a rect, and a password can be a capsule.
    expect(build({ type: "search", shape: "rect" }).api().getRootProps()["data-shape"]).toBe(
      "rect",
    );
    expect(build({ type: "search", shape: "rect" }).api().getRootProps()["data-variant"]).toBe(
      "search",
    );
  });

  it("masks a password by default and offers a reveal", () => {
    const api = build({ type: "password" }).api();

    expect(api.masked).toBe(true);
    expect(api.getControlProps().type).toBe("password");
    expect(api.getVisibilityTriggerProps().hidden).toBe(false);
    expect(api.getVisibilityTriggerProps()["aria-pressed"]).toBe("false");
    expect(api.getVisibilityTriggerProps()["data-state"]).toBe("masked");
    // The eye stays focusable: "does not move the focus" is about the pointer,
    // and a reveal a keyboard user cannot operate is not a reveal.
    expect(api.getVisibilityTriggerProps().disabled).toBe(false);
  });

  it("renders a revealed password as a text field, without redeclaring its type", () => {
    // Driven by the prop rather than by `toggleVisibility()`: an event sent to a
    // service that has not started is queued, which is exactly what a server
    // does with it. The transition itself belongs to the browser suite.
    const api = build({ type: "password", defaultMasked: false }).api();

    expect(api.masked).toBe(false);
    // `type=text`, which also stops a password manager from re-masking it.
    expect(api.getControlProps().type).toBe("text");
    expect(api.getVisibilityTriggerProps()["aria-pressed"]).toBe("true");
    expect(api.getVisibilityTriggerProps()["data-state"]).toBe("visible");
    // The *declared* type is what marks a search field, and it has not changed:
    // revealing a password must not hand it the search inset.
    expect(api.getRootProps()["data-variant"]).toBeUndefined();
  });

  it("hides the reveal button on a field that has nothing to reveal", () => {
    expect(build().api().getVisibilityTriggerProps().hidden).toBe(true);
  });

  it("passes through the two attributes an audit once found it swallowing", () => {
    const control = build({ autoComplete: "email", inputMode: "email" }).api().getControlProps();

    // WCAG 2.2 SC 1.3.5 lives on the first, and a mobile keyboard on the second.
    expect(control.autoComplete).toBe("email");
    expect(control.inputMode).toBe("email");
  });

  it("keeps off the attribute the spatial engine owns, while focused", () => {
    // `data-snav-focused` belongs to `@standarx/nav`'s spatial engine; emitting it
    // here would lift the root and the control at once, compounding the scale.
    // Only a focused render could emit it, and a server never renders one, so the
    // state is answered for the machine.
    const { service } = build();
    const api = connect(
      {
        ...service,
        state: {
          ...service.state,
          get: () => "focused",
          matches: (...values) => values.includes("focused"),
        },
      },
      plainNormalizer,
    );

    expect(api.getRootProps()["data-focus"]).toBe("");
    expect(api.getControlProps()["data-focus"]).toBe("");
    expect(api.getRootProps()["data-snav-focused"]).toBeUndefined();
    expect(api.getControlProps()["data-snav-focused"]).toBeUndefined();
    expect(api.getTextareaProps()["data-snav-focused"]).toBeUndefined();
  });

  it("gives the textarea the same behaviour and no type", () => {
    const textarea = build({ defaultValue: "hello" }).api().getTextareaProps();

    expect(textarea.value).toBe("hello");
    expect(textarea.type).toBeUndefined();
  });
});
