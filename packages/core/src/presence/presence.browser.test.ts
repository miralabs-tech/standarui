import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresence } from "./presence";

const cleanups: VoidFunction[] = [];

function mount(): HTMLElement {
  const node = document.createElement("div");
  node.style.cssText = "width: 40px; height: 40px; opacity: 1";
  document.body.append(node);
  cleanups.push(() => node.remove());
  return node;
}

function child(parent: HTMLElement): HTMLElement {
  const node = document.createElement("span");
  node.style.cssText = "display: block; width: 20px; height: 20px; opacity: 1";
  parent.append(node);
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Long enough that no runner can outrun it, for the tests that assert *not yet*.
 *
 * Those tests used a 150ms animation and looked at it after 60ms, which is a
 * ninety-millisecond claim about a machine that also runs a browser: webkit lost
 * that race in CI and reported the exit as complete. The duration is not the
 * subject of any of them — what they check is that presence waits at all, so the
 * animation is ended with `finish()` when the test is ready rather than by a
 * clock the test is racing. `timeout` is raised with it, since the ceiling would
 * otherwise fire first and has its own test.
 */
const CEILING = 5_000;

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("createPresence", () => {
  it("unmounts immediately when nothing is animating", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete });

    presence.setPresent(true, node);
    expect(presence.isPresent()).toBe(true);

    presence.setPresent(false, node);
    await wait(50);

    expect(onExitComplete).toHaveBeenCalledOnce();
    expect(presence.isPresent()).toBe(false);
  });

  it("waits for a running animation to finish", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, timeout: CEILING });
    presence.setPresent(true, node);

    const animation = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CEILING });
    presence.setPresent(false, node);

    await wait(60);
    expect(animation.playState).toBe("running");
    expect(onExitComplete).not.toHaveBeenCalled();
    expect(presence.isExiting()).toBe(true);
    expect(presence.isPresent()).toBe(true);

    animation.finish();
    await wait(60);
    expect(onExitComplete).toHaveBeenCalledOnce();
    expect(presence.isPresent()).toBe(false);
  });

  /**
   * The exit is not always written on the surface: a sheet slides its own inner
   * panel. Asking the content node alone reports zero animations and cuts the
   * exit on the next frame — the node would leave mid-slide.
   */
  it("waits for an animation on a descendant, not only on the surface itself", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, timeout: CEILING });
    presence.setPresent(true, node);

    const animation = child(node).animate([{ opacity: 1 }, { opacity: 0 }], { duration: CEILING });
    presence.setPresent(false, node);

    await wait(60);
    expect(animation.playState).toBe("running");
    expect(onExitComplete).not.toHaveBeenCalled();
    expect(presence.isExiting()).toBe(true);

    animation.finish();
    await wait(60);
    expect(onExitComplete).toHaveBeenCalledOnce();
  });

  /**
   * The stowaway. A surface that animates its own box is not looking for company:
   * anything else finite running inside it when it closes — a button releasing
   * its press spring, an inner value crossfading — would otherwise decide when
   * the node leaves, and the surface would linger on a clock that is not its own.
   *
   * This is why the subtree is a fallback and not the first read. It is also why
   * dropping the infinite ones was never the whole fix: a 400ms stranger settles
   * perfectly well, it is just not the exit.
   */
  it("leaves on its own clock, not on a longer animation running inside it", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete });
    presence.setPresent(true, node);

    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100 });
    child(node).animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 400 });
    presence.setPresent(false, node);

    await wait(200);

    expect(onExitComplete).toHaveBeenCalledOnce();
  });

  /**
   * The other half of reading the subtree: a spinner left turning inside the
   * surface has a `finished` that never settles, and awaiting it would make every
   * close take the whole ceiling.
   */
  it("does not let an endless animation hold the node to the timeout ceiling", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, timeout: 5_000 });
    presence.setPresent(true, node);

    child(node).animate([{ opacity: 1 }, { opacity: 0.5 }], {
      duration: 100,
      iterations: Number.POSITIVE_INFINITY,
    });
    presence.setPresent(false, node);
    await wait(60);

    expect(onExitComplete).toHaveBeenCalledOnce();
  });

  it("gives up after the timeout, so a backgrounded tab cannot pin the node", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, timeout: 80 });
    presence.setPresent(true, node);

    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 10_000 });
    presence.setPresent(false, node);
    await wait(160);

    expect(onExitComplete).toHaveBeenCalledOnce();
  });

  it("cancels the exit when it is reopened mid-animation", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, timeout: CEILING });
    presence.setPresent(true, node);

    const animation = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CEILING });
    presence.setPresent(false, node);
    await wait(30);
    expect(animation.playState).toBe("running");

    presence.setPresent(true, node);
    // Ended deliberately, and after the reopen: the claim is that a `finished`
    // the exit was already waiting on settles into nothing once the generation
    // has moved. Letting the clock end it instead only proved it by coincidence.
    animation.finish();
    await wait(120);

    expect(onExitComplete).not.toHaveBeenCalled();
    expect(presence.isPresent()).toBe(true);
    expect(presence.isExiting()).toBe(false);
  });

  it("skips the wait when asked — reduced motion", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete, immediate: true });
    presence.setPresent(true, node);

    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    presence.setPresent(false, node);

    expect(onExitComplete).toHaveBeenCalledOnce();
  });

  it("does nothing when it was never present", () => {
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete });

    presence.setPresent(false, mount());

    expect(onExitComplete).not.toHaveBeenCalled();
  });

  it("stays quiet after destroy", async () => {
    const node = mount();
    const onExitComplete = vi.fn();
    const presence = createPresence({ onExitComplete });
    presence.setPresent(true, node);

    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60 });
    presence.setPresent(false, node);
    presence.destroy();
    await wait(150);

    expect(onExitComplete).not.toHaveBeenCalled();
  });
});
