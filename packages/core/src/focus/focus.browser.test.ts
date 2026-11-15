import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { focusElement, getTabbableEdges, getTabbables, isFocusable, isTabbable } from "../nav";
import { trapFocus } from "./focus-trap";
import { proxyTabFocus } from "./proxy-tab-focus";
import { restoreFocus } from "./restore-focus";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function frames(count = 3): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      if (--left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Past the microtask and the task a held Tab can settle in. */
function settleTab(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => frames(1));
}

function tab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("tabbable", () => {
  it("lists the tabbables in document order and skips the rest", () => {
    const host = mount(`
      <button id="one"></button>
      <button id="disabled" disabled></button>
      <a id="link" href="#x"></a>
      <span id="span"></span>
      <div id="roved" tabindex="-1"></div>
      <input id="text" />
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["one", "link", "text"]);
    expect(isFocusable(host.querySelector("#roved"))).toBe(true);
    expect(isTabbable(host.querySelector("#roved"))).toBe(false);
    expect(isFocusable(host.querySelector("#span"))).toBe(false);
    expect(isFocusable(host.querySelector("#disabled"))).toBe(false);
  });

  it("ignores hidden and inert subtrees", () => {
    const host = mount(`
      <button id="visible"></button>
      <div hidden><button id="hidden"></button></div>
      <div style="display: none"><button id="none"></button></div>
      <div inert><button id="inert"></button></div>
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["visible"]);
  });

  it("reports the edges, and null on an empty container", () => {
    const host = mount(`<div id="empty"></div><button id="a"></button><button id="b"></button>`);

    const [first, last] = getTabbableEdges(host);
    expect(first?.id).toBe("a");
    expect(last?.id).toBe("b");
    expect(getTabbableEdges(host.querySelector("#empty"))).toEqual([null, null]);
  });

  it("counts an editing host as a Tab stop, and nothing editable inside it", () => {
    const host = mount(`
      <button id="a"></button>
      <div id="editor" contenteditable><span id="inner" contenteditable>x</span><a id="inner-link" href="#x">y</a></div>
      <button id="b"></button>
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["a", "editor", "b"]);
    const [first, last] = getTabbableEdges(host);
    expect(first?.id).toBe("a");
    expect(last?.id).toBe("b");
  });

  it("leaves out a control fenced by a disabled fieldset, and a trap wraps past it", async () => {
    // Consumed from @standarx/nav 0.3.0 (standarnav#10): red when the module's `:disabled,[disabled]` is cut back to 0.1.0's `[disabled]`.
    const host = mount(`
      <button id="first"></button>
      <button id="before"></button>
      <fieldset disabled><button id="fenced"></button></fieldset>
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["first", "before"]);

    cleanups.push(trapFocus(host));
    await frames();
    focusElement(host.querySelector("#before"));
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("first");
  });
});

describe("trapFocus", () => {
  function scene(): { layer: HTMLElement; outside: HTMLElement } {
    const host = mount(`
      <button id="outside"></button>
      <div id="layer"><button id="first"></button><button id="last"></button></div>
    `);
    return {
      layer: host.querySelector("#layer") as HTMLElement,
      outside: host.querySelector("#outside") as HTMLElement,
    };
  }

  it("moves focus in on activation and restores it on teardown", async () => {
    const { layer, outside } = scene();
    focusElement(outside);

    const release = trapFocus(layer);
    await frames();
    expect(document.activeElement?.id).toBe("first");

    release();
    expect(document.activeElement).toBe(outside);
  });

  it("honours initialFocus and finalFocus", async () => {
    const { layer, outside } = scene();
    const last = layer.querySelector("#last") as HTMLElement;

    const release = trapFocus(layer, {
      initialFocus: () => last,
      finalFocus: () => outside,
    });
    await frames();
    expect(document.activeElement).toBe(last);

    release();
    expect(document.activeElement).toBe(outside);
  });

  it("wraps Tab at both edges", async () => {
    const { layer } = scene();
    const first = layer.querySelector("#first") as HTMLElement;
    const last = layer.querySelector("#last") as HTMLElement;
    cleanups.push(trapFocus(layer));
    await frames();

    focusElement(last);
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  describe("when a link sits between two controls", () => {
    function linked(): { first: HTMLElement; link: HTMLElement; last: HTMLElement } {
      const host = mount(`
        <div id="layer"><button id="first"></button><a id="link" href="#x">link</a><button id="last"></button></div>
      `);
      const layer = host.querySelector("#layer") as HTMLElement;
      cleanups.push(trapFocus(layer));
      return {
        first: layer.querySelector("#first") as HTMLElement,
        link: layer.querySelector("#link") as HTMLElement,
        last: layer.querySelector("#last") as HTMLElement,
      };
    }

    it("takes the step onto the link itself, both ways, and leaves the other steps to the browser", async () => {
      const { first, link, last } = linked();
      await frames();

      focusElement(last);
      expect(tab(true).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(link);

      focusElement(first);
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(link);

      expect(tab().defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(link);
    });

    it("keeps a real Shift+Tab from the last control on the link, whatever the engine skips", async () => {
      const { link, last } = linked();
      await frames();

      focusElement(last);
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      expect(document.activeElement).toBe(link);

      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(last);
    });

    it("leaves the step to a control that answers its own Tab", async () => {
      const { first, link } = linked();
      await frames();

      focusElement(first);
      first.addEventListener("keydown", (event) => event.preventDefault());
      tab();
      expect(document.activeElement).toBe(first);
      expect(document.activeElement).not.toBe(link);
    });
  });

  it("wraps Tab at both edges when the last stop is an editing host", async () => {
    const host = mount(`
      <div id="layer"><button id="first"></button><div id="editor" contenteditable>text</div></div>
    `);
    const layer = host.querySelector("#layer") as HTMLElement;
    const first = layer.querySelector("#first") as HTMLElement;
    const editor = layer.querySelector("#editor") as HTMLElement;
    cleanups.push(trapFocus(layer));
    await frames();

    focusElement(editor);
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
  });

  it("pulls focus back when it lands outside", async () => {
    const { layer, outside } = scene();
    cleanups.push(trapFocus(layer));
    await frames();

    outside.focus();

    expect(document.activeElement?.id).toBe("first");
  });

  it("holds focus on the container when it has no tabbables", async () => {
    const host = mount(`<div id="empty"></div>`);
    const layer = host.querySelector("#empty") as HTMLElement;
    cleanups.push(trapFocus(layer));
    await frames();

    expect(document.activeElement).toBe(layer);
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(layer);
  });

  it("hands control to the innermost trap and back on release", async () => {
    const host = mount(`
      <div id="outer"><button id="outer-btn"></button></div>
      <div id="inner"><button id="inner-btn"></button></div>
    `);
    const outer = host.querySelector("#outer") as HTMLElement;
    const inner = host.querySelector("#inner") as HTMLElement;

    cleanups.push(trapFocus(outer));
    await frames();
    const releaseInner = trapFocus(inner);
    await frames();
    expect(document.activeElement?.id).toBe("inner-btn");

    // The outer trap must stay quiet while the inner one is on top.
    (host.querySelector("#outer-btn") as HTMLElement).focus();
    expect(document.activeElement?.id).toBe("inner-btn");

    releaseInner();
    (host.querySelector("#outer-btn") as HTMLElement).focus();
    expect(document.activeElement?.id).toBe("outer-btn");
  });

  describe("with an `owns` that reaches a portalled child layer", () => {
    /** The child comes last, as a portal does: nothing tabbable follows it. */
    function portalled(order: "child-last" | "child-first" = "child-last"): {
      layer: HTMLElement;
      child: HTMLElement;
      outside: HTMLElement;
    } {
      const layer = `<div id="layer"><button id="first"></button><button id="middle"></button><button id="last"></button></div>`;
      const child = `<div id="child"><button id="child-a"></button><button id="child-b"></button></div>`;
      const host = mount(
        order === "child-last"
          ? `<button id="outside"></button>${layer}${child}`
          : `${child}<button id="outside"></button>${layer}`,
      );
      return {
        layer: host.querySelector("#layer") as HTMLElement,
        child: host.querySelector("#child") as HTMLElement,
        outside: host.querySelector("#outside") as HTMLElement,
      };
    }

    function byId(id: string): HTMLElement {
      return document.getElementById(id) as HTMLElement;
    }

    /** What a menu does with Tab: it closes and gives the focus back to its trigger. */
    function handBackOnTab(child: HTMLElement, to: string): void {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Tab") focusElement(byId(to));
      };
      child.addEventListener("keydown", onKeyDown);
      cleanups.push(() => child.removeEventListener("keydown", onKeyDown));
    }

    /** The same, from a framework that flushes after the event: React under Playwright's Firefox. */
    function handBackLater(child: HTMLElement, to: string): void {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Tab") queueMicrotask(() => focusElement(byId(to)));
      };
      child.addEventListener("keydown", onKeyDown);
      cleanups.push(() => child.removeEventListener("keydown", onKeyDown));
    }

    it("lets focus land in the child layer and still pulls it back from the page", async () => {
      const { layer, child, outside } = portalled();
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-a"));
      expect(document.activeElement?.id).toBe("child-a");
      focusElement(byId("child-b"));
      expect(document.activeElement?.id).toBe("child-b");

      outside.focus();
      expect(document.activeElement?.id).toBe("first");
    });

    it("lets Tab move on when the next stop is still in the child layer", async () => {
      const { layer, child } = portalled();
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-a"));
      expect(tab().defaultPrevented).toBe(false);
      expect(document.activeElement?.id).toBe("child-a");
    });

    it("holds Tab that would carry the focus out of the child layer and the page with it", async () => {
      const { layer, child } = portalled();
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-b"));
      expect(tab().defaultPrevented).toBe(true);
      await Promise.resolve();
      expect(document.activeElement?.id).toBe("first");
    });

    it("holds Shift+Tab the same way when the child layer is first in the document", async () => {
      const { layer, child } = portalled("child-first");
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-a"));
      expect(tab(true).defaultPrevented).toBe(true);
      await Promise.resolve();
      expect(document.activeElement?.id).toBe("last");
    });

    it("does not let the browser step from the child layer onto the surface's edge", async () => {
      const { layer, child } = portalled();
      handBackLater(child, "middle");
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      // The browser's own Shift+Tab from here is `#last`, the surface's edge.
      focusElement(byId("child-a"));
      expect(tab(true).defaultPrevented).toBe(true);
      await frames(1);
      expect(document.activeElement?.id).toBe("first");
    });

    it("waits for a child layer that hands the focus back in a microtask", async () => {
      const { layer, child } = portalled();
      handBackLater(child, "middle");
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-b"));
      expect(tab().defaultPrevented).toBe(true);
      await frames(1);
      expect(document.activeElement?.id).toBe("last");
    });

    it("wraps once the child layer has handed the focus back to the last stop", async () => {
      const { layer, child } = portalled();
      handBackOnTab(child, "last");
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-a"));
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe("first");
    });

    it("leaves a Tab alone once a child layer prevented it and gave the focus back", async () => {
      const { layer, child } = portalled();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        focusElement(byId("last"));
      };
      child.addEventListener("keydown", onKeyDown);
      cleanups.push(() => child.removeEventListener("keydown", onKeyDown));
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      // From `#child-a` the browser's own step stays in the child layer, so the
      // trap holds nothing in capture and only looks again in the bubble phase.
      focusElement(byId("child-a"));
      tab();
      await settleTab();
      expect(document.activeElement?.id).toBe("last");
    });

    it("steps on from the stop the focus was handed back to, both ways", async () => {
      const { layer, child } = portalled();
      handBackOnTab(child, "middle");
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-b"));
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe("last");

      focusElement(byId("child-b"));
      expect(tab(true).defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe("first");
    });

    it("leaves a Tab that a listener ahead of it already answered alone", async () => {
      const { layer, child } = portalled();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        focusElement(byId("last"));
      };
      // In capture on the document and installed first, so it runs ahead of the trap.
      document.addEventListener("keydown", onKeyDown, true);
      cleanups.push(() => document.removeEventListener("keydown", onKeyDown, true));
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      // The surface's last stop: a trap that answered too would wrap it to the first.
      focusElement(byId("child-b"));
      tab();
      await settleTab();
      expect(document.activeElement?.id).toBe("last");
    });

    it("leaves the step to a child layer that places the focus itself", async () => {
      const { layer, child } = portalled();
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      // Installed after the trap, as a layer opened from the surface is.
      cleanups.push(proxyTabFocus(child, { triggerNode: () => byId("middle") }));
      await frames();

      focusElement(byId("child-b"));
      expect(tab().defaultPrevented).toBe(true);
      await settleTab();
      expect(document.activeElement?.id).toBe("last");
    });

    it("holds a Tab whose propagation a child layer stopped", async () => {
      const { layer, child } = portalled();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Tab") event.stopPropagation();
      };
      child.addEventListener("keydown", onKeyDown);
      cleanups.push(() => child.removeEventListener("keydown", onKeyDown));
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      focusElement(byId("child-b"));
      expect(tab().defaultPrevented).toBe(true);
      await settleTab();
      expect(document.activeElement?.id).toBe("first");
    });

    describe("when a child layer hands the focus back to the surface's last stop on Tab (R41)", () => {
      /** A real Tab: a synthetic one has no default action, so it cannot show where the browser goes. */
      async function realTab(): Promise<void> {
        if (!document.hasFocus()) window.focus();
        await userEvent.keyboard("{Tab}");
        await settleTab();
      }

      function handBackToLast(child: HTMLElement, stop: boolean): { readonly calls: number } {
        const seen = { calls: 0 };
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key !== "Tab") return;
          seen.calls += 1;
          focusElement(byId("last"));
          if (stop) event.stopPropagation();
        };
        child.addEventListener("keydown", onKeyDown);
        cleanups.push(() => child.removeEventListener("keydown", onKeyDown));
        return seen;
      }

      it("wraps to the first stop when the event still reaches the trap in the bubble phase", async () => {
        const { layer, child } = portalled();
        const seen = handBackToLast(child, false);
        cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
        await frames();

        focusElement(byId("child-a"));
        await realTab();
        expect(seen.calls).toBe(1);
        expect(document.activeElement?.id).toBe("first");
      });

      it("leaves the step to the browser when the handler also stops the propagation", async () => {
        const { layer, child } = portalled();
        const seen = handBackToLast(child, true);
        cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
        await frames();

        // `#child-a` is also where the Tab starts: the count proves the key arrived.
        // The browser steps on from `#last`, whose next stop is the child layer's first: no wrap to `#first`.
        focusElement(byId("child-a"));
        await realTab();
        expect(seen.calls).toBe(1);
        expect(document.activeElement?.id).toBe("child-a");
      });
    });

    it("leaves Ctrl+Tab, Alt+Tab, Meta+Tab and a composing Tab to the browser", async () => {
      const { layer, child } = portalled();
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      for (const init of [
        { ctrlKey: true },
        { altKey: true },
        { metaKey: true },
        { isComposing: true },
      ] satisfies KeyboardEventInit[]) {
        for (const from of ["last", "child-b"]) {
          focusElement(byId(from));
          const event = new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
            ...init,
          });
          document.activeElement?.dispatchEvent(event);
          await settleTab();
          expect(event.defaultPrevented).toBe(false);
          expect(document.activeElement?.id).toBe(from);
        }
      }
    });

    it("does not take the focus from the child layer on activation", async () => {
      const { layer, child } = portalled();
      focusElement(byId("child-a"));
      cleanups.push(trapFocus(layer, { owns: (target) => child.contains(target) }));
      await frames();

      expect(document.activeElement?.id).toBe("child-a");
    });

    /** The shape the overlays pass: the layer stack answers for the layer's own node too. */
    describe("when `owns` also answers for the trap's own container", () => {
      it("still wraps Tab at the last stop", async () => {
        const { layer, child } = portalled();
        cleanups.push(
          trapFocus(layer, { owns: (target) => layer.contains(target) || child.contains(target) }),
        );
        await frames();

        focusElement(byId("last"));
        expect(tab().defaultPrevented).toBe(true);
        expect(document.activeElement?.id).toBe("first");
      });

      it("still moves the focus to the first stop on activation", async () => {
        const { layer, child } = portalled();
        focusElement(byId("last"));
        cleanups.push(
          trapFocus(layer, { owns: (target) => layer.contains(target) || child.contains(target) }),
        );
        await frames();

        expect(document.activeElement?.id).toBe("first");
      });

      it("leaves keys other than Tab alone", async () => {
        const { layer, child } = portalled();
        cleanups.push(
          trapFocus(layer, { owns: (target) => layer.contains(target) || child.contains(target) }),
        );
        await frames();

        focusElement(byId("child-b"));
        const event = new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        });
        document.activeElement?.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement?.id).toBe("child-b");
      });
    });
  });

  it("does not restore focus to an element that left with the layer", async () => {
    const host = mount(`<button id="gone"></button><div id="layer"><button></button></div>`);
    const trigger = host.querySelector("#gone") as HTMLElement;
    const layer = host.querySelector("#layer") as HTMLElement;
    focusElement(trigger);

    const release = trapFocus(layer);
    await frames();
    trigger.remove();

    expect(() => release()).not.toThrow();
  });
});

describe("proxyTabFocus", () => {
  function scene(): { content: HTMLElement; trigger: HTMLElement; after: HTMLElement } {
    const host = mount(`
      <button id="before"></button>
      <button id="trigger"></button>
      <button id="after"></button>
      <div id="content"><button id="inner-first"></button><button id="inner-last"></button></div>
    `);
    return {
      content: host.querySelector("#content") as HTMLElement,
      trigger: host.querySelector("#trigger") as HTMLElement,
      after: host.querySelector("#after") as HTMLElement,
    };
  }

  it("sends a forward Tab to the element after the trigger", () => {
    const { content, trigger, after } = scene();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger }));

    focusElement(content.querySelector("#inner-last"));
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(after);
  });

  it("sends a backward Tab to the trigger", () => {
    const { content, trigger } = scene();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger }));

    focusElement(content.querySelector("#inner-first"));
    expect(tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves Tab alone in the middle of the content", () => {
    const { content, trigger } = scene();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger }));

    focusElement(content.querySelector("#inner-first"));
    expect(tab().defaultPrevented).toBe(false);
  });

  it("leaves Tab alone outside the content", () => {
    const { content, trigger } = scene();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger }));

    focusElement(trigger);
    expect(tab().defaultPrevented).toBe(false);
  });

  describe("when the trigger is an anchor that cannot take the focus", () => {
    function anchored(): { content: HTMLElement; anchor: HTMLElement } {
      const host = mount(`
        <button id="before"></button>
        <div id="anchor">anchor</div>
        <button id="after"></button>
        <div id="content"><button id="inner-first"></button><button id="inner-last"></button></div>
      `);
      return {
        content: host.querySelector("#content") as HTMLElement,
        anchor: host.querySelector("#anchor") as HTMLElement,
      };
    }

    it("sends a forward Tab to the element after the anchor", () => {
      const { content, anchor } = anchored();
      cleanups.push(proxyTabFocus(content, { triggerNode: () => anchor }));

      focusElement(content.querySelector("#inner-last"));
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe("after");
    });

    it("sends a backward Tab to the element before the anchor, not onto the anchor", () => {
      const { content, anchor } = anchored();
      cleanups.push(proxyTabFocus(content, { triggerNode: () => anchor }));

      focusElement(content.querySelector("#inner-first"));
      expect(tab(true).defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe("before");
    });

    it("leaves the key alone when nothing precedes the anchor", () => {
      const host = mount(`
        <div id="lone-anchor">anchor</div>
        <div id="lone-content"><button id="lone-inner"></button></div>
      `);
      const content = host.querySelector("#lone-content") as HTMLElement;
      const anchor = host.querySelector("#lone-anchor") as HTMLElement;
      cleanups.push(proxyTabFocus(content, { triggerNode: () => anchor }));

      focusElement(content.querySelector("#lone-inner"));
      expect(tab(true).defaultPrevented).toBe(false);
      expect(tab().defaultPrevented).toBe(false);
      expect(document.activeElement?.id).toBe("lone-inner");
    });
  });

  it("leaves Ctrl+Tab, Alt+Tab, Meta+Tab and a composing Tab to the browser", () => {
    const { content, trigger } = scene();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger }));

    for (const init of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ] satisfies KeyboardEventInit[]) {
      focusElement(content.querySelector("#inner-last"));
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
        ...init,
      });
      document.activeElement?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement?.id).toBe("inner-last");
    }
  });

  it("reports where focus went", () => {
    const { content, trigger, after } = scene();
    const onFocusOut = vi.fn();
    cleanups.push(proxyTabFocus(content, { triggerNode: () => trigger, onFocusOut }));

    focusElement(content.querySelector("#inner-last"));
    tab();

    expect(onFocusOut).toHaveBeenCalledWith(after);
  });
});

/**
 * R58: the element a closing layer hands the focus back to may have stopped
 * taking it while the layer was open — a trigger disabled under decision 61.
 */
describe("restoreFocus", () => {
  function scene(): { layer: HTMLElement; trigger: HTMLButtonElement } {
    const host = mount(`
      <button id="before">Before</button>
      <button id="trigger">Trigger</button>
      <button id="after">After</button>
      <div id="layer"><button id="inner">Inner</button></div>
    `);
    const layer = host.querySelector("#layer") as HTMLElement;
    focusElement(layer.querySelector("#inner"));
    return { layer, trigger: host.querySelector("#trigger") as HTMLButtonElement };
  }

  it("hands the focus to a target that takes it", () => {
    const { layer, trigger } = scene();
    restoreFocus(trigger, layer);
    expect(document.activeElement).toBe(trigger);
  });

  it("falls back on the tab stop after a disabled target, never inside the layer", () => {
    const { layer, trigger } = scene();
    trigger.disabled = true;
    restoreFocus(trigger, layer);
    expect(document.activeElement?.id).toBe("after");
  });

  it("falls back on the tab stop before when none follows outside the layer", () => {
    const { layer, trigger } = scene();
    trigger.disabled = true;
    (document.querySelector("#after") as HTMLButtonElement).disabled = true;
    restoreFocus(trigger, layer);
    expect(document.activeElement?.id).toBe("before");
  });

  it("falls back from a target made inert", () => {
    const { layer, trigger } = scene();
    trigger.setAttribute("inert", "");
    restoreFocus(trigger, layer);
    expect(document.activeElement?.id).toBe("after");
  });

  it("leaves a focus that already left the layer where it is", () => {
    const { layer, trigger } = scene();
    trigger.disabled = true;
    focusElement(document.querySelector("#before"));
    restoreFocus(trigger, layer);
    expect(document.activeElement?.id).toBe("before");
  });

  it("stands in for no ancestor of the layer", () => {
    const { layer } = scene();
    restoreFocus(document.body, layer);
    expect(document.activeElement?.id).toBe("inner");
  });

  it("leaves a detached target alone", () => {
    const { layer, trigger } = scene();
    trigger.remove();
    restoreFocus(trigger, layer);
    expect(document.activeElement?.id).toBe("inner");
  });
});
