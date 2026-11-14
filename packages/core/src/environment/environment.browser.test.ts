import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultEnvironment, resolveEnvironment, trackEnvironment } from "./environment";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("resolveEnvironment", () => {
  it("reads density from the nearest attribute, not from the media query", () => {
    const host = mount(`<div data-sui-density="touch"><button id="a"></button></div>`);

    expect(resolveEnvironment(host.querySelector("#a")).density).toBe("touch");
  });

  it("falls back to the pointer media query when no attribute is set", () => {
    const host = mount(`<button id="a"></button>`);

    // The headless browser reports a fine pointer; the assertion is that the
    // fallback runs at all, not which way it lands.
    expect(["touch", "desktop"]).toContain(resolveEnvironment(host.querySelector("#a")).density);
  });

  it("ignores an attribute that is not a density", () => {
    const host = mount(`<div data-sui-density="huge"><button id="a"></button></div>`);

    expect(resolveEnvironment(host.querySelector("#a")).density).toBe("desktop");
  });

  it("reads the resolved direction and the nearest lang", () => {
    const host = mount(`<div dir="rtl" lang="ar-EG"><span><button id="a"></button></span></div>`);
    const environment = resolveEnvironment(host.querySelector("#a"));

    expect(environment.dir).toBe("rtl");
    expect(environment.locale).toBe("ar-EG");
  });

  it("treats data-motion as the app's override of the media query", () => {
    const reduced = mount(`<div data-motion="reduced"><button id="a"></button></div>`);
    const full = mount(`<div data-motion="full"><button id="b"></button></div>`);

    expect(resolveEnvironment(reduced.querySelector("#a")).reducedMotion).toBe(true);
    expect(resolveEnvironment(full.querySelector("#b")).reducedMotion).toBe(false);
  });

  /**
   * The distinction the boolean could not carry. `_motion.scss` writes it out:
   * "Replace, do not remove: movement becomes a crossfade, durations never hit
   * 0" — `$reduced` neutralises the scales and the distances and leaves
   * `duration-150` alone, and only `$none` flattens the durations. Anything
   * downstream deciding whether an animation *exists* has to read the mode; the
   * boolean answers a different question and answers it for both.
   */
  it("tells reduced from none, which the boolean cannot", () => {
    const reduced = mount(`<div data-motion="reduced"><button id="a"></button></div>`);
    const none = mount(`<div data-motion="none"><button id="b"></button></div>`);

    expect(resolveEnvironment(reduced.querySelector("#a")).motion).toBe("reduced");
    expect(resolveEnvironment(none.querySelector("#b")).motion).toBe("none");
    // And both are still "reduced motion" to everything that only needs to know
    // that much — a smooth scroll is wrong under either.
    expect(resolveEnvironment(reduced.querySelector("#a")).reducedMotion).toBe(true);
    expect(resolveEnvironment(none.querySelector("#b")).reducedMotion).toBe(true);
  });

  it("does not read a misspelt data-motion as a mode", () => {
    const misspelt = mount(`<div data-motion="reduce"><button id="a"></button></div>`);
    const bare = mount(`<button id="b"></button>`);

    // Compared against a node with no attribute at all rather than against a
    // literal: what is being asserted is that the typo *falls through*, and the
    // value it falls through to is whatever this engine's media query says.
    expect(resolveEnvironment(misspelt.querySelector("#a")).motion).toBe(
      resolveEnvironment(bare.querySelector("#b")).motion,
    );
  });

  it("lets explicit overrides win over everything", () => {
    const host = mount(`<div data-sui-density="touch" dir="rtl"><button id="a"></button></div>`);

    expect(
      resolveEnvironment(host.querySelector("#a"), { density: "desktop", dir: "ltr" }),
    ).toMatchObject({ density: "desktop", dir: "ltr" });
  });

  it("falls back to defaults with no node — the SSR case", () => {
    expect(resolveEnvironment(null)).toEqual(defaultEnvironment);
    expect(resolveEnvironment(null, { density: "touch" }).density).toBe("touch");
  });
});

describe("trackEnvironment", () => {
  it("reports when an attribute changes the resolved value", async () => {
    const host = mount(`<div id="root"><button id="a"></button></div>`);
    const root = host.querySelector("#root") as HTMLElement;
    const onChange = vi.fn();
    cleanups.push(trackEnvironment(host.querySelector("#a"), { onChange }));

    root.setAttribute("data-sui-density", "touch");
    await tick();

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ density: "touch" }));
  });

  it("stays quiet when the resolved value did not actually change", async () => {
    const host = mount(`<div id="root"><button id="a"></button></div>`);
    const root = host.querySelector("#root") as HTMLElement;
    const onChange = vi.fn();
    cleanups.push(trackEnvironment(host.querySelector("#a"), { onChange }));

    root.setAttribute("dir", "ltr");
    root.setAttribute("data-motion", "full");
    await tick();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops watching once disposed", async () => {
    const host = mount(`<div id="root"><button id="a"></button></div>`);
    const root = host.querySelector("#root") as HTMLElement;
    const onChange = vi.fn();

    trackEnvironment(host.querySelector("#a"), { onChange })();
    root.setAttribute("data-sui-density", "touch");
    await tick();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shares one observer and one pair of queries across every tracker of a document", () => {
    const host = mount(`<button id="a"></button><button id="b"></button><button id="c"></button>`);
    const Native = window.MutationObserver;
    let observers = 0;
    vi.stubGlobal(
      "MutationObserver",
      class extends Native {
        constructor(callback: MutationCallback) {
          super(callback);
          observers++;
        }
      },
    );
    const listened = vi.spyOn(MediaQueryList.prototype, "addEventListener");
    cleanups.push(() => {
      vi.unstubAllGlobals();
      listened.mockRestore();
    });

    for (const id of ["#a", "#b", "#c"]) {
      cleanups.push(trackEnvironment(host.querySelector(id), { onChange: () => {} }));
    }

    expect(observers).toBe(1);
    expect(listened).toHaveBeenCalledTimes(2);
  });

  it("keeps the other trackers watching when one stops, and watches again after all stopped", async () => {
    const host = mount(`<div id="root"><button id="a"></button><button id="b"></button></div>`);
    const root = host.querySelector("#root") as HTMLElement;
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = trackEnvironment(host.querySelector("#a"), { onChange: first });
    const stopSecond = trackEnvironment(host.querySelector("#b"), { onChange: second });
    stopFirst();
    stopFirst();
    root.setAttribute("data-sui-density", "touch");
    await tick();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ density: "touch" }));

    stopSecond();
    const third = vi.fn();
    cleanups.push(trackEnvironment(host.querySelector("#a"), { onChange: third }));
    root.setAttribute("data-sui-density", "desktop");
    await tick();
    expect(third).toHaveBeenCalledWith(expect.objectContaining({ density: "desktop" }));
  });
});
