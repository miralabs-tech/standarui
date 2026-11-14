/**
 * The browser half of `field`, and its vanilla-shaped proof. Everything the
 * node file cannot see lives here: whether the helper and error texts are in
 * the DOM is a fact the machine *reads* — a dependency plus a MutationObserver
 * — and `aria-describedby` may only ever point at ids that exist.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./field.connect";
import { machine } from "./field.machine";
import type { FieldApi, FieldMachineProps, FieldSchema } from "./field.types";

type Api = FieldApi<DomPropTypes>;

const FULL = `<div><label></label><input /><span class="helper">Shown on your profile.</span><span class="error">This name is taken.</span></div>`;

function render(props: FieldMachineProps = {}, html: string = FULL) {
  return mountMachine<FieldSchema, Api>({
    machine,
    connect,
    html,
    id: "f1",
    props,
    // Queried by marker class rather than by position: the whole point of this
    // suite is that texts come and go, and a paint that assumes four children
    // would crash on the very mutation under test.
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const root = host.firstElementChild as HTMLElement;
      apply(root, api.getRootProps());
      const label = root.querySelector("label");
      if (label !== null) apply(label, api.getLabelProps());
      // `input` or a bare div, because whether the control is labelable is the
      // thing under test in two of the cases below.
      const control = root.querySelector<HTMLElement>("input, .control");
      if (control !== null) apply(control, { ...api.controlProps });
      const helper = root.querySelector(".helper");
      if (helper !== null) apply(helper, api.getHelperTextProps());
      const error = root.querySelector(".error");
      if (error !== null) apply(error, api.getErrorTextProps());
    },
  });
}

function input(harness: ReturnType<typeof render>): HTMLInputElement {
  const node = harness.host.querySelector("input");
  if (node === null) throw new Error("no input in the fixture");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("field", () => {
  it("describes the control only by texts that are in the DOM, the error first", () => {
    const harness = render({ invalid: true });
    const helper = harness.part("helper-text");
    const error = harness.part("error-text");

    // What is wrong matters more than what was advised — a screen reader reads
    // the list in order.
    expect(input(harness).getAttribute("aria-describedby")).toBe(`${error.id} ${helper.id}`);
    expect(input(harness).getAttribute("aria-invalid")).toBe("true");
    expect(error.hidden).toBe(false);
  });

  it("withholds the error id while the field is valid, even with the element rendered", () => {
    const harness = render();
    const helper = harness.part("helper-text");

    expect(input(harness).getAttribute("aria-describedby")).toBe(helper.id);
    expect(harness.part("error-text").hidden).toBe(true);
  });

  it("drops an id the moment its element leaves the DOM", async () => {
    const harness = render({ invalid: true });
    const helper = harness.part("helper-text");

    harness.part("error-text").remove();

    // The MutationObserver's turn, not the reactivity graph's: nothing sent an
    // event, the DOM simply changed under the machine.
    await vi.waitFor(() => {
      expect(input(harness).getAttribute("aria-describedby")).toBe(helper.id);
    });
  });

  it("picks up a text added after mount, the way a vanilla consumer adds one", async () => {
    const harness = render({}, `<div><label></label><input /></div>`);

    expect(input(harness).hasAttribute("aria-describedby")).toBe(false);

    // The consumer's move: take the prop getter's output, put it on a node,
    // append the node. The observer does the rest.
    const helper = document.createElement("span");
    helper.textContent = "Added later.";
    for (const [key, value] of Object.entries(harness.api().getHelperTextProps())) {
      if (typeof value === "string") helper.setAttribute(key, value);
    }
    (harness.host.firstElementChild as HTMLElement).append(helper);

    await vi.waitFor(() => {
      expect(input(harness).getAttribute("aria-describedby")).toBe(helper.id);
    });
  });

  it("points `for` at a labelable control, and names it through the label's id", async () => {
    const harness = render();

    await vi.waitFor(() => {
      expect(harness.part("label").getAttribute("for")).toBe(input(harness).id);
    });
    expect(harness.api().labelId).toBe(harness.part("label").id);
  });

  it("drops `for` when the control is something a label may not name", async () => {
    const harness = render({}, `<div><label></label><div class="control"></div></div>`);

    // A `div[role="slider"]` is the real case: it never takes the control id at
    // all, so `for` was left pointing into an empty document and the label was
    // dead to the pointer. The control reads `labelId` back instead.
    await vi.waitFor(() => {
      expect(harness.part("label").hasAttribute("for")).toBe(false);
    });
    expect(harness.api().labelId).toBe(harness.part("label").id);
  });

  it("withholds `labelId` while no label part is rendered", async () => {
    const harness = render({ group: true }, `<div><input /></div>`);

    // Same rule as `aria-describedby`: a group that named itself after an absent
    // legend would point `aria-labelledby` at nothing.
    await vi.waitFor(() => {
      expect(harness.api().labelId).toBeUndefined();
    });
    expect((harness.host.firstElementChild as HTMLElement).hasAttribute("aria-labelledby")).toBe(
      false,
    );
  });

  it("announces the error through the shared announcer when the field turns invalid", async () => {
    const harness = render();

    harness.setProps({ invalid: true });

    // Politely, through the pre-created region — the error element itself is
    // not a live region, and its text lands on a later task on purpose: a
    // region that appears already populated is announced by nobody.
    await vi.waitFor(() => {
      const region = document.querySelector('[data-sui-live-region="polite"]');
      expect(region?.textContent).toBe("This name is taken.");
    });
  });
});
