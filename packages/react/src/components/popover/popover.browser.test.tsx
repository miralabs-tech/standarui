/**
 * The popover through React: the portal, the two presences, the layer context —
 * and axe over the shapes the DoD asks for.
 *
 * The machine is proved in `packages/core/src/components/popover`; what is here
 * is what only an adapter can get wrong. The nesting case is the one that could
 * not live anywhere else: it puts a real popover inside a real dialog and clicks
 * inside it.
 */

import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  realKey,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { ButtonRoot } from "../button/button";
import {
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import {
  MenuContent,
  MenuItem,
  MenuItemText,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "../menu/menu";
import {
  PopoverAnchor,
  PopoverArrow,
  PopoverBackdrop,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverDescription,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  type PopoverRootProps,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="popover:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

interface ShareProps extends PopoverRootProps {
  readonly title?: string | null;
  /** Draws the trigger with the button component, the way every story does. */
  readonly composed?: boolean;
}

function Share(props: ShareProps): React.ReactNode {
  const { title = "Share", composed, children, ...root } = props;
  return (
    <PopoverRoot {...root}>
      {composed === true ? (
        <PopoverTrigger render={<ButtonRoot variant="gray" />}>Share</PopoverTrigger>
      ) : (
        <PopoverTrigger>Share</PopoverTrigger>
      )}
      <PopoverPortal>
        <PopoverBackdrop />
        <PopoverPositioner>
          <PopoverContent>
            {title === null ? null : <PopoverTitle>{title}</PopoverTitle>}
            <PopoverDescription>Anyone with the link can view.</PopoverDescription>
            {children}
            <PopoverCloseTrigger aria-label="Close">Done</PopoverCloseTrigger>
          </PopoverContent>
          <PopoverArrow />
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("popover through React", () => {
  it("portals the surface and puts the arrow beside it, never inside", async () => {
    mount(<Share defaultOpen />);
    await settle();

    const positioner = part(document.body, "positioner");
    const content = part(document.body, "content");
    const arrow = part(document.body, "arrow");

    // `contain: layout paint` on a glass surface would clip a child arrow away,
    // and `--sui-arrow-x` is computed against the floating element's origin.
    expect(arrow.parentElement).toBe(positioner);
    expect(content.contains(arrow)).toBe(false);
    // The tip is drawn by the arrow rather than composed by the consumer.
    expect(arrow.querySelector('[data-part~="popover:arrow-tip"]')).not.toBeNull();
  });

  /**
   * The composition every story uses, and the one nothing guarded.
   *
   * `ButtonRoot` takes `id` as a machine prop, so until `use-machine` seeded
   * `ids.root` the trigger's id never reached the document: `getTriggerEl` found
   * nothing, `getAnchorEl` fell back to it and found nothing, and `trackPosition`
   * returned its no-op before writing a single style. The surface then stayed a
   * static block in flow at the end of the portal container — bottom of the page,
   * hard left, identically for all twelve placements.
   *
   * `data-side` is the tell: `getPositionerProps` deliberately does not publish it,
   * so only the position effect can have written it here. The geometry after it is
   * what proves the effect ran against the *right* anchor rather than merely
   * running. Compared in ranges, never exactly — `compute-position` rounds to
   * integers.
   */
  it("anchors to a trigger drawn by the button component", async () => {
    const { container } = mount(
      <div style={{ paddingInlineStart: "120px" }}>
        <Share composed defaultOpen />
      </div>,
    );
    await settle();

    const trigger = part(container, "trigger");
    const positioner = part(document.body, "positioner");
    const anchorBox = trigger.getBoundingClientRect();
    const box = positioner.getBoundingClientRect();

    expect(positioner.dataset["side"]).toBe("bottom");
    expect(positioner.style.position).toBe("fixed");

    // Centred on the anchor and sitting under it, which is what `bottom` means.
    expect(
      Math.abs(box.left + box.width / 2 - (anchorBox.left + anchorBox.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(box.top).toBeGreaterThanOrEqual(anchorBox.bottom);

    // Neither defect this pins is subtle. An unpositioned surface carries no
    // `data-side` at all; one measured while still in flow is as wide as its
    // container, which drives the shift clamp's `max` under its `min` and pins it
    // to `padding` — 8px from the boundary, however far into the page the trigger
    // sits.
    expect(box.left).toBeGreaterThan(8);
  });

  it("names itself from its title, and from its label when it has none", async () => {
    const { unmount } = mount(<Share defaultOpen />);
    await settle();
    let content = part(document.body, "content");
    expect(content.getAttribute("aria-labelledby")).toBe(part(document.body, "title").id);
    expect(content.hasAttribute("aria-label")).toBe(false);
    await expectNoAxeViolations(document.body);
    unmount();

    mount(<Share defaultOpen title={null} label="Share options" />);
    await settle();
    content = part(document.body, "content");
    // Never both — one name, and the label only takes over once the title is
    // proved absent from the DOM.
    expect(content.getAttribute("aria-label")).toBe("Share options");
    expect(content.hasAttribute("aria-labelledby")).toBe(false);
    await expectNoAxeViolations(document.body);
  });

  it("toggles from its own trigger", async () => {
    const { container } = mount(<Share />);
    const trigger = container.querySelector("button") as HTMLButtonElement;

    fire(() => trigger.click());
    await settle();
    expect(document.querySelector('[data-part~="popover:content"]')).not.toBeNull();

    fire(() => trigger.click());
    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("drops the arrow in the sheet presentation, where there is nothing to point at", async () => {
    mount(<Share defaultOpen presentation="sheet" />);
    await settle();

    expect(document.querySelector('[data-part~="popover:arrow"]')).toBeNull();
    expect(part(document.body, "content").dataset["presentation"]).toBe("sheet");
    expect(part(document.body, "backdrop").dataset["presentation"]).toBe("sheet");
    await expectNoAxeViolations(document.body);
  });

  it("is modal only when asked, and says so to the accessibility tree", async () => {
    mount(<Share defaultOpen modal />);
    await settle();

    const content = part(document.body, "content");
    expect(content.getAttribute("aria-modal")).toBe("true");
    await expectNoAxeViolations(document.body);
  });

  /**
   * The exit criterion of the phase, in its smallest form: a popover opened from
   * inside a dialog registers a layer whose parent is *declared*, because once
   * both are portalled the DOM cannot tell — and without that a click inside the
   * popover is an outside click for the dialog, which closes.
   */
  it("declares the dialog it was opened from, so a click inside it closes nothing", async () => {
    mount(
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              <Share defaultOpen />
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );
    await settle();

    const content = part(document.body, "content");
    expect(content.dataset["nested"]).toBe("");

    for (const type of ["pointerdown", "pointerup"]) {
      content.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }));
    }
    await settle();

    expect(document.querySelector('[data-part~="dialog:content"]')).not.toBeNull();
    expect(document.querySelector('[data-part~="popover:content"]')).not.toBeNull();
  });

  it("keeps the machine's own open state ahead of the presence, or the effects find nothing", async () => {
    function Controlled(): React.ReactNode {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        setOpen(true);
      }, []);
      return <Share open={open} />;
    }

    mount(<Controlled />);
    await settle();

    // The interpreter installs the open state's effects in the layout effect of
    // the commit that opened it, and every one of them looks the surface up by
    // id. A surface arriving one commit later would find them installed against
    // nothing, with nothing to re-install them.
    expect(document.querySelector('[data-part~="popover:content"]')).not.toBeNull();
  });
});

/**
 * A popover driven from a store has an anchor and no trigger. Tab out of it in a
 * modal dialog went past the end of the document and out of the modal.
 */
/**
 * `modal` with `trapFocus: false`: the page is inert and the proxy answers Tab, so
 * there is no "after the trigger" — the edges wrap inside the surface.
 */
describe("popover — modal without a trap", () => {
  it("wraps Tab and Shift+Tab at the edges of the surface", async () => {
    const { container } = mount(
      <>
        <button type="button">Before</button>
        <Share modal trapFocus={false}>
          <button type="button">Copy link</button>
        </Share>
        <button type="button">After</button>
      </>,
    );
    await settle();
    fire(() => part(container, "trigger").click());
    await settle();
    const done = part(document.body, "close-trigger");
    fire(() => done.focus());
    expect(document.activeElement).toBe(done);

    await realKey("{Tab}");
    expect(document.activeElement?.textContent).toBe("Copy link");
    await realKey("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(done);
  });
});

describe("popover — anchored without a trigger, inside a modal dialog", () => {
  function Anchored(): React.ReactNode {
    const [open, setOpen] = useState(false);
    return (
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              <button type="button" onClick={() => setOpen(true)}>
                Before
              </button>
              <PopoverRoot open={open} onOpenChange={(details) => setOpen(details.open)}>
                <PopoverAnchor>
                  <span>anchor</span>
                </PopoverAnchor>
                <PopoverPortal>
                  <PopoverPositioner>
                    <PopoverContent aria-label="Anchored">
                      <button type="button">Inner first</button>
                      <button type="button">Inner last</button>
                    </PopoverContent>
                  </PopoverPositioner>
                </PopoverPortal>
              </PopoverRoot>
              <button type="button">After</button>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    );
  }

  async function openFrom(inner: string): Promise<HTMLElement> {
    mount(<Anchored />);
    await settle();
    // The dialog's trap places its own focus two frames in; let it land first.
    await waitFor(() => {
      expect(
        document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
      ).toBe(true);
    });
    const before = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === "Before",
    );
    fire(() => before?.click());
    await settle();
    const content = part(document.body, "content");
    const target = [...content.querySelectorAll<HTMLElement>("button")].find(
      (node) => node.textContent === inner,
    );
    fire(() => target?.focus());
    expect(document.activeElement?.textContent).toBe(inner);
    return part(document.body, "content");
  }

  it("sends a real Tab from its last stop to the element after the anchor", async () => {
    await openFrom("Inner last");
    await realKey("{Tab}");
    expect(document.activeElement?.textContent).toBe("After");
  });

  it("sends a real Shift+Tab from its first stop to the element before the anchor", async () => {
    await openFrom("Inner first");
    await realKey("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement?.textContent).toBe("Before");
  });
});

describe("popover and menu triggers — inside a modal dialog, before a link", () => {
  async function opened(control: React.ReactNode): Promise<HTMLElement> {
    mount(
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              <button type="button">Before</button>
              {control}
              <a id="after" href="#after">
                After
              </a>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );
    await settle();
    await waitFor(() => {
      expect(
        document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
      ).toBe(true);
    });
    const trigger = document.querySelector<HTMLElement>("#own-trigger");
    if (trigger === null) throw new Error("no trigger");
    fire(() => trigger.focus());
    await realKey("{Enter}");
    return trigger;
  }

  it("lets a non-modal popover trigger answer its own Tab, into the popover, which stays open", async () => {
    await opened(
      <PopoverRoot autoFocus={false} modal={false}>
        <PopoverTrigger id="own-trigger">Pop</PopoverTrigger>
        <PopoverPortal>
          <PopoverPositioner>
            <PopoverContent aria-label="Inner">
              <button type="button">Inner</button>
            </PopoverContent>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>,
    );
    expect(document.querySelector('[data-part~="popover:content"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe("own-trigger");

    await realKey("{Tab}");

    expect(document.querySelector('[data-part~="popover:content"]')).not.toBeNull();
    expect(part(document.body, "content").contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.id).not.toBe("after");
  });

  it("still sends a Tab from an open menu's trigger on to the link after it", async () => {
    await opened(
      <MenuRoot>
        <MenuTrigger id="own-trigger">Menu</MenuTrigger>
        <MenuPortal>
          <MenuPositioner>
            <MenuContent>
              <MenuItem value="a">
                <MenuItemText>A</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>,
    );

    await realKey("{Tab}");

    expect(document.activeElement?.id).toBe("after");
  });
});
