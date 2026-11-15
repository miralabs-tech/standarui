/**
 * The menu through React, and only what an adapter can get wrong: the portal, the
 * presences, and the tree.
 *
 * The machine is proved in `packages/core/src/components/menu`. What could not
 * live there is a *real* second submenu — the machine holds one child, so which
 * one it holds is a decision the adapter makes as the highlight moves, and a suite
 * with a single submenu would never see it made wrong.
 */

import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { InputSystem } from "../../nav";
import { NavProvider, useInputSystem } from "../../nav";
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
} from "../../render-harness";
import {
  DialogCloseTrigger,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../dialog/dialog";
import {
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "../popover/popover";
import {
  MenuBackdrop,
  MenuContent,
  MenuIndicator,
  MenuItem,
  MenuItemDescription,
  MenuItemGroup,
  MenuItemGroupLabel,
  MenuItemIndicator,
  MenuItemShortcut,
  MenuItemSymbol,
  MenuItemText,
  MenuOptionItem,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  MenuTriggerItem,
} from "./menu";

afterEach(() => unmountAll());

/** A submenu, written the way a consumer writes one: nested inside its own root. */
function Sub(props: { readonly value: string; readonly item: string }): React.ReactNode {
  return (
    <MenuRoot submenuOpenDelay={10}>
      <MenuTriggerItem value={props.value}>
        <MenuItemText>{props.value}</MenuItemText>
      </MenuTriggerItem>
      <MenuPortal>
        <MenuPositioner>
          <MenuContent>
            <MenuItem value={props.item}>
              <MenuItemText>{props.item}</MenuItemText>
            </MenuItem>
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

function Tree(): React.ReactNode {
  return (
    <MenuRoot submenuOpenDelay={10}>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPortal>
        <MenuBackdrop />
        <MenuPositioner>
          <MenuContent cancelLabel="Cancel">
            <MenuItem value="open">
              <MenuItemText>Open</MenuItemText>
            </MenuItem>
            <Sub value="share" item="copy-link" />
            <Sub value="move" item="to-trash" />
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

function hover(node: HTMLElement): void {
  const rect = node.getBoundingClientRect();
  fire(() =>
    node.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "mouse",
        clientX: rect.x + 2,
        clientY: rect.y + 2,
      }),
    ),
  );
}

function press(fallback: HTMLElement, key: string): void {
  fire(() =>
    (document.activeElement ?? fallback).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    ),
  );
}

describe("menu in React", () => {
  it("opens onto a surface its effects can already find", async () => {
    mount(<Tree />);
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();

    const content = queryPart(document.body, "content");
    expect(content?.getAttribute("role")).toBe("menu");
    // The focus is real, always — never a virtual one on the container.
    expect(content?.hasAttribute("aria-activedescendant")).toBe(false);
    await waitFor(() => {
      expect(content?.contains(document.activeElement)).toBe(true);
    });

    const first = queryPart(document.body, "item");
    if (first === null) throw new Error("no item");
    hover(first);
    await settle();
    expect(first.getAttribute("data-highlighted")).toBe("");
  });

  /**
   * The one the adapter owns. Both submenus wire themselves to the same parent on
   * mount, so the slot ends up with whichever mounted last; hovering the *first*
   * trigger item has to take it back, and take it back closed.
   */
  it("aims the parent at the submenu under the highlight, not the last one mounted", async () => {
    mount(<Tree />);
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();

    const items = queryParts(document.body, "trigger-item");
    expect(items.map((node) => node.getAttribute("data-value"))).toEqual(["share", "move"]);

    const share = items[0];
    if (share === undefined) throw new Error("no trigger item");
    hover(share);
    await settle();
    hover(share);

    await waitFor(() => {
      expect(share.getAttribute("data-state")).toBe("open");
      expect(document.body.textContent).toContain("copy-link");
      expect(document.body.textContent).not.toContain("to-trash");
    });
  });

  it("walks into a submenu with the keyboard, focus and all", async () => {
    mount(<Tree />);
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();
    const content = queryPart(document.body, "content");
    if (content === null) throw new Error("no content");

    press(content, "ArrowDown");
    await settle();
    expect(document.activeElement?.getAttribute("data-value")).toBe("open");
    press(content, "ArrowDown");
    await settle();
    expect(document.activeElement?.getAttribute("data-value")).toBe("share");

    press(content, "ArrowRight");
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("copy-link");
    });
  });

  /**
   * Touch: the sheet, its scrim, the Cancel row it is owed — and a submenu that is
   * *drilled in* rather than portalled. Stacking it inside the parent's surface is
   * what keeps the two item lists apart, since the machine reads its own items up
   * to the nearest `content`.
   */
  it("drills a submenu into the sheet instead of portalling it", async () => {
    document.documentElement.dataset.suiDensity = "touch";
    try {
      const handle = mount(<Tree />);
      fire(() => queryPart(document.body, "trigger")?.click());
      await settle();

      const content = queryPart(document.body, "content");
      expect(content?.getAttribute("data-presentation")).toBe("sheet");
      expect(queryPart(document.body, "backdrop")).not.toBeNull();
      expect(queryPart(document.body, "cancel-trigger")?.textContent).toBe("Cancel");

      fire(() => queryParts(document.body, "trigger-item")[0]?.click());
      await settle();

      const surfaces = queryParts(document.body, "content");
      expect(surfaces.length).toBe(2);
      expect(content?.contains(surfaces[1] ?? null)).toBe(true);
      expect(surfaces[1]?.getAttribute("data-level")).toBe("1");
      handle.unmount();
    } finally {
      delete document.documentElement.dataset.suiDensity;
    }
  });

  it("brackets the surface with two scroll bands that the collection cannot see", async () => {
    // The sheet, because that is the presentation with something *after* the items:
    // the Cancel row, which is still inside the scroller.
    mount(
      <MenuRoot presentation="sheet">
        <MenuTrigger>Actions</MenuTrigger>
        <MenuPortal>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent cancelLabel="Cancel">
              <MenuItem value="open">
                <MenuItemText>Open</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>,
    );
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();
    const content = queryPart(document.body, "content");
    if (content === null) throw new Error("no content");

    // Outermost on both sides, and the bottom one *after* the Cancel row: that row
    // is still inside the scroller, so a band drawn before it would let the one
    // control the sheet has slide out from under the fade.
    const children = [...content.children];
    expect(children.at(0)?.getAttribute("data-scroll-edge")).toBe("up");
    expect(children.at(-1)?.getAttribute("data-scroll-edge")).toBe("down");
    expect(children.at(-2)?.getAttribute("data-part")).toContain("menu:cancel-trigger");

    // Decoration, and it has to stay decoration in all three trees: hidden from the
    // accessibility one, outside `ITEM_SELECTOR` so the roving list never lands on
    // it, and out of the tab order. A `role="menu"` owns nothing but menu items, so
    // a band that leaked into any of the three is an axe violation and a dead stop
    // for a d-pad at the same time.
    const bands = content.querySelectorAll<HTMLElement>("[data-scroll-edge]");
    expect(bands.length).toBe(2);
    for (const band of bands) {
      expect(band.getAttribute("aria-hidden")).toBe("true");
      expect(band.hasAttribute("data-part")).toBe(false);
      expect(band.hasAttribute("tabindex")).toBe(false);
    }

    // Nothing to scroll to in a surface this short: the attribute is absent rather
    // than empty, and the bands sit at opacity 0 with no sheet loaded to say so.
    expect(content.hasAttribute("data-scroll")).toBe(false);
  });

  it("takes the whole tree with it on unmount", async () => {
    const handle = mount(<Tree />);
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();
    handle.unmount();
    await settle();
    expect(queryPart(document.body, "content")).toBeNull();
  });
});

/** Queried from the whole document: the surfaces are portalled, and two families share it. */
function part(name: string, root: ParentNode = document): HTMLElement {
  const node = queryPart(root, name);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

/** A pointer opens it: the focus lands on the surface, no item highlighted. */
async function openByPointer(trigger: HTMLElement): Promise<void> {
  fire(() => {
    trigger.focus();
    trigger.click();
  });
  await settle();
  await twoFrames();
}

function MoreMenu(props: {
  readonly onContentKeyDown?: ((event: React.KeyboardEvent) => void) | undefined;
  readonly modal?: boolean | undefined;
}): React.ReactNode {
  return (
    <MenuRoot modal={props.modal}>
      <MenuTrigger>More actions</MenuTrigger>
      <MenuPortal>
        <MenuPositioner>
          <MenuContent onKeyDown={props.onContentKeyDown}>
            <MenuItem value="duplicate">
              <MenuItemText>Duplicate</MenuItemText>
            </MenuItem>
            <MenuItem value="export">
              <MenuItemText>Export</MenuItemText>
            </MenuItem>
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

/** The menu trigger sits where `at` says among the dialog's own stops. */
function EdgeDialog(props: {
  readonly at: "first" | "middle" | "last";
  readonly onContentKeyDown?: ((event: React.KeyboardEvent) => void) | undefined;
}): React.ReactNode {
  return (
    <DialogRoot>
      <DialogTrigger>Project settings</DialogTrigger>
      <DialogPortal>
        <DialogPositioner>
          <DialogContent>
            <DialogTitle>Project settings</DialogTitle>
            {props.at === "first" ? null : <button type="button">Before</button>}
            <MoreMenu onContentKeyDown={props.onContentKeyDown} />
            {props.at === "last" ? null : <button type="button">After</button>}
          </DialogContent>
        </DialogPositioner>
      </DialogPortal>
    </DialogRoot>
  );
}

function label(node: Element | null): string | null {
  return node?.textContent ?? null;
}

/**
 * The modal dialog's trap and the menu portalled out of it. The close trigger comes
 * first on purpose: it is where the trap pulled the focus back to while it only
 * accepted DOM descendants of the surface (standarui#77316c2b55).
 */
describe("menu — inside a modal dialog", () => {
  it("keeps the focus in the menu, roves in it, and Escape closes the menu alone", async () => {
    mount(
      <DialogRoot>
        <DialogTrigger>Project settings</DialogTrigger>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogCloseTrigger>Close</DialogCloseTrigger>
              <DialogTitle>Project settings</DialogTitle>
              <MoreMenu />
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );

    await openByPointer(part("dialog:trigger"));
    const surface = part("dialog:content");
    await waitFor(() => expect(surface.contains(document.activeElement)).toBe(true));

    const menuTrigger = part("menu:trigger");
    await openByPointer(menuTrigger);
    const menuContent = part("menu:content");
    expect(surface.contains(menuContent)).toBe(false);
    expect(menuContent.contains(document.activeElement)).toBe(true);

    press(menuContent, "ArrowDown");
    await settle();
    expect(document.activeElement?.getAttribute("data-value")).toBe("duplicate");
    press(menuContent, "ArrowDown");
    await settle();
    expect(document.activeElement?.getAttribute("data-value")).toBe("export");
    expect(menuContent.contains(document.activeElement)).toBe(true);

    press(menuContent, "Escape");
    await waitFor(() => expect(queryPart(document, "menu:content")).toBeNull());
    await twoFrames();
    expect(queryPart(document, "dialog:content")).not.toBeNull();
    expect(document.activeElement).toBe(menuTrigger);
  });

  /**
   * Tab from a menu opened by the pointer: the menu closes and gives the focus back
   * to its trigger, and the browser then steps on from there. A trigger at the edge
   * of the surface stepped out of the modal entirely.
   */
  it("wraps a real Tab to the first stop when the menu trigger is the last one", async () => {
    mount(<EdgeDialog at="last" />);
    await openByPointer(part("dialog:trigger"));
    const surface = part("dialog:content");
    await openByPointer(part("menu:trigger"));
    expect(part("menu:content").contains(document.activeElement)).toBe(true);

    await realKey("{Tab}");
    expect(surface.contains(document.activeElement)).toBe(true);
    expect(label(document.activeElement)).toBe("Before");
  });

  it("wraps a real Shift+Tab to the last stop when the menu trigger is the first one", async () => {
    mount(<EdgeDialog at="first" />);
    await openByPointer(part("dialog:trigger"));
    const surface = part("dialog:content");
    await openByPointer(part("menu:trigger"));
    expect(part("menu:content").contains(document.activeElement)).toBe(true);

    await realKey("{Shift>}{Tab}{/Shift}");
    expect(surface.contains(document.activeElement)).toBe(true);
    expect(label(document.activeElement)).toBe("After");
  });

  /**
   * Opened from the keyboard, the first item takes the focus and is the menu's one
   * Tab stop, so the menu's own proxy places the focus: with nothing after the
   * trigger in the modal, on the trigger itself.
   */
  it("lands a real Tab on the trigger when the menu was opened from the keyboard", async () => {
    mount(<EdgeDialog at="last" />);
    await openByPointer(part("dialog:trigger"));
    const surface = part("dialog:content");
    const menuTrigger = part("menu:trigger");
    fire(() => menuTrigger.focus());
    await realKey("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-value")).toBe("duplicate");

    await realKey("{Tab}");
    expect(surface.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(menuTrigger);
  });

  it("keeps a real Tab in the modal when the menu stops its propagation", async () => {
    const stop = (event: React.KeyboardEvent): void => event.stopPropagation();
    mount(<EdgeDialog at="last" onContentKeyDown={stop} />);
    await openByPointer(part("dialog:trigger"));
    const surface = part("dialog:content");
    await openByPointer(part("menu:trigger"));
    expect(part("menu:content").contains(document.activeElement)).toBe(true);

    // Read in window capture, the one listener a stopped propagation cannot skip,
    // and checked once the dispatch is over: landing on "Before" alone does not
    // prove the browser's own step was prevented, a late step can bring the focus
    // back after it left the page.
    let seen: KeyboardEvent | null = null;
    const spy = (event: KeyboardEvent): void => {
      if (event.key === "Tab") seen = event;
    };
    window.addEventListener("keydown", spy, true);
    try {
      await realKey("{Tab}");
    } finally {
      window.removeEventListener("keydown", spy, true);
    }
    expect((seen as KeyboardEvent | null)?.defaultPrevented).toBe(true);
    expect(surface.contains(document.activeElement)).toBe(true);
    expect(label(document.activeElement)).toBe("Before");
  });

  it("keeps a real Tab in the modal when a document listener stops its propagation", async () => {
    const stop = (event: KeyboardEvent): void => {
      if (event.key === "Tab") event.stopPropagation();
    };
    document.addEventListener("keydown", stop);
    try {
      mount(<EdgeDialog at="last" />);
      await openByPointer(part("dialog:trigger"));
      const surface = part("dialog:content");
      await openByPointer(part("menu:trigger"));
      expect(part("menu:content").contains(document.activeElement)).toBe(true);

      await realKey("{Tab}");
      expect(surface.contains(document.activeElement)).toBe(true);
      expect(label(document.activeElement)).toBe("Before");
    } finally {
      document.removeEventListener("keydown", stop);
    }
  });

  it("leaves a real Ctrl+Tab at the surface's last stop to the browser", async () => {
    mount(<EdgeDialog at="middle" />);
    await openByPointer(part("dialog:trigger"));
    const last = [...part("dialog:content").querySelectorAll("button")].at(-1);
    if (last === undefined) throw new Error("no last stop");
    fire(() => last.focus());
    let prevented: boolean | null = null;
    const spy = (event: KeyboardEvent): void => {
      if (event.key === "Tab") prevented = event.defaultPrevented;
    };
    window.addEventListener("keydown", spy);
    try {
      await realKey("{Control>}{Tab}{/Control}");
    } finally {
      window.removeEventListener("keydown", spy);
    }
    expect(prevented).toBe(false);
  });

  it("lets a real Tab and Shift+Tab step on from a trigger in the middle", async () => {
    mount(<EdgeDialog at="middle" />);
    await openByPointer(part("dialog:trigger"));
    await openByPointer(part("menu:trigger"));
    await realKey("{Tab}");
    expect(label(document.activeElement)).toBe("After");

    await openByPointer(part("menu:trigger"));
    await realKey("{Shift>}{Tab}{/Shift}");
    expect(label(document.activeElement)).toBe("Before");
  });

  it("keeps a real Tab inside the inner dialog when the menu was opened from it", async () => {
    mount(
      <DialogRoot>
        <DialogTrigger>Outer</DialogTrigger>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Outer</DialogTitle>
              <DialogRoot>
                <DialogTrigger>Inner</DialogTrigger>
                <DialogPortal>
                  <DialogPositioner>
                    <DialogContent>
                      <DialogTitle>Inner</DialogTitle>
                      <MoreMenu />
                    </DialogContent>
                  </DialogPositioner>
                </DialogPortal>
              </DialogRoot>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );
    await openByPointer(part("dialog:trigger"));
    const triggers = queryParts(document, "dialog:trigger");
    const innerTrigger = triggers.find((node) => node.textContent === "Inner");
    if (innerTrigger === undefined) throw new Error("no inner trigger");
    await openByPointer(innerTrigger);
    const inner = queryParts(document, "dialog:content").find((node) =>
      node.textContent?.includes("More actions"),
    );
    if (inner === undefined) throw new Error("no inner surface");

    await openByPointer(part("menu:trigger", inner));
    expect(part("menu:content").contains(document.activeElement)).toBe(true);
    await realKey("{Tab}");
    expect(inner.contains(document.activeElement)).toBe(true);
  });
});

/**
 * A modal menu makes the page inert while it is open, its own trigger included.
 * Tab still closes the whole tree and steps past the trigger, as the non-modal
 * menu does; Shift+Tab lands on the trigger. Inert is a state the close lifts.
 */
describe("menu — modal, with its trigger made inert while open", () => {
  function ModalMenu(props: {
    readonly modal?: boolean | undefined;
    readonly field?: boolean | undefined;
    readonly sub?: boolean | undefined;
  }): React.ReactNode {
    return (
      <MenuRoot
        modal={props.modal ?? true}
        submenuOpenDelay={10}
        closeOnSelect={props.field === true ? false : undefined}
      >
        <MenuTrigger>More actions</MenuTrigger>
        <MenuPortal>
          <MenuPositioner>
            <MenuContent>
              <MenuItem value="duplicate">
                <MenuItemText>Duplicate</MenuItemText>
              </MenuItem>
              {props.sub === true ? <Sub value="share" item="copy-link" /> : null}
              <MenuItem value="export">
                <MenuItemText>Export</MenuItemText>
              </MenuItem>
              {props.field === true ? <input aria-label="Note" /> : null}
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    );
  }

  function Page(props: {
    readonly after?: boolean | undefined;
    readonly dialog?: boolean | undefined;
    readonly children: React.ReactNode;
  }): React.ReactNode {
    const body = (
      <>
        <button type="button">Before</button>
        {props.children}
        {props.after === false ? null : <button type="button">After</button>}
      </>
    );
    if (props.dialog !== true) return body;
    return (
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              {body}
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    );
  }

  /** A dialog opened by default takes the focus on a frame of its own: let it land first. */
  async function mounted(): Promise<void> {
    await settle();
    const surface = queryPart(document, "dialog:content");
    if (surface === null) return;
    await waitFor(() => expect(surface.contains(document.activeElement)).toBe(true));
  }

  async function openFromKeyboard(): Promise<HTMLElement> {
    await mounted();
    const trigger = part("menu:trigger");
    fire(() => trigger.focus());
    await realKey("{ArrowDown}");
    expect(trigger.closest("[inert]")).not.toBeNull();
    expect(document.activeElement?.getAttribute("data-value")).toBe("duplicate");
    return trigger;
  }

  async function closed(): Promise<Element | null> {
    await waitFor(() => expect(queryPart(document, "menu:content")).toBeNull());
    await twoFrames();
    return document.activeElement;
  }

  for (const dialog of [false, true]) {
    const where = dialog ? "inside a modal dialog" : "on the page";

    it(`steps a real Tab from its only stop past the trigger (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu />
        </Page>,
      );
      await openFromKeyboard();
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");
    });

    it(`steps a real Tab from the last item past the trigger (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu />
        </Page>,
      );
      await openFromKeyboard();
      await realKey("{ArrowDown}");
      expect(document.activeElement?.getAttribute("data-value")).toBe("export");
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");
    });

    it(`steps a real Tab past the trigger when opened by the pointer (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu />
        </Page>,
      );
      await mounted();
      await openByPointer(part("menu:trigger"));
      expect(part("menu:content").contains(document.activeElement)).toBe(true);
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");
    });

    it(`brings a real Shift+Tab back to the trigger (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu />
        </Page>,
      );
      const trigger = await openFromKeyboard();
      await realKey("{Shift>}{Tab}{/Shift}");
      expect(await closed()).toBe(trigger);
    });

    it(`lands a real Tab on the trigger when nothing follows it (${where})`, async () => {
      mount(
        <Page dialog={dialog} after={false}>
          <ModalMenu />
        </Page>,
      );
      const trigger = await openFromKeyboard();
      await realKey("{Tab}");
      expect(await closed()).toBe(trigger);
    });

    it(`closes the whole tree on a real Tab from a submenu, not modal (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu sub modal={false} />
        </Page>,
      );
      await mounted();
      fire(() => part("menu:trigger").focus());
      await realKey("{ArrowDown}");
      await realKey("{ArrowDown}");
      expect(document.activeElement?.getAttribute("data-value")).toBe("share");
      await realKey("{ArrowRight}");
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("data-value")).toBe("copy-link"),
      );
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");
    });

    it(`closes the whole tree on a real Tab from a submenu (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu sub />
        </Page>,
      );
      await openFromKeyboard();
      await realKey("{ArrowDown}");
      expect(document.activeElement?.getAttribute("data-value")).toBe("share");
      await realKey("{ArrowRight}");
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("data-value")).toBe("copy-link"),
      );
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");
    });

    /**
     * Kept open by `closeOnSelect: false`, with a field inside: Tab still closes
     * the whole tree (APG Menu Button), so there is no open menu to cycle in.
     */
    it(`closes on a real Tab and Shift+Tab from a field inside it (${where})`, async () => {
      mount(
        <Page dialog={dialog}>
          <ModalMenu field />
        </Page>,
      );
      const trigger = await openFromKeyboard();
      const field = part("menu:content").querySelector("input");
      fire(() => field?.focus());
      expect(document.activeElement).toBe(field);
      await realKey("{Tab}");
      expect(label(await closed())).toBe("After");

      fire(() => trigger.focus());
      await realKey("{ArrowDown}");
      fire(() => part("menu:content").querySelector("input")?.focus());
      await realKey("{Shift>}{Tab}{/Shift}");
      expect(await closed()).toBe(trigger);
    });
  }
});

describe("menu — a modal menu whose open is controlled", () => {
  // `refuse-first` refuses the first close the menu asks for and accepts every
  // one after it, at once.
  type Policy = "refuse" | "accept-later" | "refuse-first";
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
    // A press outside with no click arms the menu's click swallow, which outlives
    // the menu: spend it here, or the next test's first click is eaten.
    document.body.click();
  });
  const control: { setOpen: (open: boolean) => void; setSheet: (sheet: boolean) => void } = {
    setOpen: () => {},
    setSheet: () => {},
  };

  function Controlled(props: { readonly policy: Policy }): React.ReactNode {
    const [open, setOpen] = useState(false);
    const [sheet, setSheet] = useState(false);
    const refused = useRef(false);
    control.setOpen = setOpen;
    control.setSheet = setSheet;
    return (
      <MenuRoot
        modal
        presentation={sheet ? "sheet" : "popup"}
        open={open}
        onOpenChange={(details) => {
          if (details.open) setOpen(true);
          else if (props.policy === "accept-later") setTimeout(() => setOpen(false), 30);
          else if (props.policy === "refuse-first" && refused.current) setOpen(false);
          else refused.current = true;
        }}
      >
        <MenuTrigger>More actions</MenuTrigger>
        <MenuPortal>
          <MenuPositioner>
            <MenuContent>
              <MenuItem value="duplicate">
                <MenuItemText>Duplicate</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    );
  }

  async function openControlled(policy: Policy): Promise<HTMLElement> {
    mount(
      <NavProvider>
        <Capture />
        <button type="button">Before</button>
        <Controlled policy={policy} />
        <button type="button">After</button>
      </NavProvider>,
    );
    await settle();
    const trigger = part("menu:trigger");
    fire(() => trigger.focus());
    await realKey("{ArrowDown}");
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-value")).toBe("duplicate"),
    );
    return trigger;
  }

  async function closedFocus(): Promise<Element | null> {
    await waitFor(() => expect(queryPart(document, "menu:content")).toBeNull());
    await twoFrames();
    return document.activeElement;
  }

  it("keeps the focus in the menu when the parent refuses the Tab's close", async () => {
    await openControlled("refuse");
    await realKey("{Tab}");
    expect(part("menu:content").contains(document.activeElement)).toBe(true);
  });

  it("a key after a refused Tab drops the step before the parent closes", async () => {
    const trigger = await openControlled("refuse");
    await realKey("{Tab}");
    await realKey("{Escape}");
    fire(() => control.setOpen(false));
    expect(await closedFocus()).toBe(trigger);
  });

  function outsidePress(type: string): void {
    fire(() =>
      document.body.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true,
          clientX: 2,
          clientY: 2,
        }),
      ),
    );
  }

  const closes: Record<string, () => Promise<void>> = {
    Escape: () => realKey("{Escape}"),
    "the pad's B": async () => {
      fire(() => input?.emit({ intent: "back", source: "gamepad" }));
      await settle();
    },
    "the pad's A on an item": async () => {
      fire(() => input?.emit({ intent: "select", source: "gamepad" }));
      await settle();
    },
    "a press outside with no click": async () => {
      outsidePress("pointerdown");
      outsidePress("pointerup");
      await settle();
    },
  };

  // The first arm is the defect, the second its control: a refused Escape holds
  // no step, so whatever closes the menu after it owes the trigger either way.
  for (const first of ["{Tab}", "{Escape}"]) {
    for (const [name, close] of Object.entries(closes)) {
      it(`after a refused ${first}, a close by ${name} returns to the trigger`, async () => {
        const trigger = await openControlled("refuse-first");
        await realKey(first);
        expect(part("menu:content").contains(document.activeElement)).toBe(true);
        await close();
        expect(await closedFocus()).toBe(trigger);
      });
    }
  }

  it("a refused Tab does not leave on a presentation change", async () => {
    await openControlled("refuse");
    await realKey("{Tab}");
    const outside: string[] = [];
    const record = (event: FocusEvent): void => {
      const target = event.target as Element;
      if (target.textContent === "After") outside.push(target.outerHTML);
    };
    document.addEventListener("focusin", record, true);
    fire(() => control.setSheet(true));
    await settle();
    await twoFrames();
    document.removeEventListener("focusin", record, true);
    expect(outside).toEqual([]);
    expect(queryPart(document, "menu:content")).not.toBeNull();
  });

  it("a close the parent accepts later still lands after the trigger", async () => {
    await openControlled("accept-later");
    await realKey("{Tab}");
    expect(label(await closedFocus())).toBe("After");
  });
});

describe("menu — inside a modal popover", () => {
  it("keeps the focus in the menu, and Escape closes the menu alone", async () => {
    mount(
      <PopoverRoot modal>
        <PopoverTrigger>Filters</PopoverTrigger>
        <PopoverPortal>
          <PopoverPositioner>
            <PopoverContent aria-label="Filters">
              <MoreMenu />
            </PopoverContent>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>,
    );
    await openByPointer(part("popover:trigger"));
    const surface = part("popover:content");
    await waitFor(() => expect(surface.contains(document.activeElement)).toBe(true));

    const menuTrigger = part("menu:trigger");
    await openByPointer(menuTrigger);
    const menuContent = part("menu:content");
    expect(menuContent.contains(document.activeElement)).toBe(true);

    await realKey("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-value")).toBe("duplicate");

    await realKey("{Escape}");
    await waitFor(() => expect(queryPart(document, "menu:content")).toBeNull());
    expect(queryPart(document, "popover:content")).not.toBeNull();
    expect(document.activeElement).toBe(menuTrigger);
  });
});

/**
 * Every part the menu can render, at once. Axe reads a `role="menu"` for what it
 * owns — `menuitem`, `menuitemcheckbox`, `menuitemradio`, `group`, `separator` and
 * nothing else — so the only way to know the anatomy is legal is to draw all of it
 * and ask.
 */
function Everything(): React.ReactNode {
  return (
    <MenuRoot defaultOpen>
      <MenuTrigger>
        Actions
        <MenuIndicator>▾</MenuIndicator>
      </MenuTrigger>
      <MenuPortal>
        <MenuBackdrop />
        <MenuPositioner>
          <MenuContent cancelLabel="Cancel">
            <MenuItemGroup id="edit" label>
              <MenuItemGroupLabel>Edit</MenuItemGroupLabel>
              <MenuItem value="open" shortcut="Meta+O">
                <MenuItemSymbol>+</MenuItemSymbol>
                <MenuItemText>Open</MenuItemText>
                <MenuItemShortcut>⌘O</MenuItemShortcut>
              </MenuItem>
              <MenuItem value="rename" description>
                <MenuItemText>Rename</MenuItemText>
                <MenuItemDescription>Choose a new name</MenuItemDescription>
              </MenuItem>
            </MenuItemGroup>
            <MenuSeparator />
            <MenuItemGroup id="view" label>
              <MenuItemGroupLabel>View</MenuItemGroupLabel>
              <MenuOptionItem type="checkbox" value="wrap" checked>
                <MenuItemIndicator>✓</MenuItemIndicator>
                <MenuItemText>Wrap lines</MenuItemText>
              </MenuOptionItem>
              <MenuOptionItem type="radio" value="by-name" checked={false}>
                <MenuItemIndicator>✓</MenuItemIndicator>
                <MenuItemText>By name</MenuItemText>
              </MenuOptionItem>
            </MenuItemGroup>
            <MenuSeparator />
            {/* Deliberately unlabelled: a group that renders no `MenuItemGroupLabel`
                must carry no `aria-labelledby` at all. Written blind it pointed at an
                id nobody rendered — and axe grades a dead IDREF `incomplete` rather
                than a violation, so this very suite stayed green over one. */}
            <MenuItemGroup id="danger">
              <MenuItem value="trash" disabled destructive>
                <MenuItemText>Move to Trash</MenuItemText>
              </MenuItem>
            </MenuItemGroup>
            <Sub value="share" item="copy-link" />
          </MenuContent>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}

describe("menu — the accessibility tree", () => {
  it("passes axe with every part it can draw", async () => {
    const handle = mount(<Everything />);
    await settle();

    // Scoped the way the dialog's suite scopes it: the trigger where the author
    // wrote it, and the portalled surface on its own — a page-wide run would only
    // add `region`, which is a fact about the harness and not about the menu.
    await expectNoAxeViolations(handle.container);
    const positioner = queryPart(document.body, "positioner");
    if (positioner === null) throw new Error("no positioner");
    await expectNoAxeViolations(positioner);
  });

  it("wires the three IDREFs it publishes to nodes that exist", async () => {
    mount(<Everything />);
    await settle();

    const trigger = queryPart(document.body, "trigger");
    const content = queryPart(document.body, "content");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger?.getAttribute("aria-controls") ?? "")).toBe(content);
    // The surface is named by the trigger, and the group by its own label.
    expect(document.getElementById(content?.getAttribute("aria-labelledby") ?? "")).toBe(trigger);

    for (const group of queryParts(document.body, "item-group")) {
      const ref = group.getAttribute("aria-labelledby");
      if (ref === null) {
        // No label rendered, so no reference — and nothing else to check. The
        // reverse is what shipped first: an IDREF on every group, dangling on the
        // ones with no label, leaving them unnamed *and* pointing nowhere.
        expect(queryParts(group, "item-group-label")).toHaveLength(0);
        continue;
      }
      const label = document.getElementById(ref);
      expect(label?.textContent).not.toBe("");
      expect(group.contains(label)).toBe(true);
    }

    const described = queryParts(document.body, "item").find((node) =>
      node.hasAttribute("aria-describedby"),
    );
    expect(
      document.getElementById(described?.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Choose a new name");
  });

  it("keeps every decorative part out of the focus order", async () => {
    mount(<Everything />);
    await settle();

    for (const name of ["indicator", "item-symbol", "item-indicator", "item-shortcut"]) {
      for (const node of queryParts(document.body, name)) {
        expect(node.getAttribute("aria-hidden")).toBe("true");
        // `aria-hidden-focus`: hidden and unfocusable, or it is a violation.
        expect(node.hasAttribute("tabindex")).toBe(false);
        expect(node.matches("a, button, input, select, textarea, [tabindex]")).toBe(false);
      }
    }

    // The shortcut reaches assistive technology as a machine-readable string on the
    // item, never as the row of glyphs beside it.
    const open = queryParts(document.body, "item").find(
      (node) => node.getAttribute("data-value") === "open",
    );
    expect(open?.getAttribute("aria-keyshortcuts")).toBe("Meta+O");
  });

  it("keeps `role=menu` and passes axe in the sheet, where the presentation changed and the semantics did not", async () => {
    document.documentElement.dataset.suiDensity = "touch";
    try {
      const handle = mount(<Everything />);
      await settle();

      const content = queryPart(document.body, "content");
      expect(content?.getAttribute("data-presentation")).toBe("sheet");
      expect(content?.getAttribute("role")).toBe("menu");
      // Added for the sheet and named by the consumer — a nameless button would be
      // worse than none, and the machine warns about one in dev.
      const cancel = queryPart(document.body, "cancel-trigger");
      expect(cancel?.textContent).toBe("Cancel");

      const positioner = queryPart(document.body, "positioner");
      if (positioner === null) throw new Error("no positioner");
      await expectNoAxeViolations(positioner);
      // Unmounted before the attribute goes back: the environment is watched
      // through a MutationObserver, so restoring it under a mounted tree schedules
      // a React update from outside `act`.
      handle.unmount();
    } finally {
      delete document.documentElement.dataset.suiDensity;
    }
  });
});
