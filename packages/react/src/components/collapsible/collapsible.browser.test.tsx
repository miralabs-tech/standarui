/**
 * The disclosure through React: the ordering, the mount, and axe.
 *
 * The machine is proved in `packages/core/src/components/collapsible`. What only
 * an adapter can get right is the *order* — React commits the DOM, then runs the
 * layout effect that plays the watchers, so the entry action measures a node
 * that already exists and already carries its new `data-state`. The reference
 * reactivity runs its trackers before its listeners and cannot make that claim
 * (see the head of the core's `reactivity.ts`), which is why the measurement
 * under `keepMounted` is asserted here and not there.
 *
 * The other adapter-only question is which content exists at all: unmounted
 * after its exit, kept and `hidden`, and whether `aria-controls` ever names an
 * element that is not in the document.
 */

import { act, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EnvironmentProvider } from "../../environment";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleRoot,
  type CollapsibleRootProps,
  CollapsibleTrigger,
  useCollapsibleContext,
} from "./collapsible";

/**
 * A real exit for the presence to wait on. Nothing in this harness loads the
 * design system's sheet, so without these two rules the content would leave on
 * the very next frame and the presence would be indistinguishable from a plain
 * unmount (the trap this repository has already paid for once).
 */
const SHEET = `
  [data-part~="collapsible:content"] { opacity: 1; transition: opacity 80ms linear; }
  [data-part~="collapsible:content"][data-state="closed"] { opacity: 0; }
  [data-slot="body"] { margin: 0; block-size: 40px; }
  [data-slow] [data-part~="collapsible:content"][data-state="closed"] {
    animation: sui-test-leave 900ms linear;
  }
  @keyframes sui-test-leave { from { opacity: 1 } to { opacity: 0 } }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

interface DetailsProps extends CollapsibleRootProps {
  readonly label?: string;
}

function Details(props: DetailsProps): React.ReactNode {
  const { label = "Reasoning", children, ...root } = props;
  return (
    <CollapsibleRoot {...root}>
      <CollapsibleTrigger>
        <CollapsibleIndicator />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>{children ?? <p data-slot="body" />}</CollapsibleContent>
    </CollapsibleRoot>
  );
}

const trigger = (container: ParentNode): HTMLButtonElement => {
  const node = queryPart<HTMLButtonElement>(container, "trigger");
  if (node === null) throw new Error("no trigger");
  return node;
};

const contentOf = (id: string): HTMLElement | null =>
  document.getElementById(`collapsible:${id}:content`);

const measured = (node: HTMLElement): string =>
  node.style.getPropertyValue("--sui-collapsible-height");

/** Every `aria-controls` on the page, and whether it names something real. */
function danglingControls(container: ParentNode): string[] {
  return [...container.querySelectorAll("[aria-controls]")]
    .map((node) => node.getAttribute("aria-controls") ?? "")
    .filter((id) => document.getElementById(id) === null);
}

afterEach(() => {
  unmountAll();
});

describe("CollapsibleRoot — what exists, and when", () => {
  it("builds no content while closed, and names none from the trigger", () => {
    const { container } = mount(<Details id="d" />);

    expect(queryPart(container, "content")).toBeNull();
    expect(trigger(container).hasAttribute("aria-controls")).toBe(false);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(danglingControls(container)).toEqual([]);
  });

  it("mounts the content on the opening click and moves all four parts with it", () => {
    const onOpenChange = vi.fn();
    const { container } = mount(<Details id="d" onOpenChange={onOpenChange} />);

    fire(() => trigger(container).click());

    const content = queryPart(container, "content");
    expect(content).not.toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[{ open: true }]]);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");
    expect(trigger(container).getAttribute("aria-controls")).toBe("collapsible:d:content");
    expect(danglingControls(container)).toEqual([]);

    for (const part of ["root", "trigger", "indicator", "content"]) {
      expect(queryPart(container, part)?.getAttribute("data-state")).toBe("open");
    }
  });

  it("posts the measurement in the same commit that mounted the node", () => {
    const { container } = mount(<Details id="d" />);

    fire(() => trigger(container).click());

    const content = contentOf("d");
    expect(content).not.toBeNull();
    // The adapter's whole contract in one assertion: the node exists, and the
    // variable the sheet's keyframes travel to is already on it.
    expect(measured(content as HTMLElement)).toMatch(/^[\d.]+px$/);
    expect(Number.parseFloat(measured(content as HTMLElement))).toBeGreaterThanOrEqual(40);
    expect((content as HTMLElement).style.getPropertyValue("--sui-collapsible-width")).toMatch(
      /^[\d.]+px$/,
    );
  });

  it("keeps the content in the tree until its exit has run, then lets it go", async () => {
    const { container } = mount(<Details id="d" defaultOpen />);
    expect(queryPart(container, "content")).not.toBeNull();

    fire(() => trigger(container).click());

    // Never an intermediate `data-state` — the exit is a race this suite cannot
    // win on every engine. What is asserted is the end of it.
    await waitFor(() => {
      expect(queryPart(container, "content")).toBeNull();
    });
    expect(trigger(container).hasAttribute("aria-controls")).toBe(false);
    expect(danglingControls(container)).toEqual([]);
  });

  it("re-measures at the closing boundary, on content that grew while it was open", () => {
    const { container } = mount(<Details id="d" defaultOpen />);
    // Held across the close on purpose: the presence keeps the node in the tree
    // while it leaves, and the element's own inline style outlives the unmount.
    const content = contentOf("d") as HTMLElement;
    const opened = Number.parseFloat(measured(content));

    // What a streamed answer does while its disclosure is open.
    const grown = document.createElement("p");
    grown.style.cssText = "margin:0;block-size:60px";
    content.append(grown);

    fire(() => trigger(container).click());

    // The reading the exit keyframes start from is taken fresh at the boundary,
    // not remembered from the opening — which is what makes a disclosure that
    // grew while open collapse from where it actually is.
    expect(Number.parseFloat(measured(content))).toBeCloseTo(opened + 60, 0);
  });
});

describe("CollapsibleContent — keepMounted", () => {
  it("holds the node and hides it, rather than unmounting it", async () => {
    const { container } = mount(<Details id="d" keepMounted />);
    const content = contentOf("d") as HTMLElement;

    expect(content).not.toBeNull();
    expect(content.hasAttribute("hidden")).toBe(true);
    // A kept content is named all the same: the IDREF resolves, so the trigger's
    // `aria-controls` is honest while closed too.
    expect(trigger(container).getAttribute("aria-controls")).toBe("collapsible:d:content");
    expect(danglingControls(container)).toEqual([]);

    fire(() => trigger(container).click());
    await settle();

    expect(content.hasAttribute("hidden")).toBe(false);
    // The ordering claim the core harness cannot make: the attribute came off in
    // the commit, and the watcher that measures ran after it.
    expect(Number.parseFloat(measured(content))).toBeGreaterThanOrEqual(40);
  });

  it("takes a closed kept content out of the a11y tree and out of the tab order", async () => {
    const { container } = mount(
      <Details id="d" keepMounted>
        <button type="button">Inside</button>
      </Details>,
    );
    const content = contentOf("d") as HTMLElement;

    expect(content.hasAttribute("hidden")).toBe(true);
    // `hidden` is a UA-origin `display: none`, so nothing inside generates a box —
    // which is what takes it out of the a11y tree and out of the tab order alike.
    expect(content.querySelector("button")?.getClientRects().length).toBe(0);
    await expectNoAxeViolations(container);
  });
});

describe("CollapsibleContent — data-immediate", () => {
  it("is there on a defaultOpen first paint and gone from the first real toggle on", async () => {
    const { container } = mount(<Details id="d" defaultOpen keepMounted />);
    const content = contentOf("d") as HTMLElement;

    expect(content.getAttribute("data-immediate")).toBe("");

    fire(() => trigger(container).click());
    await settle();
    expect(content.hasAttribute("data-immediate")).toBe(false);

    fire(() => trigger(container).click());
    await settle();
    expect(content.hasAttribute("data-immediate")).toBe(false);
  });

  it("is absent from a content that only ever arrived by choice", () => {
    const { container } = mount(<Details id="d" />);

    fire(() => trigger(container).click());

    expect(contentOf("d")?.hasAttribute("data-immediate")).toBe(false);
  });
});

describe("Collapsible — nesting", () => {
  it("lets a parent at rest absorb a child that opens, without re-measuring itself", async () => {
    const { container } = mount(
      <Details id="parent" label="Parent" defaultOpen>
        <Details id="child" label="Child" />
      </Details>,
    );

    const parent = contentOf("parent") as HTMLElement;
    const before = measured(parent);
    const height = parent.getBoundingClientRect().height;

    const child = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent === "Child",
    );
    fire(() => child?.click());
    await settle();

    expect(contentOf("child")).not.toBeNull();
    // At rest the content is `block-size: auto` — the variables feed the
    // keyframes and nothing else, so growth follows on its own. No ResizeObserver
    // ran, and the parent's reading is untouched.
    expect(measured(parent)).toBe(before);
    expect(parent.getBoundingClientRect().height).toBeGreaterThan(height);
  });
});

describe("Collapsible — the trigger", () => {
  it("is a plain disabled button, and goes nowhere", () => {
    const onOpenChange = vi.fn();
    const { container } = mount(<Details id="d" disabled onOpenChange={onOpenChange} />);

    expect(trigger(container).disabled).toBe(true);
    expect(trigger(container).hasAttribute("aria-disabled")).toBe(false);
    expect(trigger(container).getAttribute("data-disabled")).toBe("");

    fire(() => trigger(container).click());

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(queryPart(container, "content")).toBeNull();
  });

  it("rings for a keyboard modality and stays quiet for a pointer one", () => {
    const { container } = mount(<Details id="d" />);
    const button = trigger(container);

    fire(() => {
      document.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
      );
      button.focus();
    });
    expect(button.hasAttribute("data-focus-visible")).toBe(false);
    expect(button.getAttribute("data-focus-source")).toBe("pointer");

    fire(() => button.blur());
    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      button.focus();
    });
    expect(button.getAttribute("data-focus-visible")).toBe("");
    expect(button.getAttribute("data-focus-source")).toBe("keyboard");

    fire(() => button.blur());
    expect(button.hasAttribute("data-focus-source")).toBe(false);
  });

  it("follows a controlled open back down without ever writing it", async () => {
    const onOpenChange = vi.fn();
    const handle = mount(<Details id="d" open={false} onOpenChange={onOpenChange} />);

    fire(() => trigger(handle.container).click());

    expect(onOpenChange).toHaveBeenCalledWith({ open: true });
    expect(queryPart(handle.container, "content")).toBeNull();

    handle.render(<Details id="d" open onOpenChange={onOpenChange} />);
    await settle();

    expect(contentOf("d")).not.toBeNull();
    expect(Number.parseFloat(measured(contentOf("d") as HTMLElement))).toBeGreaterThanOrEqual(40);
  });
});

/** A button inside the content that closes it through the api, as a "Done" would. */
function CloseFromInside(): React.ReactNode {
  const api = useCollapsibleContext();
  return (
    <button type="button" data-slot="inside" onClick={() => api.setOpen(false)}>
      Done
    </button>
  );
}

/** A controlled disclosure closed by its parent, from inside it or from outside. */
function Controlled(props: { readonly keepMounted?: boolean }): React.ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Details
        id="d"
        open={open}
        keepMounted={props.keepMounted}
        onOpenChange={(details) => setOpen(details.open)}
      >
        <button type="button" data-slot="inside" onClick={() => setOpen(false)}>
          Done
        </button>
      </Details>
      <button type="button" data-slot="outside" onClick={() => setOpen(false)}>
        Close
      </button>
    </>
  );
}

const slot = (container: ParentNode, name: string): HTMLButtonElement => {
  const node = container.querySelector<HTMLButtonElement>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no ${name}`);
  return node;
};

describe("CollapsibleContent — a content that is leaving (R132)", () => {
  it("refuses the focus while its exit runs, and a Tab from the trigger steps past it", async () => {
    const { container } = mount(
      <div data-slow="">
        <Details id="d" defaultOpen>
          <button type="button" data-slot="inside">
            Inside
          </button>
        </Details>
        <button type="button" data-slot="after">
          After
        </button>
      </div>,
    );
    // A painted frame first, so the close starts from a rendered box and the
    // `data-slow` exit animation has something to run on.
    await settle();
    const inside = slot(container, "inside");

    // Positive control: open, the same call lands.
    fire(() => inside.focus());
    expect(document.activeElement).toBe(inside);

    fire(() => trigger(container).focus());
    fire(() => trigger(container).click());

    // Still in the tree, already announced as collapsed: the window under test.
    expect(contentOf("d")?.getAttribute("data-state")).toBe("closed");
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(inside.closest("[inert]")).not.toBeNull();

    fire(() => inside.focus());
    expect(document.activeElement).toBe(trigger(container));

    await act(async () => {
      await userEvent.tab();
    });
    // The Tab ran inside the exit, not after the unmount.
    expect(contentOf("d")).not.toBeNull();
    expect(document.activeElement).toBe(slot(container, "after"));
  });

  it("gives the focus back to a content re-opened mid-exit", async () => {
    const { container } = mount(
      <div data-slow="">
        <Details id="d" defaultOpen>
          <button type="button" data-slot="inside">
            Inside
          </button>
        </Details>
      </div>,
    );
    await settle();

    fire(() => trigger(container).click());
    expect(contentOf("d")?.hasAttribute("inert")).toBe(true);
    fire(() => trigger(container).click());

    const content = contentOf("d") as HTMLElement;
    expect(content.getAttribute("data-state")).toBe("open");
    expect(content.hasAttribute("inert")).toBe(false);
    fire(() => slot(container, "inside").focus());
    expect(document.activeElement).toBe(slot(container, "inside"));
  });

  it("is not inert while open, nor while kept and closed (hidden already covers it)", () => {
    mount(<Details id="d" defaultOpen />);
    expect(contentOf("d")?.hasAttribute("inert")).toBe(false);

    unmountAll();
    mount(<Details id="d" keepMounted />);
    expect(contentOf("d")?.hasAttribute("hidden")).toBe(true);
    expect(contentOf("d")?.hasAttribute("inert")).toBe(false);
  });
});

describe("CollapsibleContent — closing around the focus (R132)", () => {
  it("hands the focus to the trigger when a button inside closes it", async () => {
    const { container } = mount(
      <div data-slow="">
        <Details id="d" defaultOpen>
          <CloseFromInside />
        </Details>
      </div>,
    );
    const inside = slot(container, "inside");
    fire(() => inside.focus());
    expect(document.activeElement).toBe(inside);

    fire(() => inside.click());

    expect(contentOf("d")).not.toBeNull();
    expect(document.activeElement).toBe(trigger(container));
    await waitFor(() => {
      expect(contentOf("d")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger(container));
  });

  it("does the same on a controlled close the parent makes from inside", async () => {
    const { container } = mount(
      <div data-slow="">
        <Controlled />
      </div>,
    );
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());

    expect(document.activeElement).toBe(trigger(container));
    await waitFor(() => {
      expect(contentOf("d")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger(container));
  });

  it("does the same on a kept content, which goes hidden at once", async () => {
    const { container } = mount(<Controlled keepMounted />);
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());
    await settle();

    expect(contentOf("d")?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger(container));
  });

  it("does the same under motion none, where the content leaves in the same commit", async () => {
    const { container } = mount(
      <EnvironmentProvider motion="none">
        <Controlled />
      </EnvironmentProvider>,
    );
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());
    await settle();

    expect(contentOf("d")).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it("does the same on an uncontrolled close under motion none", async () => {
    const { container } = mount(
      <EnvironmentProvider motion="none">
        <Details id="d" defaultOpen>
          <CloseFromInside />
        </Details>
      </EnvironmentProvider>,
    );
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());
    await settle();

    expect(contentOf("d")).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it("does the same on an uncontrolled close of a kept content", async () => {
    const { container } = mount(
      <Details id="d" defaultOpen keepMounted>
        <CloseFromInside />
      </Details>,
    );
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());
    await settle();

    expect(contentOf("d")?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger(container));
  });

  it("hands the focus to the next tab stop when the trigger was disabled while open", async () => {
    const fixture = (disabled: boolean): React.ReactNode => (
      <div data-slow="">
        <Details id="d" defaultOpen disabled={disabled}>
          <CloseFromInside />
        </Details>
        <button type="button" data-slot="after">
          After
        </button>
      </div>
    );
    const handle = mount(fixture(false));
    const { container } = handle;
    fire(() => slot(container, "inside").focus());
    handle.render(fixture(true));
    expect(trigger(container).disabled).toBe(true);
    expect(document.activeElement).toBe(slot(container, "inside"));

    // `OPEN.SET` is unguarded: `disabled` disables the trigger, not the api.
    fire(() => slot(container, "inside").click());

    expect(contentOf("d")).not.toBeNull();
    expect(document.activeElement).toBe(slot(container, "after"));
    await waitFor(() => {
      expect(contentOf("d")).toBeNull();
    });
    expect(document.activeElement).toBe(slot(container, "after"));
  });

  it("leaves a focus that is elsewhere where it is", async () => {
    const { container } = mount(<Controlled />);
    const outside = slot(container, "outside");
    fire(() => outside.focus());
    fire(() => outside.click());
    await waitFor(() => {
      expect(contentOf("d")).toBeNull();
    });
    expect(document.activeElement).toBe(outside);
  });

  it("leaves a focus that is nowhere where it is", async () => {
    const { container } = mount(<Controlled />);
    fire(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
    fire(() => slot(container, "outside").click());
    await waitFor(() => {
      expect(contentOf("d")).toBeNull();
    });
    expect(document.activeElement).toBe(document.body);
  });
});

describe("Collapsible — direction and a11y", () => {
  it("carries dir onto the root and the content", () => {
    const { container } = mount(<Details id="d" dir="rtl" defaultOpen />);

    expect(queryPart(container, "root")?.getAttribute("dir")).toBe("rtl");
    expect(queryPart(container, "content")?.getAttribute("dir")).toBe("rtl");
  });

  it("passes axe closed and open", async () => {
    const { container } = mount(<Details id="d" />);

    await expectNoAxeViolations(container);

    fire(() => trigger(container).click());
    await settle();

    await expectNoAxeViolations(container);
  });
});
