import { describe, expect, it, vi } from "vitest";
import { createReactivityRoot } from "./reactivity";

describe("createReactivityRoot", () => {
  it("notifies subscribers once per batch", () => {
    const { adapter, subscribe } = createReactivityRoot();
    const listener = vi.fn();
    subscribe(listener);
    const count = adapter.bindable<number>(() => ({ defaultValue: 0 }));

    adapter.batch(() => {
      count.set(1);
      count.set(2);
    });

    expect(count.get()).toBe(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies immediately outside a batch", () => {
    const { adapter, subscribe } = createReactivityRoot();
    const listener = vi.fn();
    subscribe(listener);
    const count = adapter.bindable<number>(() => ({ defaultValue: 0 }));

    count.set(1);
    count.set(2);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("skips notification when the value did not change", () => {
    const { adapter, subscribe } = createReactivityRoot();
    const listener = vi.fn();
    subscribe(listener);
    const value = adapter.bindable<readonly string[]>(() => ({
      defaultValue: ["a"],
      isEqual: (a, b) => a.join() === b.join(),
    }));

    value.set(["a"]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("recomputes a memo only when its deps change", () => {
    const { adapter } = createReactivityRoot();
    const compute = vi.fn(() => ({}));
    let dep = 1;
    const memo = adapter.memo(compute, () => [dep]);

    const first = memo();
    expect(memo()).toBe(first);
    expect(compute).toHaveBeenCalledOnce();

    dep = 2;
    expect(memo()).not.toBe(first);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("runs a tracker on change, never on registration", () => {
    const { adapter } = createReactivityRoot();
    const count = adapter.bindable<number>(() => ({ defaultValue: 0 }));
    const effect = vi.fn();

    adapter.track(() => [count.get()], effect);
    expect(effect).not.toHaveBeenCalled();

    count.set(1);
    expect(effect).toHaveBeenCalledOnce();

    count.set(1);
    expect(effect).toHaveBeenCalledOnce();
  });

  it("lets a tracker write, and settles before notifying", () => {
    const { adapter, subscribe } = createReactivityRoot();
    const listener = vi.fn();
    subscribe(listener);
    const source = adapter.bindable<number>(() => ({ defaultValue: 0 }));
    const mirror = adapter.bindable<number>(() => ({ defaultValue: 0 }));
    adapter.track(
      () => [source.get()],
      () => mirror.set(source.get() * 2),
    );

    source.set(3);

    expect(mirror.get()).toBe(6);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("throws rather than spinning when trackers never settle", () => {
    const { adapter } = createReactivityRoot();
    const count = adapter.bindable<number>(() => ({ defaultValue: 0 }));
    adapter.track(
      () => [count.get()],
      () => count.set((prev) => prev + 1),
    );

    expect(() => count.set(1)).toThrow(/did not settle/);
  });

  it("runs cleanups in reverse on dispose", () => {
    const { adapter, dispose } = createReactivityRoot();
    const order: string[] = [];
    adapter.onCleanup(() => order.push("first"));
    adapter.onCleanup(() => order.push("second"));

    dispose();

    expect(order).toEqual(["second", "first"]);
  });

  it("stops notifying after unsubscribe", () => {
    const { adapter, subscribe } = createReactivityRoot();
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const count = adapter.bindable<number>(() => ({ defaultValue: 0 }));

    unsubscribe();
    count.set(1);

    expect(listener).not.toHaveBeenCalled();
  });
});
