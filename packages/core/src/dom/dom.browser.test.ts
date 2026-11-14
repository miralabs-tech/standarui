import { afterEach, describe, expect, it, vi } from "vitest";
import { ariaAttr, boolAttr, dataAttr, setAttribute, setStyle } from "./attrs";
import { addDomEvent, isModifiedEvent, isPrimaryPointer } from "./event";
import { observeAttributes, observeChildren, observeResize } from "./observers";
import { isCoarsePointer, prefersReducedMotion, supportsPointerEvents } from "./platform";
import { contains, getEventTarget, isHTMLElement, query, queryAll } from "./query";
import { nextTick, raf, rafs, timeout } from "./raf";
import { getComputedDir, isRtl, resolveDirection } from "./text-dir";

const mounted: Element[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  mounted.push(host);
  return host;
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  for (const node of mounted.splice(0, mounted.length)) node.remove();
});

describe("attrs", () => {
  it("emits present-or-absent data attributes", () => {
    expect(dataAttr(true)).toBe("");
    expect(dataAttr(false)).toBeUndefined();
    expect(dataAttr(undefined)).toBeUndefined();
  });

  it("emits aria attributes as strings", () => {
    expect(ariaAttr(true)).toBe("true");
    expect(ariaAttr(false)).toBeUndefined();
    expect(boolAttr(false)).toBe("false");
  });

  it("restores an attribute it did not own", () => {
    const host = mount(`<div id="a" data-state="open"></div><div id="b"></div>`);
    const withPrevious = host.querySelector("#a") as HTMLElement;
    const without = host.querySelector("#b") as HTMLElement;

    const restoreA = setAttribute(withPrevious, "data-state", "closed");
    const restoreB = setAttribute(without, "data-state", "closed");
    expect(withPrevious.getAttribute("data-state")).toBe("closed");

    restoreA();
    restoreB();
    expect(withPrevious.getAttribute("data-state")).toBe("open");
    expect(without.hasAttribute("data-state")).toBe(false);
  });

  it("restores inline styles, including custom properties", () => {
    const host = mount(`<div id="a" style="overflow: scroll"></div>`);
    const node = host.querySelector("#a") as HTMLElement;

    const restore = setStyle(node, { overflow: "hidden", "--sui-active-index": "2" });
    expect(node.style.overflow).toBe("hidden");
    expect(node.style.getPropertyValue("--sui-active-index")).toBe("2");

    restore();
    expect(node.style.overflow).toBe("scroll");
    expect(node.style.getPropertyValue("--sui-active-index")).toBe("");
  });
});

describe("query", () => {
  it("finds and lists elements, tolerating a null root", () => {
    const host = mount(`<button data-part="trigger"></button><button data-part="item"></button>`);

    expect(query(host, "[data-part='trigger']")).toBe(host.firstElementChild);
    expect(queryAll(host, "button")).toHaveLength(2);
    expect(query(null, "button")).toBeNull();
    expect(queryAll(undefined, "button")).toEqual([]);
  });

  it("recognises elements without instanceof, so cross-realm nodes work", () => {
    const host = mount(`<div></div>`);

    expect(isHTMLElement(host.firstElementChild)).toBe(true);
    expect(isHTMLElement(document)).toBe(false);
    expect(isHTMLElement(null)).toBe(false);
  });

  it("sees through a shadow boundary, which Node.contains does not", () => {
    const host = mount(`<div id="outer"><div id="host"></div></div>`);
    const outer = host.querySelector("#outer") as HTMLElement;
    const shadowHost = host.querySelector("#host") as HTMLElement;
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);

    expect(outer.contains(inner)).toBe(false);
    expect(contains(outer, inner)).toBe(true);
    expect(contains(outer, outer)).toBe(true);
    expect(contains(inner, outer)).toBe(false);
    expect(contains(null, inner)).toBe(false);
  });

  it("retargets an event to the element actually clicked", async () => {
    const host = mount(`<div id="host"></div>`);
    const shadowHost = host.querySelector("#host") as HTMLElement;
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);

    const seen = await new Promise<{ target: EventTarget | null; composed: EventTarget | null }>(
      (resolve) => {
        document.addEventListener(
          "click",
          (event) => resolve({ target: event.target, composed: getEventTarget(event) }),
          { once: true },
        );
        inner.click();
      },
    );

    expect(seen.target).toBe(shadowHost);
    expect(seen.composed).toBe(inner);
  });
});

describe("event", () => {
  it("returns a teardown that actually removes the listener", () => {
    const host = mount(`<button></button>`);
    const node = host.firstElementChild as HTMLButtonElement;
    const listener = vi.fn();

    const remove = addDomEvent(node, "click", listener);
    node.click();
    remove();
    node.click();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("is a no-op on a missing target", () => {
    expect(() => addDomEvent(null, "click", vi.fn())()).not.toThrow();
  });

  it("recognises modified and primary presses", () => {
    expect(isPrimaryPointer(new MouseEvent("click", { button: 0 }))).toBe(true);
    expect(isPrimaryPointer(new MouseEvent("click", { button: 2 }))).toBe(false);
    expect(isPrimaryPointer(new MouseEvent("click", { button: 0, ctrlKey: true }))).toBe(false);
    expect(isModifiedEvent(new MouseEvent("click", { metaKey: true }))).toBe(true);
    expect(isModifiedEvent(new MouseEvent("click"))).toBe(false);
  });
});

describe("raf", () => {
  it("cancels a scheduled frame", async () => {
    const fn = vi.fn();
    raf(window, fn)();
    await frame();

    expect(fn).not.toHaveBeenCalled();
  });

  it("waits two frames so portalled content exists", async () => {
    const order: string[] = [];
    raf(window, () => order.push("single"));
    rafs(window, () => order.push("double"));
    await frame();

    expect(order).toEqual(["single", "double"]);
  });

  it("cancels a double frame from either side of it", async () => {
    const fn = vi.fn();
    const cancel = rafs(window, fn);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    cancel();
    await frame();

    expect(fn).not.toHaveBeenCalled();
  });

  it("cancels microtasks and timeouts", async () => {
    const micro = vi.fn();
    const later = vi.fn();
    nextTick(micro)();
    timeout(window, later, 0)();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(micro).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });
});

describe("observers", () => {
  it("reports the attributes it was asked about, and stops on teardown", async () => {
    const host = mount(`<div></div>`);
    const node = host.firstElementChild as HTMLElement;
    const callback = vi.fn();

    const stop = observeAttributes(node, ["data-state"], callback);
    node.setAttribute("data-state", "open");
    node.setAttribute("data-other", "x");
    await frame();
    expect(callback).toHaveBeenCalledOnce();

    stop();
    node.setAttribute("data-state", "closed");
    await frame();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("reports child mutations", async () => {
    const host = mount(`<div></div>`);
    const node = host.firstElementChild as HTMLElement;
    const callback = vi.fn();

    const stop = observeChildren(node, callback);
    node.append(document.createElement("span"));
    await frame();
    stop();

    expect(callback).toHaveBeenCalled();
  });

  it("reports the content rect on resize", async () => {
    const host = mount(`<div style="width: 100px"></div>`);
    const node = host.firstElementChild as HTMLElement;
    const rects: DOMRectReadOnly[] = [];

    const stop = observeResize(node, (rect) => rects.push(rect));
    await frame();
    node.style.width = "240px";
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    stop();

    expect(rects.at(-1)?.width).toBe(240);
  });

  it("is a no-op on a missing node", () => {
    expect(() => {
      observeAttributes(null, ["data-state"], vi.fn())();
      observeChildren(undefined, vi.fn())();
      observeResize(null, vi.fn())();
    }).not.toThrow();
  });
});

describe("platform", () => {
  it("reads media features from the window it was given", () => {
    expect(typeof isCoarsePointer(window)).toBe("boolean");
    expect(typeof prefersReducedMotion(window)).toBe("boolean");
    expect(supportsPointerEvents(window)).toBe(true);
  });
});

describe("text-dir", () => {
  it("reads the resolved direction, not the nearest attribute", () => {
    const host = mount(`<div dir="rtl"><span><button></button></span></div>`);
    const button = host.querySelector("button") as HTMLElement;

    expect(getComputedDir(button)).toBe("rtl");
    expect(getComputedDir(document.body)).toBe("ltr");
    expect(getComputedDir(null)).toBe("ltr");
  });

  it("maps logical directions onto physical ones", () => {
    expect(resolveDirection("start", "ltr")).toBe("left");
    expect(resolveDirection("start", "rtl")).toBe("right");
    expect(resolveDirection("end", "rtl")).toBe("left");
    expect(isRtl("rtl")).toBe(true);
    expect(isRtl(undefined)).toBe(false);
  });
});
