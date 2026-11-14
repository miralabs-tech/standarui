/**
 * The dialog through React: only what an adapter can get wrong.
 *
 * The machine is proved in `packages/core/src/components/dialog/dialog.browser.test.ts`,
 * against real nodes with no framework at all — the focus trap, the layer stack, the
 * scroll lock, the accessible name and the gamepad scope are settled there and are not
 * re-litigated here. What is here is the seam React adds and nothing else: a surface
 * that leaves the trigger's subtree through a portal, two presences that outlive the
 * close, a parenthood no DOM can infer once both dialogs are portalled, and the intent
 * scope taken from a provider. Plus axe over the matrix the DoD asks for.
 */

import { isScrollLocked } from "@standarui/core";
import type { InputSystem } from "@standarx/nav";
import { NavProvider, useInputSystem } from "@standarx/nav/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useParentLayerId } from "../../layer-context";
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
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  type DialogRootProps,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/** Queried from the document, never from the mount container: the surface is portalled. */
function query(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-part~="dialog:${name}"]`);
}

function part(name: string): HTMLElement {
  const node = query(name);
  if (node === null) throw new Error(`no dialog part "${name}"`);
  return node;
}

function contents(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-part~="dialog:content"]')];
}

/** The only way to tell two portalled surfaces apart — they are DOM siblings. */
function titled(title: string): HTMLElement | null {
  return (
    contents().find(
      (node) => node.querySelector('[data-part~="dialog:title"]')?.textContent === title,
    ) ?? null
  );
}

type SceneProps = Omit<DialogRootProps, "children"> & {
  /** `null` renders no title part — the shape whose name comes from `label` instead. */
  readonly title?: string | null;
  readonly body?: ReactNode;
  /** Renders the surface where it was written instead of on the body. */
  readonly inPlace?: boolean;
  readonly triggerLabel?: string;
};

function Scene(props: SceneProps): ReactNode {
  const { title = "Rename file", body, inPlace, triggerLabel = "Rename", ...root } = props;
  return (
    <DialogRoot {...root}>
      <DialogTrigger>{triggerLabel}</DialogTrigger>
      <DialogPortal disabled={inPlace}>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent>
            {title === null ? null : <DialogTitle>{title}</DialogTitle>}
            <DialogDescription>Pick a new name.</DialogDescription>
            {body ?? <input aria-label={`${triggerLabel} field`} />}
            <DialogCloseTrigger>Close</DialogCloseTrigger>
          </DialogContent>
        </DialogPositioner>
      </DialogPortal>
    </DialogRoot>
  );
}

/**
 * Stands in for the surface families the dialog cannot import — a popover, a menu,
 * a tooltip. It reads the shared layer channel and nothing else, which is exactly
 * as much as one of those roots does.
 */
function LayerProbe(): ReactNode {
  return <span id="layer-probe" data-layer={useParentLayerId()} />;
}

function probedLayer(): string | undefined {
  return document.querySelector<HTMLElement>("#layer-probe")?.dataset.layer;
}

function press(node: EventTarget): void {
  fire(() => {
    for (const type of ["pointerdown", "pointerup"]) {
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0 }));
    }
  });
}

function pressEscape(): void {
  fire(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

afterEach(() => {
  unmountAll();
});

describe("DialogRoot — what the adapter adds", () => {
  /**
   * The composition every story uses — a trigger drawn by the button component —
   * and the thing it must not lose on the way. `ButtonRoot` takes `id` as a
   * machine prop, so before the fix it swallowed the trigger's id and published
   * `button:dialog:d1:trigger:root` instead; the id the machine looks its trigger
   * up by then existed nowhere in the document. Silent here, because a dialog
   * centres itself and never has to find its trigger to place a surface. Not
   * silent for an anchored one.
   */
  it("keeps its trigger id on a button drawn by the button component", () => {
    mount(
      <DialogRoot id="d1">
        <DialogTrigger render={<ButtonRoot variant="gray" />}>Rename</DialogTrigger>
      </DialogRoot>,
    );
    const trigger = part("trigger");

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.id).toBe("dialog:d1:trigger");
    expect(document.getElementById("dialog:d1:trigger")).toBe(trigger);
  });

  it("renders no element of its own, and puts the surface outside the trigger's subtree", async () => {
    const { container } = mount(<Scene defaultOpen />);
    await settle();

    // The anatomy has no `root` part: what the annexe called one is this context.
    expect([...container.children]).toEqual([part("trigger")]);
    expect(part("content").closest('[data-part~="dialog:trigger"]')).toBeNull();
    expect(part("positioner").parentElement).toBe(document.body);
  });

  /**
   * The regression test for `isMounted` reading the machine rather than the presence.
   * `usePresence` learns of a change one commit late, and the interpreter installs the
   * open state's effects — trap, layer, scroll lock, `hideOthers` — in the layout effect
   * of the very commit that opened. A surface arriving a commit later would find every
   * one of them installed against nothing, with nothing to re-install them.
   */
  it("has the surface in the tree on the commit that opens, not the one after", async () => {
    const { container } = mount(<Scene />);

    fire(() => part("trigger").click());

    expect(query("content")).not.toBeNull();
    expect(part("content").closest("[inert]")).toBeNull();
    expect(container.hasAttribute("inert")).toBe(true);
    expect(isScrollLocked(document)).toBe(true);

    await waitFor(() =>
      expect(document.activeElement).toBe(part("content").querySelector("input")),
    );
  });

  it("gives the focus back across the portal boundary", async () => {
    mount(<Scene />);
    const trigger = part("trigger");
    fire(() => trigger.focus());

    fire(() => trigger.click());
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));

    fire(() => part("close-trigger").click());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

/**
 * `trapFocus: false` on a modal dialog: the page is still inert and the proxy
 * answers Tab, so the edges wrap inside the surface instead of dying there.
 */
describe("dialog — modal without a trap", () => {
  it("wraps Tab and Shift+Tab at the edges of the surface", async () => {
    mount(<Scene trapFocus={false} />);
    fire(() => part("trigger").click());
    await settle();
    const close = part("close-trigger");
    fire(() => close.focus());
    expect(document.activeElement).toBe(close);

    await realKey("{Tab}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Rename field");
    await realKey("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(close);
  });
});

describe("dialog — the two presences", () => {
  it("takes the scrim and the surface out together, and the portal with them", async () => {
    mount(<Scene defaultOpen />);
    await settle();
    expect(query("backdrop")).not.toBeNull();

    fire(() => part("close-trigger").click());

    await waitFor(() => {
      expect(query("backdrop")).toBeNull();
      expect(query("content")).toBeNull();
    });
    expect(query("positioner")).toBeNull();
    expect(isScrollLocked(document)).toBe(false);
  });

  it("keeps both in the tree when the consumer asked, marked closed", async () => {
    mount(<Scene keepMounted />);
    await settle();

    expect(part("content").dataset.state).toBe("closed");
    expect(part("backdrop").dataset.state).toBe("closed");
    // Mounted is not open: nothing was taken from the page.
    expect(isScrollLocked(document)).toBe(false);
  });
});

describe("dialog — the parenthood only React can infer", () => {
  /**
   * The inner dialog is opened from its trigger rather than mounted open, and that is
   * not incidental. React runs layout effects child-first, so two dialogs that mount
   * open in the same commit register in the stack inner-then-outer — inverted, with the
   * parent on top. Opening from a trigger is both what a user does and the order the
   * layer stack is meant to see.
   */
  const Nested = (): ReactNode => (
    <Scene
      defaultOpen
      title="Outer"
      triggerLabel="Open outer"
      body={<Scene title="Inner" triggerLabel="Open inner" />}
    />
  );

  async function openNested(): Promise<void> {
    mount(<Nested />);
    await settle();
    const trigger = [
      ...document.querySelectorAll<HTMLElement>('[data-part~="dialog:trigger"]'),
    ].find((node) => node.textContent === "Open inner");
    if (trigger === undefined) throw new Error("the nested trigger did not render");
    fire(() => trigger.click());
    await settle();
  }

  it("declares the dialog it was opened from as its parent, without being told", async () => {
    await openNested();

    expect(contents()).toHaveLength(2);
    expect(titled("Inner")?.hasAttribute("data-nested")).toBe(true);
    expect(titled("Outer")?.hasAttribute("data-nested")).toBe(false);
  });

  /**
   * The whole point of the derived `parentId`. Both surfaces are portalled to the body,
   * so they are DOM siblings and `contains` cannot tell that one belongs to the other.
   * The consumer declared nothing; the React context did it. Without it, a press inside
   * the nested dialog is an outside interaction and takes its parent down.
   */
  it("does not treat a press inside the nested surface as an outside interaction", async () => {
    await openNested();
    const inner = titled("Inner");
    if (inner === null) throw new Error("the nested dialog did not render");

    press(inner);
    await settle();

    expect(contents()).toHaveLength(2);
    expect(titled("Outer")).not.toBeNull();
  });

  /**
   * The dialog used to declare its parenthood on a context private to its own
   * module, so only another dialog could read it. Every other overlay family opened
   * from inside one — popover, menu, tooltip — registered as a root layer, and a
   * press inside it read as an interaction outside the dialog and dismissed it.
   *
   * The probe is not a dialog part on purpose: it proves the channel is shared, not
   * merely that two dialogs still find each other, which the tests above already say.
   */
  it("publishes its layer to whatever opens inside it, not only to another dialog", async () => {
    mount(<Scene defaultOpen body={<LayerProbe />} />);
    await settle();

    expect(probedLayer()).toBe(part("content").id);
  });

  it("leaves a surface with nothing above it to register as a root layer", async () => {
    mount(<LayerProbe />);
    await settle();

    expect(probedLayer()).toBeUndefined();
  });

  it("gives Escape to the top layer only", async () => {
    await openNested();

    pressEscape();

    await waitFor(() => expect(contents()).toHaveLength(1));
    expect(titled("Outer")).not.toBeNull();
  });

  /**
   * The regression test for the inverted stack. Layout effects run child-first, so
   * mounting both dialogs open registers the inner layer *before* the outer one. Until
   * `layer-stack.ts` started sorting on declared parenthood, the parent landed on top of
   * its own child: one Escape dismissed the outer surface and unmounted the inner one
   * with it, and the pile the whole overlay family rests on was upside down.
   */
  it("keeps that order even when both mount open in the same commit", async () => {
    mount(
      <Scene
        defaultOpen
        title="Outer"
        triggerLabel="Open outer"
        body={<Scene defaultOpen title="Inner" triggerLabel="Open inner" />}
      />,
    );
    await settle();
    expect(contents()).toHaveLength(2);

    pressEscape();

    await waitFor(() => expect(contents()).toHaveLength(1));
    expect(titled("Outer")).not.toBeNull();
  });
});

describe("dialog — the gamepad, through the provider", () => {
  let input: InputSystem | null = null;

  function Capture(): ReactNode {
    const system = useInputSystem();
    useEffect(() => {
      input = system;
    }, [system]);
    return null;
  }

  const pad = (intent: "back" | "moveDown"): void => {
    fire(() => {
      input?.emit({ intent, source: "gamepad" });
    });
  };

  afterEach(() => {
    input = null;
  });

  async function openWithPad(props: SceneProps = {}): Promise<void> {
    mount(
      <NavProvider>
        <Capture />
        <Scene {...props} />
      </NavProvider>,
    );
    await settle();
    fire(() => part("trigger").click());
    await settle();
  }

  it("closes on B, on the scope taken from the nearest provider", async () => {
    const onDismiss = vi.fn();
    await openWithPad({ onDismiss });

    pad("back");

    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    await waitFor(() => expect(query("content")).toBeNull());
  });

  it("answers no pad at all when the consumer says so", async () => {
    await openWithPad({ intents: null });

    pad("back");
    await settle();

    // `??` would have overridden an explicit `null` back to the provider's system.
    expect(query("content")).not.toBeNull();
  });

  /**
   * The regression test for the dead B button. The provider builds its system in an
   * effect, so a dialog mounted already open enters `open` on a commit where
   * `intents` is still `null` — and `captureIntents` is a state effect the interpreter
   * never re-installs, so it stayed deaf for the rest of its life. What the machine is
   * handed is now a stable scope host that re-opens the scope when the system lands.
   */
  it("answers B when it was already open on the provider's first commit", async () => {
    const onDismiss = vi.fn();
    mount(
      <NavProvider>
        <Capture />
        <Scene defaultOpen onDismiss={onDismiss} />
      </NavProvider>,
    );
    await settle();

    pad("back");

    expect(onDismiss).toHaveBeenCalledWith({ reason: "back" });
    await waitFor(() => expect(query("content")).toBeNull());
  });

  /** R43: the trap swallowed `select`, so the emulated click of A never landed. */
  async function focusedAction(
    props: SceneProps,
  ): Promise<{ button: HTMLElement; clicks: () => number }> {
    let count = 0;
    await openWithPad({
      ...props,
      body: (
        <button type="button" id="r43-action" onClick={() => count++}>
          Apply
        </button>
      ),
    });
    // A modal's own initial focus lands two frames late and would take it back.
    if (props.modal !== false) {
      await waitFor(() => expect(part("content").contains(document.activeElement)).toBe(true));
    }
    const button = document.querySelector<HTMLElement>("#r43-action") as HTMLElement;
    fire(() => button.focus());
    await settle();
    expect(document.activeElement).toBe(button);
    return { button, clicks: () => count };
  }

  for (const modal of [true, false]) {
    it(`clicks the focused button once on A in a ${modal ? "modal" : "non-modal"} dialog`, async () => {
      const { clicks } = await focusedAction({ modal });

      let consumed: boolean | undefined;
      fire(() => {
        consumed = input?.emit({ intent: "select", source: "gamepad" }).consumed;
      });
      await settle();

      expect(consumed).toBe(false);
      expect(clicks()).toBe(1);
      expect(query("content")).not.toBeNull();
    });
  }

  it("clicks the focused button exactly once on a real Enter", async () => {
    const { clicks } = await focusedAction({});

    await realKey("{Enter}");

    expect(clicks()).toBe(1);
  });
});

describe("dialog — axe", () => {
  const THEMES = ["light", "dark"] as const;
  const DENSITIES = ["desktop", "touch"] as const;

  it("passes over the theme × density matrix", async () => {
    /*
     * Two deliberate departures from how a dialog really renders, and both are the
     * measurement's fault rather than the component's. `inPlace` keeps the surface in
     * the scoped subtree, because axe is scoped to the container and a portalled node
     * is not in it. `modal={false}` because four open modals mark *each other* inert
     * and `aria-hidden`, and axe would then be measuring that interference rather than
     * the anatomy. The real portalled modal is the test underneath this one.
     */
    const handle = mount(
      <main>
        {THEMES.map((theme) =>
          DENSITIES.map((density) => (
            <div key={`${theme}-${density}`} data-sui-theme={theme} data-sui-density={density}>
              <Scene
                inPlace
                modal={false}
                defaultOpen
                title={`${theme} ${density}`}
                triggerLabel={`Open ${theme} ${density}`}
              />
            </div>
          )),
        )}
      </main>,
    );
    await settle();

    // The name arrives with `PARTS.SYNC`, so axe must not run before it lands.
    await waitFor(() => {
      for (const content of handle.container.querySelectorAll('[data-part~="dialog:content"]')) {
        expect(content.getAttribute("aria-labelledby")).not.toBeNull();
      }
    });

    await expectNoAxeViolations(handle.container);
  });

  it("passes as a real portalled modal, named by its title", async () => {
    mount(<Scene defaultOpen />);
    await settle();
    await waitFor(() => expect(part("content").getAttribute("aria-labelledby")).not.toBeNull());

    expect(part("content").getAttribute("aria-modal")).toBe("true");
    await expectNoAxeViolations(part("positioner"));
  });

  it("passes with no title part, named by the label instead", async () => {
    mount(<Scene defaultOpen title={null} label="Rename file" />);
    await settle();

    expect(part("content").getAttribute("aria-label")).toBe("Rename file");
    expect(part("content").hasAttribute("aria-labelledby")).toBe(false);
    await expectNoAxeViolations(part("positioner"));
  });
});
