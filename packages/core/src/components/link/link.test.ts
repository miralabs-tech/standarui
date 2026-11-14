/**
 * The node half of `link`: no document, no framework, the shape a server render
 * has. Everything that needs a started service — transitions, the press
 * primitive, real focus — lives in `link.browser.test.ts`, because starting this
 * machine installs the modality tracker and that effect reaches for a document
 * by design (`scope.getDoc()` throws here, which is the point of this project).
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./link.connect";
import { machine } from "./link.machine";
import type { LinkApi, LinkMachineProps, LinkSchema } from "./link.types";

type Api = LinkApi<PlainPropTypes>;

const build = (props: LinkMachineProps = {}) =>
  connectWithoutDom<LinkSchema, Api>({ machine, connect, id: "l1", props });

describe("link without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ href: "/docs" });
    const root = harness.api().getRootProps();

    expect(harness.service.status()).toBe("not-started");
    expect(root.id).toBe("link:l1:root");
    expect(root.href).toBe("/docs");
    // A real, enabled <a> already is a link: no role, no tab index to add.
    expect(root.role).toBeUndefined();
    expect(root.tabIndex).toBeUndefined();
    expect(root["data-variant"]).toBe("tint");
    // Never focused yet, so there is no source to report — the attribute is
    // absent rather than guessed from an ambient modality the server has no
    // access to anyway.
    expect(root["data-focus-source"]).toBeUndefined();
    expect(root["data-focus-visible"]).toBeUndefined();
    expect(root["data-pressed"]).toBeUndefined();
  });

  it("resolves the underline from the variant, unless told otherwise", () => {
    // A tint link is identifiable by its colour; a plain link is the colour of
    // its surrounding text, so without an underline it is not identifiable at
    // all (WCAG 1.4.1).
    expect(build().api().getRootProps()["data-underline"]).toBe("hover");
    expect(build({ variant: "plain" }).api().getRootProps()["data-underline"]).toBe("always");
    expect(
      build({ variant: "plain", underline: "hover" }).api().getRootProps()["data-underline"],
    ).toBe("hover");
    expect(build({ underline: "none" }).api().getRootProps()["data-underline"]).toBe("none");
  });

  it("strips the href while disabled, instead of merely preventing", () => {
    const root = build({ href: "/docs", disabled: true }).api().getRootProps();

    // An absent href cannot be reached around with a middle click or the
    // context menu, which is what a prevented one still allows.
    expect(root.href).toBeUndefined();
    // An <a> without an href has no link role left, so it is restated.
    expect(root.role).toBe("link");
    expect(root["aria-disabled"]).toBe("true");
    expect(root["data-disabled"]).toBe("");
    // The strip already took it out of the tab order.
    expect(root.tabIndex).toBeUndefined();
  });

  it("stays reachable while disabled when asked", () => {
    const root = build({ href: "/docs", disabled: true, focusableWhenDisabled: true })
      .api()
      .getRootProps();

    expect(root.href).toBeUndefined();
    expect(root.tabIndex).toBe(0);
    expect(root["aria-disabled"]).toBe("true");
  });

  it("borrows the link role and the tab order on a substituted root", () => {
    const root = build({ nativeLink: false }).api().getRootProps();
    const disabled = build({ nativeLink: false, disabled: true }).api().getRootProps();
    const reachable = build({ nativeLink: false, disabled: true, focusableWhenDisabled: true })
      .api()
      .getRootProps();

    expect(root.role).toBe("link");
    expect(root.tabIndex).toBe(0);
    expect(disabled.tabIndex).toBe(-1);
    expect(reachable.tabIndex).toBe(0);
  });

  it("hardens an external link and wakes its two companion parts", () => {
    const api = build({ href: "https://example.com", external: true }).api();
    const root = api.getRootProps();

    expect(root.target).toBe("_blank");
    expect(root.rel).toBe("noopener noreferrer");
    expect(root["data-external"]).toBe("");
    expect(api.getExternalIconProps()["aria-hidden"]).toBe("true");
    expect(api.getExternalIconProps().hidden).toBe(false);
    expect(api.getExternalLabelProps().hidden).toBe(false);
  });

  it("lets an explicit target and rel outrank the external defaults", () => {
    const root = build({ external: true, target: "companion", rel: "noopener" })
      .api()
      .getRootProps();

    expect(root.target).toBe("companion");
    expect(root.rel).toBe("noopener");
  });

  it("keeps the companion parts hidden while the link is not external", () => {
    const api = build().api();

    expect(api.getRootProps()["data-external"]).toBeUndefined();
    expect(api.getRootProps().target).toBeUndefined();
    expect(api.getRootProps().rel).toBeUndefined();
    expect(api.getExternalIconProps().hidden).toBe(true);
    expect(api.getExternalLabelProps().hidden).toBe(true);
  });

  it("speaks aria-current in both spellings", () => {
    const page = build({ current: "page" }).api().getRootProps();
    const bare = build({ current: true }).api().getRootProps();
    const none = build().api().getRootProps();

    expect(page["aria-current"]).toBe("page");
    expect(page["data-current"]).toBe("page");
    expect(bare["aria-current"]).toBe("true");
    expect(bare["data-current"]).toBe("true");
    expect(none["aria-current"]).toBeUndefined();
    expect(none["data-current"]).toBeUndefined();
  });
});
