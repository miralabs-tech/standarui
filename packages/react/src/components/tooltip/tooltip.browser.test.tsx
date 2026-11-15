/**
 * The tooltip through React: the portal, the presence, the layer context — and
 * axe over the shape the DoD asks for.
 *
 * The machine is proved in `packages/core/src/components/tooltip`; what is here
 * is what only an adapter can get wrong. The nesting case is the one that could
 * not live anywhere else: it puts a real tooltip inside a real popover and asks
 * Escape which of the two it means.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { ButtonRoot } from "../button/button";
import {
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
} from "../popover/popover";
import {
  TooltipContent,
  TooltipPortal,
  TooltipPositioner,
  TooltipRoot,
  type TooltipRootProps,
  TooltipTrigger,
} from "./tooltip";

function part(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="tooltip:${name}"]`);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

interface RenameProps extends TooltipRootProps {
  /** Draws the trigger with the button component, the way every story does. */
  readonly composed?: boolean;
}

function Rename(props: RenameProps): React.ReactNode {
  const { composed, ...root } = props;
  return (
    <TooltipRoot openDelay={20} warmDelay={5} warmDuration={0} {...root}>
      {composed === true ? (
        <TooltipTrigger render={<ButtonRoot variant="gray" />}>Rename</TooltipTrigger>
      ) : (
        <TooltipTrigger>Rename</TooltipTrigger>
      )}
      <TooltipPortal>
        <TooltipPositioner>
          <TooltipContent>Rename this file</TooltipContent>
        </TooltipPositioner>
      </TooltipPortal>
    </TooltipRoot>
  );
}

/**
 * `pointerover`, not `pointerenter`, and the distinction is React's rather than
 * the DOM's: `onPointerEnter` is not a listener React ever attaches — the enter
 * and leave pair is synthesised from the bubbling `pointerover`/`pointerout` at
 * the root container, with `relatedTarget` deciding whether the boundary was
 * really crossed. A native `pointerenter` dispatched here reaches nothing at all,
 * which is exactly what it did before this comment existed.
 */
function hover(node: HTMLElement): void {
  fire(() => {
    node.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", relatedTarget: null }),
    );
  });
}

afterEach(() => {
  unmountAll();
});

describe("tooltip through React", () => {
  it("portals the surface and describes the trigger it was opened from", async () => {
    const { container } = mount(<Rename defaultOpen />);
    await settle();

    const trigger = part(container, "trigger");
    const content = part(document.body, "content");

    // Portalled: the surface is a sibling of the trigger's tree, not a child.
    expect(container.contains(content)).toBe(false);
    expect(content.getAttribute("role")).toBe("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(content.id);
  });

  it("mounts nothing at all while it is closed", async () => {
    mount(<Rename />);
    await settle();

    expect(document.body.querySelector('[data-part~="tooltip:content"]')).toBeNull();
    expect(document.body.querySelector('[data-part~="tooltip:positioner"]')).toBeNull();
  });

  it("keeps the surface mounted when asked, and still says it is closed", async () => {
    mount(<Rename keepMounted />);
    await settle();

    const content = part(document.body, "content");
    expect(content.getAttribute("data-state")).toBe("closed");
  });

  it("opens under a real pointer, through the delay, and takes the id to the DOM", async () => {
    const { container } = mount(<Rename composed />);
    await settle();

    const trigger = part(container, "trigger");
    // The composed trigger is a real button root, and the part id has to reach
    // the element or the surface has nothing to measure itself against.
    expect(trigger.id).toMatch(/^tooltip:.+:trigger$/);

    hover(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-part~="tooltip:content"]')).not.toBeNull();
    });

    const positioner = part(document.body, "positioner");
    expect(positioner.dataset["side"]).toBeDefined();
  });

  /**
   * The layer context is what makes this work, and it is shared with the dialog
   * and the popover rather than private to any of them: a tooltip inside a
   * popover declares the popover as its parent, so the stack knows which of the
   * two Escape is for. Without it the popover would close and leave the tooltip
   * hanging over nothing.
   */
  it("closes itself and not the popover it is sitting in", async () => {
    mount(
      <PopoverRoot defaultOpen label="Share options">
        <PopoverPortal>
          <PopoverPositioner>
            <PopoverContent>
              <PopoverTitle>Share</PopoverTitle>
              <Rename defaultOpen />
            </PopoverContent>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>,
    );
    await settle();

    const scoped = (scope: string): HTMLElement | null =>
      document.body.querySelector<HTMLElement>(`[data-part~="${scope}:content"]`);

    expect(scoped("tooltip")?.dataset["state"]).toBe("open");

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();

    // Read off the trigger, which is never unmounted, and never off the surface.
    // Nothing in this harness loads the stylesheet, so the exit has no animation
    // to wait for and the presence takes the surface out on the very next frame;
    // `settle()` resolves on a microtask and does not synchronise with frames, so
    // asserting `data-state="closed"` on the surface is a race — webkit loses it
    // every single time, chromium and firefox lose it a few runs in a hundred.
    expect(part(document.body, "trigger").dataset["state"]).toBe("closed");
    await waitFor(() => {
      expect(scoped("tooltip")).toBeNull();
    });
    // The popover is untouched: the tooltip was the top layer, and it was the
    // only thing Escape was allowed to take.
    expect(scoped("popover")?.dataset["state"]).toBe("open");
  });

  /**
   * Scoped to the trigger's tree and to the portalled surface, and never to the
   * whole of `document.body` the way the popover's suite can afford: axe's
   * best-practice `region` rule wants every piece of page content inside a
   * landmark, and a surface portalled to `<body>` is outside one by
   * construction. The popover escapes that rule because `role="dialog"` is
   * exempt from it; `role="tooltip"` is not, and moving the surface back inside
   * the page to satisfy a linter would break the thing the portal exists for.
   */
  it("passes axe over the trigger and over the surface", async () => {
    const { container } = mount(<Rename defaultOpen composed />);
    await settle();

    await expectNoAxeViolations(container);
    await expectNoAxeViolations(part(document.body, "positioner"));
  });
});
