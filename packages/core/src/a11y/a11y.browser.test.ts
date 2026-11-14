import { afterEach, describe, expect, it } from "vitest";
import { hideOthers } from "./aria-hidden";
import { getLiveAnnouncer } from "./live-announcer";
import { isScrollLocked, lockScroll } from "./scroll-lock";
import { getVisuallyHiddenProps, visuallyHiddenStyle } from "./visually-hidden";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function tick(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("visuallyHidden", () => {
  it("keeps the node in the accessibility tree and in the tab order", () => {
    const host = mount(`<button id="a">Label</button>`);
    const button = host.querySelector("#a") as HTMLElement;
    for (const [property, value] of Object.entries(visuallyHiddenStyle)) {
      button.style.setProperty(property, value);
    }

    expect(button.checkVisibility()).toBe(true);
    expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(getVisuallyHiddenProps().style).toBe(visuallyHiddenStyle);
  });
});

describe("live announcer", () => {
  afterEach(() => {
    getLiveAnnouncer(document).destroy();
  });

  it("creates exactly one region per politeness, up front and empty", () => {
    getLiveAnnouncer(document);
    getLiveAnnouncer(document);

    const regions = document.querySelectorAll("[data-sui-live-region]");
    expect(regions).toHaveLength(2);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it("fills the region on a later task, so the change is observable", async () => {
    const announcer = getLiveAnnouncer(document);
    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;

    announcer.announce("3 results");
    expect(region.textContent).toBe("");

    await tick();
    expect(region.textContent).toBe("3 results");
  });

  it("clears between identical messages so they are announced twice", async () => {
    const announcer = getLiveAnnouncer(document);
    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;

    announcer.announce("Copied");
    await tick();
    announcer.announce("Copied");
    expect(region.textContent).toBe("");

    await tick();
    expect(region.textContent).toBe("Copied");
  });

  it("routes assertive messages to their own region", async () => {
    const announcer = getLiveAnnouncer(document);
    announcer.announce("Saved");
    announcer.announce("Failed", "assertive");
    await tick();

    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Saved");
    expect(document.querySelector('[aria-live="assertive"]')?.textContent).toBe("Failed");
  });

  it("removes its regions on destroy", () => {
    getLiveAnnouncer(document).destroy();

    expect(document.querySelectorAll("[data-sui-live-region]")).toHaveLength(0);
  });
});

describe("hideOthers", () => {
  it("hides the siblings along the ancestor chain and nothing else", () => {
    const host = mount(`
      <div id="page">
        <header id="header"></header>
        <main id="main"><p id="text"></p><div id="dialog"></div></main>
      </div>
    `);
    const dialog = host.querySelector("#dialog") as HTMLElement;

    const restore = hideOthers([dialog]);

    expect(host.querySelector("#header")?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("#text")?.getAttribute("aria-hidden")).toBe("true");
    // The chain itself stays visible, or the dialog would be hidden with it.
    expect(host.querySelector("#main")?.hasAttribute("aria-hidden")).toBe(false);
    expect(dialog.hasAttribute("aria-hidden")).toBe(false);

    restore();
    expect(host.querySelector("#header")?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("leaves alone whatever lies inside a kept element", () => {
    const host = mount(`
      <div id="page"></div>
      <div id="portal">
        <div id="backdrop"></div>
        <div id="positioner"><div id="content"></div><button id="cancel"></button></div>
      </div>
    `);
    const pick = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    const restore = hideOthers([pick("content"), pick("positioner"), pick("backdrop")], {
      inert: true,
    });
    cleanups.push(restore);

    expect(pick("cancel").hasAttribute("aria-hidden")).toBe(false);
    expect(pick("cancel").hasAttribute("inert")).toBe(false);
    expect(pick("backdrop").hasAttribute("inert")).toBe(false);
    expect(pick("page").getAttribute("aria-hidden")).toBe("true");
    expect(pick("page").hasAttribute("inert")).toBe(true);
  });

  it("spares a sibling that names the given layer as its parent, and only that one", () => {
    const host = mount(`
      <div id="dialog"></div>
      <div id="child" data-sui-layer-parent="d1"></div>
      <div id="stranger" data-sui-layer-parent="d2"></div>
      <div id="plain"></div>
    `);
    const pick = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    cleanups.push(hideOthers([pick("dialog")], { inert: true, layer: "d1" }));

    expect(pick("child").hasAttribute("aria-hidden")).toBe(false);
    expect(pick("child").hasAttribute("inert")).toBe(false);
    expect(pick("stranger").getAttribute("aria-hidden")).toBe("true");
    expect(pick("stranger").hasAttribute("inert")).toBe(true);
    expect(pick("plain").getAttribute("aria-hidden")).toBe("true");
    expect(pick("plain").hasAttribute("inert")).toBe(true);
  });

  it("never marks an element that holds a kept one, whichever walk reaches it (R65)", () => {
    const surface = mount(`<div id="positioner"><div id="content"></div></div>`);
    const portal = mount(`<div id="wrap"><button id="widget"></button></div>`);
    const pageHost = mount(`<p id="page"></p>`);
    const content = surface.querySelector("#content") as HTMLElement;
    const widget = portal.querySelector("#widget") as HTMLElement;

    cleanups.push(hideOthers([content, widget], { inert: true }));

    expect(widget.closest("[inert]")).toBeNull();
    expect(widget.closest("[aria-hidden]")).toBeNull();
    expect(content.closest("[inert]")).toBeNull();
    expect(content.closest("[aria-hidden]")).toBeNull();
    expect(pageHost.getAttribute("aria-hidden")).toBe("true");
    expect(pageHost.hasAttribute("inert")).toBe(true);
  });

  it("stops at body and leaves <head> alone (R65)", () => {
    const host = mount(`<div id="dialog"></div>`);

    cleanups.push(hideOthers([host.querySelector("#dialog") as HTMLElement], { inert: true }));

    expect(document.head.hasAttribute("aria-hidden")).toBe(false);
    expect(document.head.hasAttribute("inert")).toBe(false);
  });

  it("restores an aria-hidden the author had set", () => {
    const host = mount(`<div id="other" aria-hidden="true"></div><div id="dialog"></div>`);
    const restore = hideOthers([host.querySelector("#dialog") as HTMLElement]);

    restore();

    expect(host.querySelector("#other")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("counts, so an inner dialog closing does not reveal the page", () => {
    const host = mount(`<div id="other"></div><div id="outer"></div><div id="inner"></div>`);
    const other = host.querySelector("#other") as HTMLElement;

    const restoreOuter = hideOthers([host.querySelector("#outer") as HTMLElement]);
    const restoreInner = hideOthers([host.querySelector("#inner") as HTMLElement]);

    restoreInner();
    expect(other.getAttribute("aria-hidden")).toBe("true");

    restoreOuter();
    expect(other.hasAttribute("aria-hidden")).toBe(false);
  });

  it("leaves live regions announcing from under a modal", () => {
    const host = mount(`<div aria-live="polite" id="live"></div><div id="dialog"></div>`);
    const restore = hideOthers([host.querySelector("#dialog") as HTMLElement]);
    cleanups.push(restore);

    expect(host.querySelector("#live")?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("adds inert only when asked", () => {
    const host = mount(`<div id="other"></div><div id="dialog"></div>`);
    const restore = hideOthers([host.querySelector("#dialog") as HTMLElement], { inert: true });

    expect(host.querySelector("#other")?.hasAttribute("inert")).toBe(true);
    restore();
    expect(host.querySelector("#other")?.hasAttribute("inert")).toBe(false);
  });

  it("is a no-op without a target", () => {
    expect(() => hideOthers([null])()).not.toThrow();
  });
});

describe("lockScroll", () => {
  it("hides the overflow and gives back the scrollbar width", () => {
    mount(`<div style="height: 300vh"></div>`);
    const before = document.documentElement.clientWidth;

    const release = lockScroll(document);

    expect(document.body.style.overflow).toBe("hidden");
    expect(isScrollLocked(document)).toBe(true);
    // The page must not widen: whatever the scrollbar took is paid back.
    expect(document.documentElement.clientWidth).toBe(before);
    expect(document.documentElement.style.getPropertyValue("--sui-scrollbar-width")).not.toBe("");

    release();
    expect(document.body.style.overflow).toBe("");
    expect(isScrollLocked(document)).toBe(false);
  });

  it("counts nested locks", () => {
    const first = lockScroll(document);
    const second = lockScroll(document);

    first();
    expect(document.body.style.overflow).toBe("hidden");

    second();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores a release called twice", () => {
    const first = lockScroll(document);
    const second = lockScroll(document);

    first();
    first();
    expect(isScrollLocked(document)).toBe(true);

    second();
    expect(isScrollLocked(document)).toBe(false);
  });
});
