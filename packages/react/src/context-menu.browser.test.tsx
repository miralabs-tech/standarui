/**
 * The context menu, which is a composition rather than a component: `menu` with a
 * `contextTrigger` and no button at all (CDC §4.5, the shape the `action-sheet`
 * alias already has). There is no `context-menu` machine, no `context-menu`
 * adapter and no `context-menu` export — so the thing that can regress is the
 * *composition*, and that is what this file holds.
 *
 * It lives beside `ssr.test.tsx` rather than under `components/`, deliberately: a
 * folder there is a component, and the repo says so out loud —
 * `scripts/component-coverage.test.ts` reads the folder list and demands an SSR
 * guard entry for every name in it. A preset that invented a folder would be
 * claiming to be a component in the one place the repository counts them.
 *
 * The four criteria of the reference-app parity audit (§05) are what is asserted: several
 * independent regions with different items, the hand-off from one right click to
 * the next in a single gesture, the click that closes never activating what is
 * under it (M5), and a surface with no trigger that still has a name.
 */

import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "./components/dialog/dialog";
import {
  MenuBackdrop,
  MenuContent,
  MenuContextTrigger,
  MenuItem,
  MenuItemText,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
} from "./components/menu/menu";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  realKey,
  settle,
  twoFrames,
  unmountAll,
  waitFor,
} from "./render-harness";

afterEach(() => unmountAll());

interface RegionProps {
  readonly label: string;
  readonly items: readonly string[];
  readonly button?: string;
}

/**
 * The canonical preset: `label` because there is no trigger to be named by,
 * `presentation="popup"` because touch context menus are a popup with a
 * scrim and not an action sheet, and a backdrop whose mere presence is the opt-in
 * to that scrim.
 */
function Region(props: RegionProps): React.ReactNode {
  return (
    <MenuRoot label={props.label} presentation="popup">
      <MenuContextTrigger>
        <div style={{ minHeight: "60px" }}>
          <button type="button">{props.button ?? props.label}</button>
        </div>
      </MenuContextTrigger>
      <MenuPortal>
        <MenuBackdrop />
        <MenuPositioner>
          <MenuContent>
            {props.items.map((value) => (
              <MenuItem key={value} value={value}>
                <MenuItemText>{value}</MenuItemText>
              </MenuItem>
            ))}
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

function regions(): HTMLElement[] {
  return queryParts(document.body, "context-trigger");
}

function region(index = 0): HTMLElement {
  const node = regions()[index];
  if (node === undefined) throw new Error(`no region at ${index}`);
  return node;
}

function rightClick(node: HTMLElement, x: number, y: number): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  fire(() => node.dispatchEvent(event));
  return event;
}

function pointer(type: string, node: HTMLElement, x: number, y: number): void {
  fire(() =>
    node.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
      }),
    ),
  );
}

// `data-state` and not `aria-expanded`: the region is a bare container the
// consumer brings, which maps to `generic`, and `aria-expanded` is not allowed
// there — axe grades it `aria-allowed-attr`. `data-state` is the styling contract
// and it carries the same fact.
function isOpen(node: HTMLElement): boolean {
  return node.getAttribute("data-state") === "open";
}

describe("context menu — the gesture", () => {
  it("anchors a right click to the point rather than to the region", async () => {
    mount(<Region label="Canvas actions" items={["rename", "duplicate"]} />);
    const event = rightClick(region(), 260, 180);
    await settle();

    // The browser's own menu is refused, which is the only reason ours can be seen.
    expect(event.defaultPrevented).toBe(true);
    expect(isOpen(region())).toBe(true);

    // Measured against a zero-sized rect where the pointer landed, and not against
    // the region: the anchor the positioner published has no size at all, which no
    // element anchor ever produces. The signature of a point anchor.
    const positioner = queryPart(document.body, "positioner");
    expect(positioner?.style.getPropertyValue("--sui-anchor-width")).toBe("0px");
    expect(positioner?.style.getPropertyValue("--sui-anchor-height")).toBe("0px");
    expect(positioner?.style.transform).toMatch(/^translate3d\(/);
  });

  it("names a surface that has no trigger to be named by", async () => {
    mount(<Region label="Canvas actions" items={["rename"]} />);
    rightClick(region(), 40, 40);
    await settle();

    const content = queryPart(document.body, "content");
    expect(content?.getAttribute("role")).toBe("menu");
    expect(content?.getAttribute("aria-label")).toBe("Canvas actions");
    // Never both, and never a dangling one: with no trigger rendered there is no
    // id to point at, and an IDREF that resolves to nothing is graded `incomplete`
    // by axe rather than reported — unnamed is the better failure, and `label` is
    // what makes it a non-issue.
    expect(content?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("opens onto the first item, the way a keyboard opening does", async () => {
    mount(<Region label="Canvas actions" items={["rename", "duplicate"]} />);
    rightClick(region(), 40, 40);
    await settle();

    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null;
      expect(active?.getAttribute("data-value")).toBe("rename");
    });
  });

  it("carries the popup presentation on both densities, scrim or no scrim", async () => {
    mount(<Region label="Canvas actions" items={["rename"]} />);
    rightClick(region(), 40, 40);
    await settle();

    // The preset pins `popup` rather than letting `auto` resolve a sheet on touch:
    // touch platforms draw context menus as a popup at the press with a dimming
    // overlay, and motion.md §2.3 gives it a spring from that point. The sheet
    // remains available by passing `presentation` explicitly.
    expect(queryPart(document.body, "content")?.getAttribute("data-presentation")).toBe("popup");
  });
});

describe("context menu — several regions on one page (parity M5)", () => {
  it("hands off from one right click to the next in a single gesture", async () => {
    mount(
      <>
        <Region label="Explorer" items={["new-folder"]} />
        <Region label="Status bar" items={["hide"]} />
      </>,
    );

    rightClick(region(0), 30, 30);
    await settle();
    expect(isOpen(region(0))).toBe(true);
    expect(queryPart(document.body, "content")?.getAttribute("aria-label")).toBe("Explorer");

    // A real right click on the second region: the pointer goes down outside the
    // first surface's layer — which dismisses it — and the `contextmenu` that
    // follows is not the click `preventOutsideActivation` swallows, so it reaches
    // the second region's own listener. One gesture, two surfaces.
    pointer("pointerdown", region(1), 200, 200);
    pointer("pointerup", region(1), 200, 200);
    rightClick(region(1), 200, 200);
    await settle();

    await waitFor(() => {
      expect(isOpen(region(0))).toBe(false);
    });
    expect(isOpen(region(1))).toBe(true);
    // Read as a set rather than as "the first content in the document": the
    // dismissed surface is unmounted by a presence, and asserting on document
    // order would be racing it for no reason.
    const named = queryParts(document.body, "content").map((node) =>
      node.getAttribute("aria-label"),
    );
    expect(named).toContain("Status bar");
  });

  it("never activates what the dismissing click landed on", async () => {
    const underneath = vi.fn();
    const handle = mount(
      <>
        <Region label="Explorer" items={["new-folder"]} />
        <button type="button" onClick={underneath}>
          Do the dangerous thing
        </button>
      </>,
    );

    rightClick(region(), 30, 30);
    await settle();

    const target = [...handle.container.querySelectorAll("button")].at(-1);
    if (target === undefined) throw new Error("no button underneath");

    // The full gesture the browser produces, in order. `preventOutsideActivation`
    // suppresses the pointer default *and* eats the click that the browser
    // synthesises anyway — the native behaviour, and the one the reference app's own context
    // menu had (audit M5).
    pointer("pointerdown", target, 300, 300);
    pointer("pointerup", target, 300, 300);
    fire(() => target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    await settle();

    expect(underneath).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(isOpen(region())).toBe(false);
    });
  });
});

describe("context menu — the pad inside a modal dialog", () => {
  let input: InputSystem | null = null;

  function Capture(): React.ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  afterEach(() => {
    input = null;
  });

  /** R17: the trigger's scope opens at mount, under the trap of the dialog around it. */
  it("still opens on the pad's Y inside a modal dialog that traps", async () => {
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Canvas</DialogTitle>
                <Region label="Canvas actions" items={["rename", "duplicate"]} button="Focus me" />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the button before the pad is pressed.
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const focusable = region().querySelector("button");
    if (focusable === null) throw new Error("no focusable in the region");
    fire(() => focusable.focus());
    await settle();
    expect(document.activeElement).toBe(focusable);

    fire(() => input?.emit({ intent: "contextMenu", source: "gamepad" }));
    await settle();

    expect(isOpen(region())).toBe(true);
  });
});

describe("context menu — the keyboard and the pad", () => {
  it("opens on Shift+F10 through the whole intent path", async () => {
    mount(
      <NavProvider>
        <Region label="Canvas actions" items={["rename", "duplicate"]} button="Focus me" />
      </NavProvider>,
    );
    // The provider builds its system in an effect, and the machine's scope is
    // re-opened on it by `useIntentScopeHost` — so the first commit is not enough.
    await settle();

    const focusable = region().querySelector("button");
    if (focusable === null) throw new Error("no focusable in the region");
    fire(() => focusable.focus());

    // Not the bus dispatched by hand: a real keydown, the keymap, the scope stack,
    // and the machine-level scope `trackContextTrigger` pushes while the surface is
    // *closed*. A region whose only openers were a right click and a long press
    // would fail WCAG 2.1.1 on the one gesture the part exists for.
    fire(() =>
      focusable.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await settle();

    expect(isOpen(region())).toBe(true);
  });

  it("gives the focus back to the region when Escape closes it", async () => {
    mount(
      <NavProvider>
        <Region label="Canvas actions" items={["rename", "duplicate"]} button="Focus me" />
      </NavProvider>,
    );
    await settle();

    const focusable = region().querySelector("button");
    if (focusable === null) throw new Error("no focusable in the region");
    fire(() => focusable.focus());
    fire(() =>
      focusable.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await settle();
    expect(isOpen(region())).toBe(true);

    fire(() =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    await settle();

    // Captured on the way *in* — the element that held the focus when the surface
    // opened — and handed back by the focus effect's own disposer.
    await waitFor(() => {
      expect(document.activeElement).toBe(focusable);
    });
  });
});

/**
 * Tab closes the menu and steps on from the region, modal or not: the region is
 * only programmatically focusable, so forward is the first stop after it in
 * document order — its own button first — and backward is the region itself.
 * A modal menu holds that step until the page it made inert is released.
 */
describe("context menu — Tab out of it", () => {
  function Scene(props: { readonly modal: boolean; readonly inside: boolean }): React.ReactNode {
    return (
      <>
        <button type="button">Before</button>
        <MenuRoot label="Canvas actions" modal={props.modal}>
          <MenuContextTrigger>
            <div style={{ minHeight: "60px" }}>
              {props.inside ? <button type="button">Inside</button> : "Canvas"}
            </div>
          </MenuContextTrigger>
          <MenuPortal>
            <MenuPositioner>
              <MenuContent>
                <MenuItem value="rename">
                  <MenuItemText>rename</MenuItemText>
                </MenuItem>
              </MenuContent>
            </MenuPositioner>
          </MenuPortal>
        </MenuRoot>
        <button type="button">After</button>
      </>
    );
  }

  async function openAndPress(
    keys: string,
    modal: boolean,
    inside: boolean,
  ): Promise<Element | null> {
    mount(<Scene modal={modal} inside={inside} />);
    await settle();
    rightClick(region(), 40, 20);
    await settle();
    await twoFrames();
    expect(isOpen(region())).toBe(true);
    await realKey("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-value")).toBe("rename");
    await realKey(keys);
    await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
    await twoFrames();
    return document.activeElement;
  }

  for (const modal of [false, true]) {
    const kind = modal ? "modal" : "not modal";

    it(`steps a real Tab on to the region's first stop (${kind})`, async () => {
      expect((await openAndPress("{Tab}", modal, true))?.textContent).toBe("Inside");
    });

    it(`steps a real Tab past a region with no stop of its own (${kind})`, async () => {
      expect((await openAndPress("{Tab}", modal, false))?.textContent).toBe("After");
    });

    it(`brings a real Shift+Tab back to the region (${kind})`, async () => {
      expect(await openAndPress("{Shift>}{Tab}{/Shift}", modal, true)).toBe(region());
    });
  }
});

describe("context menu — the accessibility tree", () => {
  it("passes axe on the surface a gesture opens", async () => {
    mount(<Region label="Canvas actions" items={["rename", "duplicate"]} />);
    await settle();

    rightClick(region(), 40, 40);
    await settle();

    // **The region is in the run now**, and that is the point of this assertion.
    // It used to be excluded because `getContextTriggerProps` published
    // `aria-expanded` on a container with no role — which maps to `generic`, where
    // `aria-expanded` is not allowed (`aria-haspopup` is global, and stays). axe
    // graded it `aria-allowed-attr`, and the exclusion meant this suite was green
    // over the one element the whole preset is built from. The attribute is gone
    // from the core; the state is still readable through `data-state`.
    const positioner = queryPart(document.body, "positioner");
    if (positioner === null) throw new Error("no positioner");
    await expectNoAxeViolations(positioner);
    await expectNoAxeViolations(region());
  });

  it("declares the popup it owns, and says nothing ARIA forbids it", async () => {
    mount(<Region label="Canvas actions" items={["rename"]} />);
    await settle();

    expect(region().getAttribute("aria-haspopup")).toBe("menu");
    expect(region().getAttribute("data-state")).toBe("closed");
    expect(region().hasAttribute("aria-expanded")).toBe(false);

    rightClick(region(), 40, 40);
    await settle();

    expect(region().getAttribute("data-state")).toBe("open");
    expect(region().hasAttribute("aria-expanded")).toBe(false);
  });

  // The POINTER path, which the Shift+F10 test above does not reach and which was
  // the broken one: a right mousedown blurs whatever was focused before the machine
  // ever sees the gesture, so `captureFinalFocus` reads BODY and stores `null`, and
  // `getAnchorEl` — this region — is the only fallback left. Without a tabindex
  // `focusElement` was a silent no-op on it and the focus fell to BODY.
  it("takes the focus back when a pointer-opened surface goes", async () => {
    mount(<Region label="Canvas actions" items={["rename", "duplicate"]} />);
    await settle();

    rightClick(region(), 40, 40);
    await settle();
    expect(isOpen(region())).toBe(true);

    fire(() =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    await settle();

    await waitFor(() => {
      expect(document.activeElement).toBe(region());
    });
    // Programmatically focusable and still out of the tab order — the half that
    // makes the fix safe.
    expect(region().getAttribute("tabindex")).toBe("-1");
  });
});

/**
 * The two the composition cannot reach today, both named here rather than left
 * out — a preset's whole risk is that nothing is watching the surface it borrows.
 *
 * The first needs `menu.machine.ts`: a second right click while the surface is
 * open replaces `refs.anchorPoint` and nothing re-runs the position pass, because
 * `context.open` never changed and `trackPosition` only re-schedules on a resize
 * or a scroll. The fix is a two-branch transition on `TRIGGER.CONTEXTMENU` and
 * `TRIGGER.LONGPRESS`, `{ guard: "isOpen", target: "open", reenter: true }` first,
 * exactly as `PRESENTATION.SYNC` already does.
 *
 * The second needs `menu.connect.ts`: `getContentProps` has no `onContextMenu`, so
 * a right click on an item opens the browser's own menu on top of ours. No native
 * app does that.
 */
describe.todo("context menu — the two deltas this preset asks of `menu`");
