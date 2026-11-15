/**
 * The accordion through React: the measurement, the exit, and axe.
 *
 * The machine is proved in `packages/core/src/components/accordion` — the
 * keyboard, the single/multiple rules, find-in-page and the deferred `hidden` all
 * live there, against the same DOM this file renders into. Two things only an
 * adapter can get right are proved here instead.
 *
 * **The order.** A machine's watchers have to run *after* the commit that painted
 * `data-state` (architecture.md, règles dures). `useMachine` puts them in a layout
 * effect, so when `syncCollapses` measures a panel that is opening, the panel has
 * already lost its `hidden` and `scrollHeight` is a real number. The reference
 * reactivity in the core harness runs its trackers first and cannot show this —
 * it would only be reporting on its own ordering — so the open-side measurement
 * is asserted here and nowhere else.
 *
 * **The exit, against a real animation.** Nothing else in this harness loads a
 * stylesheet, so the sheet below is the two rules under test in miniature: an
 * animation keyed on `data-state`, and a close that only runs while the panel is
 * still visible. Without them the presence would finish on the very next frame
 * and would be indistinguishable from no presence at all.
 */

import { act, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  AccordionBody,
  AccordionContent,
  AccordionHeader,
  AccordionIndicator,
  AccordionItem,
  AccordionRoot,
  type AccordionRootProps,
  AccordionTrigger,
  useAccordionContext,
} from "./accordion";

/**
 * The shipped recipe, reduced to what is being asserted. The close is keyed on
 * `:not([hidden])` for the same reason the real sheet is: a panel at rest always
 * carries the attribute, and one that is leaving never does — so the animation
 * exists exactly while there is something to animate.
 */
const SHEET = `
  [data-part~="accordion:content"] { overflow: hidden; }
  [data-part~="accordion:content"][data-state="open"]:not([data-immediate]) {
    animation: sui-test-open 80ms linear;
  }
  [data-part~="accordion:content"][data-state="closed"]:not([hidden]) {
    animation: sui-test-close 80ms linear forwards;
  }
  [data-slow] [data-part~="accordion:content"][data-state="closed"]:not([hidden]) {
    animation-duration: 900ms;
  }
  @keyframes sui-test-open {
    from { height: 0 } to { height: var(--sui-collapse-height, 0px) }
  }
  @keyframes sui-test-close {
    from { height: var(--sui-collapse-height, 0px) } to { height: 0 }
  }
`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = SHEET;
  document.head.append(style);
});

const SECTIONS = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "team", label: "Team" },
];

interface SettingsProps extends AccordionRootProps {
  readonly disabledItem?: string;
}

function Settings(props: SettingsProps): React.ReactNode {
  const { disabledItem, ...root } = props;
  return (
    <AccordionRoot {...root}>
      {SECTIONS.map((section) => (
        <AccordionItem
          key={section.value}
          value={section.value}
          disabled={section.value === disabledItem}
        >
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path
                    d="M4 2l4 4-4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </AccordionIndicator>
              {section.label}
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>
              <p>The {section.label.toLowerCase()} panel, with a paragraph of its own.</p>
              <a href={`#${section.value}`}>Jump to the {section.label.toLowerCase()} section</a>
            </AccordionBody>
          </AccordionContent>
        </AccordionItem>
      ))}
    </AccordionRoot>
  );
}

function part(container: ParentNode, name: string, value: string): HTMLElement {
  const node = queryParts(container, name).find((candidate) => candidate.dataset.value === value);
  if (node === undefined) throw new Error(`no ${name} for "${value}"`);
  return node;
}

function trigger(container: ParentNode, value: string): HTMLButtonElement {
  return part(container, "trigger", value) as HTMLButtonElement;
}

function heightVar(node: HTMLElement): number {
  return Number.parseFloat(node.style.getPropertyValue("--sui-collapse-height"));
}

afterEach(() => {
  unmountAll();
});

describe("accordion in React — the measurement", () => {
  it("measures a panel that has already lost its `hidden`", async () => {
    const { container } = mount(<Settings />);
    await settle();
    const panel = part(container, "content", "general");

    fire(() => trigger(container, "general").click());

    // The whole "DOM before watch" rule, in one number. React committed the open
    // state, the panel came out of `display: none`, and only then did the watcher
    // measure it. Run the watchers first and this is 0 — an exit that exists in
    // the machine and never on the screen.
    expect(heightVar(panel)).toBeGreaterThan(0);
    expect(heightVar(panel)).toBeCloseTo(panel.scrollHeight, 0);
  });

  it("re-measures on the way out, because the panel may have grown", async () => {
    function Growing(): React.ReactNode {
      return (
        <AccordionRoot defaultValue={["general"]}>
          <AccordionItem value="general">
            <AccordionHeader>
              <AccordionTrigger>General</AccordionTrigger>
            </AccordionHeader>
            <AccordionContent>
              <AccordionBody>
                <p style={{ blockSize: "240px" }}>tall</p>
              </AccordionBody>
            </AccordionContent>
          </AccordionItem>
        </AccordionRoot>
      );
    }

    const { container } = mount(<Growing />);
    await settle();
    const panel = part(container, "content", "general");

    fire(() => trigger(container, "general").click());

    expect(heightVar(panel)).toBeGreaterThanOrEqual(240);
  });
});

describe("accordion in React — the exit", () => {
  it("holds `hidden` back until the close animation is over", async () => {
    const { container } = mount(<Settings defaultValue={["general"]} />);
    await settle();
    const panel = part(container, "content", "general");

    fire(() => trigger(container, "general").click());

    // Still in the layout, still animating. `hidden` is `display: none`, which
    // would cancel the animation instead of waiting for it.
    expect(panel.getAttribute("data-state")).toBe("closed");
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(panel.getAnimations().length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(panel.hasAttribute("hidden")).toBe(true);
    });
  });

  it("cancels the exit when the same panel is re-opened mid-flight", async () => {
    const { container } = mount(<Settings defaultValue={["general"]} />);
    await settle();
    const panel = part(container, "content", "general");

    fire(() => trigger(container, "general").click());
    fire(() => trigger(container, "general").click());

    await settle();
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(panel.getAttribute("data-state")).toBe("open");

    // And it stays open: a presence whose exit was cancelled must not report one
    // a frame later and take the panel with it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(panel.hasAttribute("hidden")).toBe(false);
  });

  it("never unmounts a panel, open or closed", async () => {
    const { container } = mount(<Settings />);
    await settle();

    // The price of `hidden="until-found"`, of a server render with no flash, and
    // of an `aria-controls` that always resolves.
    expect(queryParts(container, "content")).toHaveLength(3);
    expect(queryPart(part(container, "item", "team"), "body")?.textContent).toContain("team panel");
  });

  it("does not animate what a `defaultValue` opened", async () => {
    const { container } = mount(<Settings defaultValue={["general"]} />);
    const panel = part(container, "content", "general");

    // The gate is on the markup React committed, not something an effect brings
    // later: it is seeded during `createService`, before the first `connect`.
    expect(panel.getAttribute("data-immediate")).toBe("");
    expect(panel.getAnimations()).toHaveLength(0);

    await settle();
    expect(panel.getAttribute("data-immediate")).toBe("");
  });
});

/** A "Done" inside the panel, closing it through the api. */
function CloseFromInside(props: { readonly value: string }): React.ReactNode {
  const api = useAccordionContext();
  return (
    <button type="button" data-slot="inside" onClick={() => api.close(props.value)}>
      Done
    </button>
  );
}

/** One panel, closed from inside it (api or controlled parent) or from outside. */
function Closable(props: {
  readonly controlled?: boolean;
  readonly disabled?: boolean;
}): React.ReactNode {
  const [value, setValue] = useState<readonly string[]>(["general"]);
  const root =
    props.controlled === true
      ? { value, onValueChange: (d: { value: readonly string[] }) => setValue(d.value) }
      : { defaultValue: ["general"] };
  return (
    <>
      <AccordionRoot {...root}>
        <AccordionItem value="general" disabled={props.disabled === true}>
          <AccordionHeader>
            <AccordionTrigger>General</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>
              {props.controlled === true ? (
                <button type="button" data-slot="inside" onClick={() => setValue([])}>
                  Done
                </button>
              ) : (
                <CloseFromInside value="general" />
              )}
            </AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
      <button type="button" data-slot="outside" onClick={() => setValue([])}>
        Close
      </button>
    </>
  );
}

function slot(container: ParentNode, name: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no ${name}`);
  return node;
}

describe("accordion in React — a panel that is leaving (R132)", () => {
  it("refuses the focus while its exit runs, and a Tab from its header steps past it", async () => {
    const { container } = mount(
      <div data-slow="">
        <Settings defaultValue={["general"]} />
      </div>,
    );
    await settle();
    const panel = part(container, "content", "general");
    const link = panel.querySelector("a") as HTMLAnchorElement;

    // Positive control: open, the same call lands.
    fire(() => link.focus());
    expect(document.activeElement).toBe(link);

    fire(() => trigger(container, "general").focus());
    fire(() => trigger(container, "general").click());

    expect(panel.getAttribute("data-state")).toBe("closed");
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(trigger(container, "general").getAttribute("aria-expanded")).toBe("false");
    expect(panel.closest("[inert]")).not.toBeNull();

    fire(() => link.focus());
    expect(document.activeElement).toBe(trigger(container, "general"));

    await act(async () => {
      await userEvent.tab();
    });
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(trigger(container, "billing"));
  });

  it("gives the focus back to a panel re-opened mid-exit, and after a full exit", async () => {
    const { container } = mount(
      <div data-slow="">
        <Settings defaultValue={["general"]} />
      </div>,
    );
    await settle();
    const panel = part(container, "content", "general");
    const link = panel.querySelector("a") as HTMLAnchorElement;

    fire(() => trigger(container, "general").click());
    expect(panel.hasAttribute("inert")).toBe(true);
    fire(() => trigger(container, "general").click());

    expect(panel.getAttribute("data-state")).toBe("open");
    expect(panel.hasAttribute("inert")).toBe(false);
    fire(() => link.focus());
    expect(document.activeElement).toBe(link);

    fire(() => trigger(container, "general").click());
    await waitFor(() => {
      expect(panel.hasAttribute("hidden")).toBe(true);
    });
    expect(panel.hasAttribute("inert")).toBe(false);
    fire(() => trigger(container, "general").click());
    expect(panel.hasAttribute("inert")).toBe(false);
    fire(() => link.focus());
    expect(document.activeElement).toBe(link);
  });

  it("is not inert while open, nor at rest closed, where `until-found` must stay findable", async () => {
    const { container } = mount(<Settings hiddenUntilFound defaultValue={["general"]} />);
    await settle();

    expect(part(container, "content", "general").hasAttribute("inert")).toBe(false);
    expect(part(container, "content", "billing").getAttribute("hidden")).toBe("until-found");
    expect(part(container, "content", "billing").hasAttribute("inert")).toBe(false);
  });
});

describe("accordion in React — closing around the focus (R132)", () => {
  it("hands the focus to the panel's header when a button inside closes it", async () => {
    const { container } = mount(
      <div data-slow="">
        <Closable />
      </div>,
    );
    await settle();
    fire(() => slot(container, "inside").focus());
    expect(document.activeElement).toBe(slot(container, "inside"));

    fire(() => slot(container, "inside").click());

    expect(document.activeElement).toBe(trigger(container, "general"));
    await waitFor(() => {
      expect(part(container, "content", "general").hasAttribute("hidden")).toBe(true);
    });
    expect(document.activeElement).toBe(trigger(container, "general"));
  });

  it("does the same on a controlled close the parent makes from inside", async () => {
    const { container } = mount(<Closable controlled />);
    await settle();
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());

    await waitFor(() => {
      expect(part(container, "content", "general").hasAttribute("hidden")).toBe(true);
    });
    expect(document.activeElement).toBe(trigger(container, "general"));
  });

  it("does the same under motion none, where the panel goes hidden at once", async () => {
    const { container } = mount(
      <div data-motion="none">
        <Closable />
      </div>,
    );
    await settle();
    fire(() => slot(container, "inside").focus());
    fire(() => slot(container, "inside").click());
    await settle();

    expect(part(container, "content", "general").hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(trigger(container, "general"));
  });

  it("hands the focus to the next tab stop when the header was disabled while open", async () => {
    const handle = mount(
      <div data-slow="">
        <Closable />
      </div>,
    );
    const { container } = handle;
    await settle();
    fire(() => slot(container, "inside").focus());
    handle.render(
      <div data-slow="">
        <Closable disabled />
      </div>,
    );
    expect(trigger(container, "general").disabled).toBe(true);
    expect(document.activeElement).toBe(slot(container, "inside"));

    // `close` goes through `VALUE.SET`, which no disabled header guards.
    fire(() => slot(container, "inside").click());

    expect(document.activeElement).toBe(slot(container, "outside"));
    await waitFor(() => {
      expect(part(container, "content", "general").hasAttribute("hidden")).toBe(true);
    });
    expect(document.activeElement).toBe(slot(container, "outside"));
  });

  it("leaves a focus that is elsewhere where it is", async () => {
    const { container } = mount(<Closable controlled />);
    await settle();
    const outside = slot(container, "outside");
    fire(() => outside.focus());
    fire(() => outside.click());

    await waitFor(() => {
      expect(part(container, "content", "general").hasAttribute("hidden")).toBe(true);
    });
    expect(document.activeElement).toBe(outside);
  });
});

describe("accordion in React — find-in-page", () => {
  /**
   * The attribute has to be the *string*, and it has to still be the string
   * after React has had a turn at rewriting it. react-dom keeps `hidden` on its
   * boolean list, so handing it the keyword produced `hidden=""` and the feature
   * this suite advertises never existed; `normalize-props` now writes the value
   * back from a callback ref, in the layout phase of the very commit that set
   * `hidden`. The open → close → reveal walk below is what proves the write
   * survives that boundary rather than only the first paint.
   */
  it("marks a closed panel findable when the consumer opted in", async () => {
    const { container } = mount(<Settings hiddenUntilFound />);
    await settle();
    const panel = part(container, "content", "general");

    expect(panel.getAttribute("hidden")).toBe("until-found");

    fire(() => trigger(container, "general").click());
    expect(panel.hasAttribute("hidden")).toBe(false);

    // Closed again: React removes nothing here, it *writes* `hidden` — and the
    // keyword has to be what is left standing once the exit has run.
    fire(() => trigger(container, "general").click());
    await waitFor(() => {
      expect(panel.getAttribute("hidden")).toBe("until-found");
    });

    // And what Ctrl+F does on a word inside it: the browser announces the match
    // on the still-hidden panel, and the machine opens it for real.
    fire(() => {
      panel.dispatchEvent(new Event("beforematch", { bubbles: true, composed: true }));
    });
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(panel.getAttribute("data-state")).toBe("open");
  });

  /**
   * The consumer's own `ref` used to *replace* the part's, because `mergeProps`
   * is later-wins and React 19 carries `ref` as a plain prop — so passing one
   * dropped the callback that writes the keyword and the panel fell back to a
   * plain `hidden`: still hidden, still animated, silently unfindable. `useRender`
   * chains the two now. This is the guard for every part, written on the one
   * where the loss is observable.
   */
  it("keeps the keyword when the consumer puts their own ref on the panel", async () => {
    let seen: HTMLElement | null = null;
    const { container } = mount(
      <AccordionRoot hiddenUntilFound>
        <AccordionItem value="general">
          <AccordionHeader>
            <AccordionTrigger>General</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent
            ref={(node: HTMLElement | null) => {
              seen = node;
            }}
          >
            <AccordionBody>A word to find.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>,
    );
    await settle();
    const panel = part(container, "content", "general");

    // Both refs ran: the consumer got the node, and the part still wrote the value.
    expect(seen).toBe(panel);
    expect(panel.getAttribute("hidden")).toBe("until-found");
  });

  it("opens on the event the browser fires before it reveals the text", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(<Settings hiddenUntilFound onValueChange={onValueChange} />);
    await settle();
    const panel = part(container, "content", "billing");

    fire(() => {
      panel.dispatchEvent(new Event("beforematch", { bubbles: true, composed: true }));
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(panel.hasAttribute("hidden")).toBe(false);
    // Revealed rather than chosen: the browser is already scrolling to the line,
    // and an expansion under that scroll would move it.
    expect(panel.getAttribute("data-immediate")).toBe("");
    expect(panel.getAnimations()).toHaveLength(0);
  });
});

describe("accordion in React — a11y", () => {
  it("passes axe closed, open, and with a disabled item", async () => {
    const closed = mount(<Settings />);
    const open = mount(<Settings multiple defaultValue={["general", "team"]} />);
    const disabled = mount(<Settings defaultValue={["general"]} disabledItem="billing" />);
    await settle();

    await expectNoAxeViolations(closed.container);
    await expectNoAxeViolations(open.container);
    await expectNoAxeViolations(disabled.container);
  });

  it("leaves no IDREF unresolved — which axe calls incomplete, not a violation", async () => {
    const { container } = mount(<Settings defaultValue={["general"]} />);
    await settle();

    const { run } = await import("axe-core");
    const results = await run(container, {
      resultTypes: ["violations", "incomplete"],
      rules: { "color-contrast": { enabled: false } },
    });

    // The lesson from `menu`: a dead `aria-controls` is classed `incomplete`, not
    // `violation`, so a suite that only reads violations would ship one.
    expect(results.incomplete.map((entry) => entry.id)).toEqual([]);
    expect(results.violations.map((entry) => entry.id)).toEqual([]);
  });

  it("names the panel from its own header, in both directions", async () => {
    const { container } = mount(<Settings defaultValue={["general"]} />);
    await settle();

    const header = trigger(container, "general");
    const panel = part(container, "content", "general");

    expect(header.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(header.id);
    expect(panel.getAttribute("role")).toBe("region");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    // The trigger lives inside the heading, which is what APG asks for and what
    // makes the accordion navigable by heading in a screen reader.
    expect(header.parentElement?.tagName).toBe("H3");
  });

  it("takes the heading level the consumer's page needs", async () => {
    const { container } = mount(
      <AccordionRoot>
        <AccordionItem value="general">
          <AccordionHeader
            render={
              <h2>
                <AccordionTrigger>General</AccordionTrigger>
              </h2>
            }
          />
          <AccordionContent>
            <AccordionBody>panel</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>,
    );
    await settle();

    expect(trigger(container, "general").parentElement?.tagName).toBe("H2");
  });
});
