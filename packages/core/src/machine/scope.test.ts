import { afterEach, describe, expect, it, vi } from "vitest";
import { createScope, type RootNode } from "./scope";

function fakeDocument(active: Element | null = null): Document {
  const elements = new Map<string, Element>();
  const doc = {
    ownerDocument: null,
    activeElement: active,
    defaultView: { getComputedStyle: () => ({ direction: "rtl" }) },
    getElementById: (id: string) => elements.get(id) ?? null,
    register(id: string, element: Element) {
      elements.set(id, element);
    },
  };
  return doc as unknown as Document;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScope", () => {
  it("resolves elements through the provided root node", () => {
    const doc = fakeDocument();
    const element = { tagName: "DIV" } as unknown as HTMLElement;
    (doc as unknown as { register(id: string, el: Element): void }).register(
      "toggle:x1:root",
      element,
    );

    const scope = createScope({ id: "x1", getRootNode: () => doc });

    expect(scope.getById("toggle:x1:root")).toBe(element);
    expect(scope.getById("missing")).toBeNull();
  });

  it("walks a shadow root back to its owning document", () => {
    const doc = fakeDocument();
    const shadow = { ownerDocument: doc, activeElement: null } as unknown as RootNode;

    const scope = createScope({ id: "x1", getRootNode: () => shadow });

    expect(scope.getRootNode()).toBe(shadow);
    expect(scope.getDoc()).toBe(doc);
  });

  it("falls back to the ambient document only when asked, never at creation", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);

    const scope = createScope({ id: "x1" });

    expect(scope.getDoc()).toBe(doc);
    expect(scope.getWin().getComputedStyle({} as Element)).toEqual({ direction: "rtl" });
  });

  it("compares against the active element of its own root", () => {
    const element = { tagName: "BUTTON" } as unknown as HTMLElement;
    const scope = createScope({ id: "x1", getRootNode: () => fakeDocument(element) });

    expect(scope.getActiveElement()).toBe(element);
    expect(scope.isActiveElement(element)).toBe(true);
    expect(scope.isActiveElement(null)).toBe(false);
  });

  /**
   * The server contract. `document` used to be read as a bare identifier here,
   * which on a server is a `ReferenceError` and not an `undefined` to fall back
   * from — the single global access left in the core, and the reason five
   * components could not be rendered by Next or Remix.
   */
  describe("with no document at all", () => {
    it("answers nothing rather than throwing, for everything a render reaches", () => {
      expect(globalThis.document).toBeUndefined();
      const scope = createScope({ id: "x1" });

      // A machine reads these from its `watch` dependencies, and an adapter
      // records those while it renders. They have to have an answer.
      expect(scope.getRootNode()).toBeNull();
      expect(scope.getById("toggle:x1:root")).toBeNull();
      expect(scope.getActiveElement()).toBeNull();
      expect(scope.isActiveElement(null)).toBe(false);
      expect(scope.isActiveElement({} as Element)).toBe(false);
    });

    it("names itself when an effect-time reader is called too early", () => {
      const scope = createScope({ id: "x1" });

      // Not nullable: `getDoc` exists to install listeners and to measure, and
      // it is only reachable after `start()`, which no server render performs.
      // Sixteen call sites would carry an unreachable null branch otherwise.
      // Throwing here is what turns a bare `ReferenceError` blamed on the wrong
      // layer into a sentence naming the mistake.
      expect(() => scope.getDoc()).toThrow(/call it from an effect/);
      expect(() => scope.getWin()).toThrow(/call it from an effect/);
      expect(() => scope.getComputedStyle({} as Element)).toThrow(/call it from an effect/);
    });
  });
});
