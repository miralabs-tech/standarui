import { describe, expect, it, vi } from "vitest";
import { type Cell, createBindable } from "./reactivity";

function spyCell<V>(initial: V): Cell<V> & { readonly writes: V[] } {
  let value = initial;
  const writes: V[] = [];
  return {
    writes,
    get: (): V => value,
    set: (next: V): void => {
      value = next;
      writes.push(next);
    },
  };
}

describe("createBindable", () => {
  it("writes its cell and reports when uncontrolled", () => {
    const cell = spyCell(0);
    const onChange = vi.fn();
    const bindable = createBindable(
      () => ({ defaultValue: 0, onChange }),
      () => cell,
    );

    bindable.set(1);

    expect(bindable.get()).toBe(1);
    expect(cell.writes).toEqual([1]);
    expect(onChange).toHaveBeenCalledWith(1, 0);
  });

  it("still notifies its cell when a controlled write is absorbed by the parent", () => {
    const cell = spyCell("a");
    const onChange = vi.fn();
    const bindable = createBindable(
      () => ({ value: "a", onChange }),
      () => cell,
    );

    bindable.set("b");

    // The parent kept "a" — or answered with a value equal to the one it held,
    // which a framework drops without rendering. The adapter only learns of the
    // write through its cell, so the cell is touched on its own value.
    expect(onChange).toHaveBeenCalledWith("b", "a");
    expect(bindable.get()).toBe("a");
    expect(cell.writes).toEqual(["a"]);
  });

  it("touches nothing when the write equals the value it holds", () => {
    const cell = spyCell("a");
    const onChange = vi.fn();
    const bindable = createBindable(
      () => ({ value: "a", onChange }),
      () => cell,
    );

    bindable.set("a");

    expect(onChange).not.toHaveBeenCalled();
    expect(cell.writes).toEqual([]);
  });
});
