/**
 * The drawer once it is composed onto a real dialog — the half that only exists
 * here.
 *
 * `packages/core/src/components/drawer/drawer.browser.test.ts` drives the machine
 * against a real engine with no framework: the gesture, the scroller arbitration,
 * the release table, the pad. None of that needs a dialog. What does, and so lives
 * here: the two identities landing on one element, the id underneath them, the tab
 * order inside a focus trap, the dismissal lock the two machines share, and axe.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  settle,
  unmountAll,
} from "../../render-harness";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  type DialogRootProps,
  DialogTitle,
  DialogTrigger,
} from "../dialog/dialog";
import {
  DrawerBackdrop,
  DrawerContent,
  DrawerGrabber,
  DrawerPositioner,
  DrawerRoot,
  type DrawerRootProps,
} from "./drawer";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

interface SheetProps {
  readonly dialog?: Partial<DialogRootProps>;
  readonly drawer?: Partial<DrawerRootProps>;
  readonly body?: ReactNode;
}

/**
 * The composition the library documents, written out: the drawer's three
 * co-identities reach the dialog's own parts through `render`, and the grabber is
 * the one element the decorator brings — last, on purpose.
 */
function Sheet(props: SheetProps): ReactNode {
  return (
    <DialogRoot defaultOpen label="Filters" presentation="sheet" {...props.dialog}>
      <DialogTrigger>Filters</DialogTrigger>
      <DrawerRoot detents={[0.5, 1]} {...props.drawer}>
        <DialogPortal disabled>
          <DialogBackdrop render={<DrawerBackdrop />} />
          <DialogPositioner render={<DrawerPositioner />}>
            <DialogContent render={<DrawerContent />}>
              <DialogTitle>Filters</DialogTitle>
              {props.body ?? (
                <>
                  <button type="button">Reset</button>
                  <button type="button">Apply</button>
                </>
              )}
              <DrawerGrabber aria-label="Resize sheet" />
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DrawerRoot>
    </DialogRoot>
  );
}

function tokens(node: Element, attribute: string): string[] {
  return (node.getAttribute(attribute) ?? "").split(" ").filter((token) => token !== "");
}

function pointer(node: HTMLElement, type: string, at: number, y: number): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 0,
    clientY: y,
  });
  // A read-only getter on the prototype; shadowing it on the instance is the only
  // way to assert a velocity rather than hope for one.
  Object.defineProperty(event, "timeStamp", { value: at });
  // The listeners are native and in the machine's effects, so the commits they
  // cause are outside React's scheduler unless the dispatch itself is wrapped.
  fire(() => node.dispatchEvent(event));
}

/** Fast enough that where the finger *is* stops being the question. */
function flick(node: HTMLElement): void {
  pointer(node, "pointerdown", 0, 100);
  pointer(node, "pointermove", 8, 140);
  pointer(node, "pointermove", 16, 180);
  pointer(node, "pointerup", 16, 180);
}

describe("drawer over dialog — one element, two identities", () => {
  it("puts both scopes and both parts on each of the three shared elements", async () => {
    const { container } = mount(<Sheet />);
    await settle();

    for (const part of ["positioner", "backdrop", "content"]) {
      const node = queryPart(container, part);
      expect(node, `no ${part} in the markup`).not.toBeNull();
      expect(tokens(node as Element, "data-scope")).toEqual(
        expect.arrayContaining(["drawer", "dialog"]),
      );
      expect(tokens(node as Element, "data-part")).toEqual(
        expect.arrayContaining([`drawer:${part}`, `dialog:${part}`]),
      );
    }
  });

  it("gives the decorator the dialog's own ids, so both machines find one element", async () => {
    const { container } = mount(<Sheet />);
    await settle();
    const content = queryPart(container, "content") as HTMLElement;
    const grabber = queryPart(container, "grabber") as HTMLElement;

    // The DOM twin of the SSR case. `mergeProps` is later-wins for values and the
    // dialog contributes its `id` last, so a drawer deriving its own would resolve
    // `getElementById` to nothing and every effect that reaches for the surface
    // would install against null, in silence.
    expect(content.id).not.toBe("");
    expect(grabber.getAttribute("aria-controls")).toBe(content.id);
    expect(document.getElementById(content.id)).toBe(content);
  });

  it("writes the detent custom properties on the shared content once mounted", async () => {
    const { container } = mount(<Sheet drawer={{ defaultDetent: 0.5 }} />);
    await settle();
    const content = queryPart(container, "content") as HTMLElement;

    expect(content.style.getPropertyValue("--sui-drawer-detent")).toBe("0.5");
    expect(content.style.getPropertyValue("--sui-drawer-detent-max")).toBe("1");
  });

  it("renders no grabber on a single-detent sheet", async () => {
    const { container } = mount(<Sheet drawer={{ detents: [1] }} />);
    await settle();

    expect(queryPart(container, "grabber")).toBeNull();
  });
});

describe("drawer over dialog — the tab order", () => {
  it("does not open with the focus on the grabber, and puts it last in the loop", async () => {
    const { container } = mount(<Sheet />);
    await settle();
    const content = queryPart(container, "content") as HTMLElement;
    const grabber = queryPart(container, "grabber") as HTMLElement;

    // The twin of the defect `toggle-group` and `tabs` both carried: a surface that
    // opens with the focus on a resize handle announces a splitter before it
    // announces itself.
    expect(document.activeElement).not.toBe(grabber);
    // Last child, which is what makes it last in the trap's loop — the sheet puts
    // it back at the visual edge with `inset-*`, not with `order`.
    expect(content.lastElementChild).toBe(grabber);
    expect(grabber.getAttribute("tabindex")).toBe("0");
  });

  it("takes the grabber out of the tab order when the track is frozen", async () => {
    const { container } = mount(<Sheet drawer={{ disabled: true }} />);
    await settle();
    const grabber = queryPart(container, "grabber") as HTMLElement;

    // Read off the attribute and never off the property: `tabIndex` on a bare
    // element answers `-1` whether or not anything wrote it.
    expect(grabber.hasAttribute("tabindex")).toBe(false);
    expect(grabber.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("drawer over dialog — the dismissal the two machines share", () => {
  it("asks the surface to close, rather than closing it behind its back", async () => {
    const onOpenChange = vi.fn();
    const onDismiss = vi.fn();
    const { container } = mount(
      <Sheet dialog={{ onOpenChange, onDismiss }} drawer={{ detents: [0.5] }} />,
    );
    await settle();

    flick(queryPart(container, "content") as HTMLElement);
    await settle();

    expect(onOpenChange).toHaveBeenCalledWith({ open: false });
    // The reason travels, which is the whole point of going through `dismiss`
    // instead of `setOpen(false)`.
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ reason: "drag" }));
  });

  it("refuses that same flick when the surface locks escape-like dismissals", async () => {
    const onOpenChange = vi.fn();
    const { container } = mount(
      <Sheet dialog={{ onOpenChange, closeOnEscape: false }} drawer={{ detents: [0.5] }} />,
    );
    await settle();

    flick(queryPart(container, "content") as HTMLElement);
    await settle();

    // The negative branch, and it is the only one that can see the lock:
    // `closeOnInteractOutside` is true by default, so a regression routing `"drag"`
    // to that clause instead would leave the positive test above green.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("drawer over dialog — axe", () => {
  it("passes on a bottom sheet with a track", async () => {
    const { container } = mount(<Sheet />);
    await settle();

    await expectNoAxeViolations(container);
  });

  it("passes on a single-detent inline drawer, which renders no grabber", async () => {
    const { container } = mount(<Sheet drawer={{ detents: [1], edge: "start" }} />);
    await settle();

    await expectNoAxeViolations(container);
  });

  it("passes mid-gesture, with the surface marked as dragging", async () => {
    const { container } = mount(<Sheet />);
    await settle();
    const content = queryPart(container, "content") as HTMLElement;

    pointer(content, "pointerdown", 0, 100);
    pointer(content, "pointermove", 16, 140);
    await settle();
    expect(content.hasAttribute("data-dragging")).toBe(true);

    await expectNoAxeViolations(container);
  });

  /**
   * The counterpart of choosing `role="separator"` over `button` or `slider`, and
   * it is asked directly rather than left to the sweep above: a focusable separator
   * carrying `aria-valuenow` inside a `role="dialog"` is an unusual enough shape
   * that a reader is entitled to see the three rules that could refuse it named.
   */
  it("accepts a focusable separator with a value inside a dialog", async () => {
    const { container } = mount(<Sheet />);
    await settle();
    const { run } = await import("axe-core");

    const results = await run(container, {
      runOnly: {
        type: "rule",
        values: ["aria-allowed-attr", "aria-required-attr", "aria-allowed-role"],
      },
      resultTypes: ["violations", "incomplete"],
    });

    expect(results.violations.map((entry) => entry.id)).toEqual([]);
    expect(results.incomplete.map((entry) => entry.id)).toEqual([]);
  });

  it("leaves no dead IDREF, which axe classes as incomplete rather than a violation", async () => {
    const { container } = mount(<Sheet />);
    await settle();
    const grabber = queryPart(container, "grabber") as HTMLElement;

    // Asserted directly because a dead `aria-controls` never reaches `violations`:
    // a suite reading that array alone would keep one forever.
    const controls = grabber.getAttribute("aria-controls") ?? "";
    expect(controls).not.toBe("");
    expect(document.getElementById(controls)).not.toBeNull();
  });
});
