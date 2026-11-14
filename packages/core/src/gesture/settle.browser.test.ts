import { afterEach, describe, expect, it } from "vitest";
import { settleTo } from "./settle";

const cleanups: VoidFunction[] = [];

function surface(style = ""): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("style", `position: fixed; inset: 0 auto auto 0; ${style}`);
  document.body.append(node);
  cleanups.push(() => node.remove());
  return node;
}

function timingOf(animation: Animation | null): EffectTiming {
  const timing = animation?.effect?.getTiming();
  if (timing === undefined) throw new Error("the settle produced no effect");
  return timing;
}

function framesOf(animation: Animation | null): ComputedKeyframe[] {
  const effect = animation?.effect;
  // `getKeyframes` is a `KeyframeEffect` method, not an `AnimationEffect` one.
  if (!(effect instanceof KeyframeEffect)) throw new Error("the settle produced no keyframes");
  return effect.getKeyframes();
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
  for (const animation of document.getAnimations()) animation.cancel();
});

describe("settleTo — the recipe it picks", () => {
  it("reads the duration and the easing from custom properties on the node", () => {
    const node = surface("--sui-duration-200: 111ms; --sui-ease-in: linear");
    const animation = settleTo(node, { from: "0 120px", to: "0 0px", velocity: 2 });

    expect(timingOf(animation).duration).toBe(111);
    expect(timingOf(animation).easing).toBe("linear");
  });

  it("takes the slow recipe's pair when the finger was barely moving", () => {
    const node = surface("--sui-spring-smooth-duration: 480ms; --sui-spring-smooth: ease-in-out");
    const animation = settleTo(node, { from: "0 120px", to: "0 0px", velocity: 0.05 });

    expect(timingOf(animation).duration).toBe(480);
    expect(timingOf(animation).easing).toBe("ease-in-out");
  });

  it("takes the medium recipe between the two thresholds", () => {
    const node = surface("--sui-duration-300: 290ms");
    const animation = settleTo(node, { from: "0 120px", to: "0 0px", velocity: 0.3 });

    expect(timingOf(animation).duration).toBe(290);
  });

  it("falls back to the prescribed numbers when no sheet defines the tokens", () => {
    const node = surface();

    expect(timingOf(settleTo(node, { from: "0 1px", to: "0 0px", velocity: 0 })).duration).toBe(
      520,
    );
    expect(timingOf(settleTo(node, { from: "0 1px", to: "0 0px", velocity: 0.3 })).duration).toBe(
      300,
    );
    expect(timingOf(settleTo(node, { from: "0 1px", to: "0 0px", velocity: 2 })).duration).toBe(
      180,
    );
  });

  it("reads a duration written in seconds", () => {
    const node = surface("--sui-duration-200: 0.25s");
    expect(timingOf(settleTo(node, { from: "0 1px", to: "0 0px", velocity: 2 })).duration).toBe(
      250,
    );
  });

  it("lets a consumer name its own properties", () => {
    const node = surface("--sui-settle-flick-duration: 180ms; --sui-duration-200: 999ms");
    const animation = settleTo(node, {
      from: "0 120px",
      to: "0 0px",
      velocity: 2,
      tokens: { flick: { duration: "--sui-settle-flick-duration", easing: "--sui-ease-in" } },
    });

    expect(timingOf(animation).duration).toBe(180);
  });
});

describe("settleTo — when it declines", () => {
  it("returns null on a duration the cascade has flattened, and animates nothing", () => {
    // What `data-motion="none"` does to every duration token. The surface still has
    // to arrive, and the CSS has already put it there — so there is no animation to
    // run, not a zero-length one to wait on.
    const node = surface("--sui-duration-200: 0ms");
    expect(settleTo(node, { from: "0 120px", to: "0 0px", velocity: 2 })).toBeNull();
    expect(node.getAnimations()).toHaveLength(0);
  });

  it("never consults the media query, so data-motion can win", () => {
    // The whole contract in one assertion: the answer comes from the cascade. A
    // node whose tokens say 400 ms settles in 400 ms no matter what the OS asked,
    // which is what `data-motion="full"` has to be able to buy (motion.md §4.2).
    const node = surface("--sui-duration-200: 400ms");
    expect(timingOf(settleTo(node, { from: "0 1px", to: "0 0px", velocity: 2 })).duration).toBe(
      400,
    );
  });
});

describe("settleTo — what it animates", () => {
  it("moves `translate` by default, from and to the values it was given", () => {
    const node = surface("--sui-duration-200: 200ms");
    // Neither end is a zero, and both are written in full: a keyframe comes back
    // serialised by the engine, which collapses `0px 0px` to `0px` and `0` to
    // `0px`. Pinning either would assert what Chromium does, not what this does.
    const frames = framesOf(settleTo(node, { from: "0px 120px", to: "0px 20px", velocity: 2 }));

    expect(frames).toHaveLength(2);
    expect(frames[0]?.translate).toBe("0px 120px");
    expect(frames[1]?.translate).toBe("0px 20px");
  });

  it("moves a property the consumer names instead", () => {
    const node = surface("--sui-duration-200: 200ms");
    const frames = framesOf(
      settleTo(node, {
        from: "translateX(40px)",
        to: "translateX(0px)",
        velocity: 2,
        property: "transform",
      }),
    );

    expect(frames[0]?.transform).toBe("translateX(40px)");
    expect(frames[1]?.transform).toBe("translateX(0px)");
  });

  it("does not fill, so the cascade holds the resting position once it lands", async () => {
    const node = surface("--sui-duration-200: 20ms; translate: 0 0px");
    const animation = settleTo(node, { from: "0 120px", to: "0 0px", velocity: 2 });

    expect(timingOf(animation).fill).toBe("none");
    await animation?.finished;
    expect(getComputedStyle(node).translate).toBe("0px");
  });

  it("hands back the animation so a new gesture can cancel the one in flight", () => {
    const node = surface("--sui-duration-200: 400ms");
    const first = settleTo(node, { from: "0 120px", to: "0 0px", velocity: 2 });
    expect(node.getAnimations()).toHaveLength(1);

    first?.cancel();
    expect(node.getAnimations()).toHaveLength(0);
  });
});
