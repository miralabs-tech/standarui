import { createVirtualIndex, getScrollTarget, type VirtualIndex } from "@standarui/core";
import {
  type FocusEvent as ReactFocusEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

export type VirtualizerAlign = "start" | "center" | "end" | "nearest";

export interface VirtualizerScrollToOptions {
  readonly align?: VirtualizerAlign | undefined;
}

export interface UseVirtualizerOptions {
  readonly count: number;
  readonly estimateSize: (index: number) => number;
  readonly getScrollElement: () => HTMLElement | null;
  readonly orientation?: "vertical" | "horizontal" | undefined;
  readonly overscan?: number | undefined;
  readonly paddingStart?: number | undefined;
  readonly gap?: number | undefined;
  readonly getItemKey?: ((index: number) => string | number) | undefined;
  readonly initialSize?: number | undefined;
}

export interface VirtualizerItem {
  readonly index: number;
  readonly key: string | number;
  readonly start: number;
  readonly size: number;
}

export interface VirtualizerContainerProps {
  readonly ref: (node: HTMLElement | null) => VoidFunction;
  readonly "data-sui-virtual": "";
  readonly "data-orientation": "vertical" | "horizontal";
}

export interface VirtualizerItemProps {
  readonly ref: (node: HTMLElement | null) => VoidFunction;
  readonly onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  readonly "data-index": number;
  readonly "data-sui-virtual-item": "";
}

export interface Virtualizer {
  readonly items: readonly VirtualizerItem[];
  readonly totalSize: number;
  scrollToIndex(index: number, options?: VirtualizerScrollToOptions): void;
  getContainerProps(): VirtualizerContainerProps;
  getItemProps(index: number): VirtualizerItemProps;
}

export interface VirtualizerCssVars {
  // --- written ---
  /** Total size of the rows along the scroll axis, written on the container. */
  "--sui-virtual-size": "<length>";
  /** Where a row starts along the scroll axis, written on each rendered row. */
  "--sui-virtual-start": "<length>";
}

const SIZE = "--sui-virtual-size";
const START = "--sui-virtual-start";
const ITEM = "[data-sui-virtual-item]";
const DEFAULT_OVERSCAN = 3;

type Key = string | number;

interface Binding {
  readonly ref: (node: HTMLElement | null) => VoidFunction;
  readonly onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
}

const identity = (row: number): number => row;

interface Committed {
  start: number;
  end: number;
}

interface Target {
  index: number;
  align: VirtualizerAlign;
  expected: number;
}

function write(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

function createController(
  latest: { current: UseVirtualizerOptions },
  bump: () => void,
): Controller {
  let index: VirtualIndex | null = null;
  let configured = "";
  let oriented = "";
  let counted = 0;
  const measured = new Map<Key, number>();
  const nodes = new Map<Key, HTMLElement>();
  const keys = new WeakMap<Element, Key>();
  const bindings = new Map<Key, Binding>();
  const committed: Committed = { start: 0, end: -1 };
  let element: HTMLElement | null = null;
  let container: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  let detachElement: VoidFunction | null = null;
  let frame = 0;
  let scrollOffset = 0;
  let viewportSize = 0;
  let focusedKey: Key | null = null;
  let focusedRow = -1;
  let focusTarget: EventTarget | null = null;
  let blurFrame = 0;
  let blurWindow: Window | null = null;
  let target: Target | null = null;

  const horizontal = (): boolean => latest.current.orientation === "horizontal";

  const keyOf = (row: number): Key => (latest.current.getItemKey ?? identity)(row);

  function rowOf(node: Element): number | null {
    const row = Number(node.getAttribute("data-index"));
    return Number.isInteger(row) ? row : null;
  }

  function readOffset(): number {
    if (element === null) return scrollOffset;
    return horizontal() ? Math.abs(element.scrollLeft) : element.scrollTop;
  }

  function writeOffset(value: number): void {
    if (element === null) return;
    if (!horizontal()) {
      element.scrollTop = value;
      return;
    }
    const rtl = element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
    element.scrollLeft = rtl ? -value : value;
  }

  function readViewport(): number {
    if (element === null) return viewportSize;
    return horizontal() ? element.clientWidth : element.clientHeight;
  }

  function replay(virtual: VirtualIndex, count: number): void {
    if (latest.current.getItemKey === undefined) {
      for (const [key, size] of measured) {
        if (typeof key === "number" && key < count) virtual.setSize(key, size);
      }
      return;
    }
    if (!Number.isFinite(count)) return;
    for (let row = 0; row < count; row++) {
      const size = measured.get(keyOf(row));
      if (size !== undefined) virtual.setSize(row, size);
    }
  }

  // A key that left the list keeps its size so that it lands where it was if it
  // comes back; past twice the count, only the keys present now are kept.
  function prune(): void {
    const { count, getItemKey } = latest.current;
    if (getItemKey === undefined || !Number.isFinite(count) || measured.size <= 2 * count) return;
    const live = new Map<Key, number>();
    for (let row = 0; row < count; row++) {
      const key = keyOf(row);
      const size = measured.get(key);
      if (size !== undefined) live.set(key, size);
    }
    measured.clear();
    for (const [key, size] of live) measured.set(key, size);
  }

  function ensure(): VirtualIndex {
    const { count, paddingStart = 0, gap = 0 } = latest.current;
    const orientation = horizontal() ? "horizontal" : "vertical";
    const key = `${paddingStart}|${gap}|${orientation}`;
    if (index === null || configured !== key) {
      if (oriented !== orientation) measured.clear();
      oriented = orientation;
      index = createVirtualIndex({
        count,
        estimateSize: (row) => latest.current.estimateSize(row),
        paddingStart,
        gap,
      });
      configured = key;
      replay(index, count);
    }
    if (count < counted && latest.current.getItemKey === undefined) {
      for (const key of measured.keys()) {
        if (typeof key === "number" && key >= count) measured.delete(key);
      }
    }
    counted = count;
    index.setCount(count);
    return index;
  }

  function range(): ReturnType<VirtualIndex["range"]> {
    return ensure().range(viewportSize, scrollOffset, latest.current.overscan ?? DEFAULT_OVERSCAN);
  }

  function compare(): void {
    const next = range();
    if (next.startIndex !== committed.start || next.endIndex !== committed.end) bump();
  }

  function sync(): void {
    const virtual = ensure();
    for (const [key, node] of nodes) {
      const row = rowOf(node);
      const size = measured.get(key);
      if (row !== null && size !== undefined) virtual.setSize(row, size);
    }
    if (container !== null) write(container, SIZE, `${virtual.totalSize()}px`);
    for (const node of nodes.values()) {
      const row = rowOf(node);
      if (row !== null) write(node, START, `${virtual.offsetOf(row)}px`);
    }
  }

  function retarget(): void {
    if (target === null) return;
    const virtual = ensure();
    const to = getScrollTarget(virtual, latest.current.count, target.index, {
      viewportSize,
      scrollOffset: readOffset(),
      align: target.align,
    });
    if (to === null) {
      target = null;
      return;
    }
    const max = Math.max(0, virtual.totalSize() - viewportSize);
    const wanted = Math.max(0, Math.min(to, max));
    if (Math.abs(wanted - readOffset()) <= 1) return;
    writeOffset(wanted);
    scrollOffset = readOffset();
    target.expected = scrollOffset;
  }

  function measure(rows: readonly (readonly [Key, number, number])[], resized: boolean): void {
    const virtual = ensure();
    const offset = readOffset();
    if (target !== null && Math.abs(offset - target.expected) > 1.5) target = null;
    const inside = rows.filter(([, row]) => row < latest.current.count);
    for (const [key, , size] of inside) measured.set(key, size);
    prune();
    const changes = inside.filter(([, row, size]) => virtual.sizeOf(row) !== size);
    let delta = 0;
    for (const [, row, size] of changes) {
      if (virtual.offsetOf(row) < offset) delta += size - virtual.sizeOf(row);
    }
    for (const [, row, size] of changes) virtual.setSize(row, size);
    if (resized) viewportSize = readViewport();
    sync();
    if (delta !== 0) writeOffset(offset + delta);
    scrollOffset = readOffset();
    if (target !== null) target.expected = scrollOffset;
    if (target !== null && changes.length > 0) retarget();
    compare();
  }

  function onResize(entries: readonly ResizeObserverEntry[]): void {
    if (element === null) return;
    const rows: (readonly [Key, number, number])[] = [];
    let resized = false;
    for (const entry of entries) {
      if (entry.target === element) {
        resized = true;
        continue;
      }
      const key = keys.get(entry.target);
      const row = key === undefined ? null : rowOf(entry.target);
      if (key === undefined || row === null) continue;
      const box = entry.borderBoxSize?.[0];
      const node = entry.target as HTMLElement;
      const size = horizontal()
        ? (box?.inlineSize ?? node.offsetWidth)
        : (box?.blockSize ?? node.offsetHeight);
      rows.push([key, row, size]);
    }
    measure(rows, resized);
  }

  function onScroll(): void {
    if (frame !== 0 || element === null) return;
    const win = element.ownerDocument.defaultView;
    if (win === null) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      scrollOffset = readOffset();
      if (target !== null && Math.abs(scrollOffset - target.expected) > 1.5) target = null;
      compare();
    });
  }

  function setFocused(key: Key | null, row: number): void {
    const before = focusedKey === null ? null : focusedRow;
    const changed = key !== focusedKey;
    focusedKey = key;
    focusedRow = row;
    if (!changed) return;
    const outside = (at: number | null): boolean =>
      at !== null && (at < committed.start || at > committed.end);
    if (outside(before) || outside(key === null ? null : row)) bump();
  }

  function cancelBlur(): void {
    if (blurFrame !== 0) blurWindow?.cancelAnimationFrame(blurFrame);
    blurFrame = 0;
  }

  function attach(next: HTMLElement): VoidFunction {
    const win = next.ownerDocument.defaultView;
    next.addEventListener("scroll", onScroll, { passive: true });
    if (win !== null && "ResizeObserver" in win) {
      observer = new win.ResizeObserver((entries) => onResize(entries));
      observer.observe(next);
      for (const node of nodes.values()) observer.observe(node);
    }
    const active = next.ownerDocument.activeElement;
    const holder = active === null ? null : active.closest(ITEM);
    const heldKey = holder === null ? undefined : keys.get(holder);
    if (holder !== null && heldKey !== undefined) {
      focusedKey = heldKey;
      focusedRow = rowOf(holder) ?? -1;
      focusTarget = active;
    }
    return () => {
      next.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      observer = null;
      if (frame !== 0) win?.cancelAnimationFrame(frame);
      frame = 0;
    };
  }

  function bind(release: boolean): void {
    const next = latest.current.getScrollElement();
    if (next === element) return;
    if (next === null && !release) return;
    detachElement?.();
    detachElement = null;
    element = next;
    if (next === null) return;
    detachElement = attach(next);
    viewportSize = readViewport();
    scrollOffset = readOffset();
    compare();
  }

  const containerRef = (node: HTMLElement | null): VoidFunction => {
    container = node;
    if (node !== null) write(node, SIZE, `${ensure().totalSize()}px`);
    return () => {
      if (container === node) container = null;
    };
  };

  function binding(row: number): Binding {
    const key = keyOf(row);
    let found = bindings.get(key);
    if (found === undefined) {
      found = {
        ref: (node) => {
          if (node === null) return () => {};
          nodes.set(key, node);
          keys.set(node, key);
          observer?.observe(node);
          return () => {
            observer?.unobserve(node);
            if (nodes.get(key) === node) nodes.delete(key);
            keys.delete(node);
          };
        },
        onFocus: (event) => {
          cancelBlur();
          focusTarget = event.target;
          setFocused(key, rowOf(event.currentTarget) ?? -1);
        },
        onBlur: (event) => {
          const doc = event.currentTarget.ownerDocument;
          const win = doc.defaultView;
          if (win === null) return;
          cancelBlur();
          blurWindow = win;
          blurFrame = win.requestAnimationFrame(() => {
            blurFrame = 0;
            if (focusedKey !== key) return;
            if (doc.activeElement !== null && doc.activeElement === focusTarget) return;
            setFocused(null, -1);
          });
        },
      };
      bindings.set(key, found);
    }
    return found;
  }

  function pinned(): number | null {
    if (focusedKey === null) return null;
    const { count, getItemKey } = latest.current;
    if (getItemKey === undefined) {
      if (typeof focusedKey !== "number" || focusedKey >= count) return null;
      focusedRow = focusedKey;
      return focusedKey;
    }
    if (focusedRow >= 0 && focusedRow < count && getItemKey(focusedRow) === focusedKey) {
      return focusedRow;
    }
    for (let row = 0; row < count; row++) {
      if (getItemKey(row) === focusedKey) {
        focusedRow = row;
        return row;
      }
    }
    return null;
  }

  return {
    ensure,
    range,
    bind,
    sync,
    compare,
    containerRef,
    itemProps(row) {
      const { ref, onFocus, onBlur } = binding(row);
      return { ref, onFocus, onBlur, "data-index": row, "data-sui-virtual-item": "" };
    },
    pinned,
    commit(start, end, mounted) {
      committed.start = start;
      committed.end = end;
      if (focusedKey !== null && !mounted.includes(focusedKey)) {
        const active = (element ?? container)?.ownerDocument.activeElement ?? null;
        if (active === null || active.closest(ITEM) === null) {
          focusedKey = null;
          focusedRow = -1;
        }
      }
      if (bindings.size > mounted.length) {
        const live = new Set(mounted);
        for (const key of bindings.keys()) if (!live.has(key)) bindings.delete(key);
      }
    },
    initialize(size) {
      if (element === null) viewportSize = size;
    },
    scrollToIndex(row, options) {
      if (element === null) return;
      const align = options?.align ?? "nearest";
      const virtual = ensure();
      const to = getScrollTarget(virtual, latest.current.count, row, {
        viewportSize,
        scrollOffset: readOffset(),
        align,
      });
      if (to === null) return;
      const max = Math.max(0, virtual.totalSize() - viewportSize);
      writeOffset(Math.max(0, Math.min(to, max)));
      scrollOffset = readOffset();
      target = { index: row, align, expected: scrollOffset };
      compare();
    },
    destroy() {
      detachElement?.();
      detachElement = null;
      element = null;
      cancelBlur();
    },
  };
}

interface Controller {
  ensure(): VirtualIndex;
  range(): ReturnType<VirtualIndex["range"]>;
  bind(release: boolean): void;
  sync(): void;
  compare(): void;
  containerRef(node: HTMLElement | null): VoidFunction;
  itemProps(row: number): VirtualizerItemProps;
  pinned(): number | null;
  commit(start: number, end: number, mounted: readonly Key[]): void;
  initialize(size: number): void;
  scrollToIndex(row: number, options?: VirtualizerScrollToOptions): void;
  destroy(): void;
}

export function useVirtualizer(options: UseVirtualizerOptions): Virtualizer {
  const latest = useRef(options);
  latest.current = options;
  const [, bump] = useReducer((version: number) => version + 1, 0);
  const controller = useRef<Controller | null>(null);
  controller.current ??= createController(latest, bump);
  const current = controller.current;

  const virtual = current.ensure();
  current.initialize(options.initialSize ?? 0);
  const visible = current.range();
  const pinned = current.pinned();
  const getItemKey = options.getItemKey ?? identity;

  const rows: number[] = [];
  if (pinned !== null && pinned < options.count && pinned < visible.startIndex) rows.push(pinned);
  for (let row = visible.startIndex; row <= visible.endIndex; row++) rows.push(row);
  if (pinned !== null && pinned < options.count && pinned > visible.endIndex) rows.push(pinned);

  const items = rows.map(
    (row): VirtualizerItem => ({
      index: row,
      key: getItemKey(row),
      start: virtual.offsetOf(row),
      size: virtual.sizeOf(row),
    }),
  );

  useSafeLayoutEffect(() => {
    current.commit(
      visible.startIndex,
      visible.endIndex,
      items.map((item) => item.key),
    );
    current.bind(false);
    current.sync();
    current.compare();
  });

  useEffect(() => {
    current.bind(true);
  });

  useSafeLayoutEffect(() => () => current.destroy(), [current]);

  const orientation = options.orientation ?? "vertical";
  const getContainerProps = useCallback(
    (): VirtualizerContainerProps => ({
      ref: current.containerRef,
      "data-sui-virtual": "",
      "data-orientation": orientation,
    }),
    [current, orientation],
  );

  return {
    items,
    totalSize: virtual.totalSize(),
    scrollToIndex: current.scrollToIndex,
    getContainerProps,
    getItemProps: current.itemProps,
  };
}
