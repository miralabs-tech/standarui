/**
 * The select through React, and only what an adapter can get wrong: the portal,
 * the presences, the mounted-by-default content, the `<option>` mirror and the
 * field wiring. The machine itself is proved in
 * `packages/core/src/components/select`.
 *
 * The axe passes are the DoD's a11y line on the real component: the closed
 * combobox, the open listbox (separators as `role="none"` — the
 * `aria-required-children` divergence this component exists to get right), and
 * the sheet with its cancel card *outside* the listbox.
 */

import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  realKey,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import { FieldLabel, FieldRoot } from "../field";
import { Select } from "./composed";
import {
  SelectBackdrop,
  SelectCancelTrigger,
  SelectContent,
  SelectHiddenSelect,
  SelectIndicator,
  SelectItem,
  SelectItemGroup,
  SelectItemGroupLabel,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectPositioner,
  SelectRoot,
  type SelectRootProps,
  SelectSeparator,
  SelectTrigger,
  SelectValueText,
} from "./select";

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse: (
      steps: readonly { type: "move" | "down" | "up"; x: number; y: number }[],
    ) => Promise<void>;
  }
}

afterEach(() => unmountAll());

/** A trusted pointer sequence; the update it causes is scheduled by the browser. */
async function realClick(node: HTMLElement, position?: { x: number; y: number }): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    const box = node.getBoundingClientRect();
    const x = box.left + (position?.x ?? box.width / 2);
    const y = box.top + (position?.y ?? box.height / 2);
    // The queued mouse command, not userEvent.click: under Firefox a bare click
    // races the gestures other files send at the same moment (see vitest.config.ts).
    await commands.mouse([
      { type: "move", x, y },
      { type: "down", x, y },
      { type: "up", x, y },
    ]);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
}

function Check(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden focusable="false">
      <path d="M3.4 8.9l3 3 6.2-7.3" fill="none" stroke="currentColor" />
    </svg>
  );
}

function Option(props: { readonly value: string; readonly disabled?: boolean }): React.ReactNode {
  return (
    <SelectItem value={props.value} disabled={props.disabled}>
      <SelectItemIndicator>
        <Check />
      </SelectItemIndicator>
      <SelectItemText>{props.value}</SelectItemText>
    </SelectItem>
  );
}

interface DemoProps extends SelectRootProps {
  readonly cancel?: boolean;
  /** Only the axe scenes pass one — see `landmarkedPortalHost`. */
  readonly portalContainer?: Element | null;
}

function Demo(props: DemoProps): React.ReactNode {
  const { cancel, portalContainer, children, ...root } = props;
  return (
    // Named by default: a `role="combobox"` takes no name from its contents, and
    // since 2026-09-05 the machine warns about a nameless trigger — a fixture that
    // rendered one was the very shape the warning exists for. A scene that passes
    // its own `label` still wins (the spread comes after).
    <SelectRoot label="Fruit" {...root}>
      <SelectTrigger>
        <SelectValueText placeholder="Pick a fruit" />
        <SelectIndicator>
          <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden focusable="false">
            <path d="M4 6l4-3 4 3M4 10l4 3 4-3" fill="none" stroke="currentColor" />
          </svg>
        </SelectIndicator>
      </SelectTrigger>
      <SelectHiddenSelect />
      <SelectPortal container={portalContainer}>
        <SelectBackdrop />
        <SelectPositioner>
          <SelectContent>
            <SelectItemGroup id="fruits" label>
              <SelectItemGroupLabel>Fruits</SelectItemGroupLabel>
              <Option value="apple" />
              <Option value="banana" />
            </SelectItemGroup>
            <SelectSeparator />
            <Option value="cherry" disabled />
          </SelectContent>
          {cancel === true ? <SelectCancelTrigger>Cancel</SelectCancelTrigger> : null}
        </SelectPositioner>
      </SelectPortal>
      {children}
    </SelectRoot>
  );
}

describe("select in React", () => {
  it("keeps the content mounted while closed — the keepMounted inversion", async () => {
    mount(<Demo defaultValue="banana" />);
    await settle();

    // Closed, and yet everything is there: the trigger's IDREF resolves, the
    // mirror knows the selection, and the trigger already wears its label.
    const trigger = queryPart(document.body, "trigger");
    const content = queryPart(document.body, "content");
    expect(content).not.toBeNull();
    expect(content?.getAttribute("data-state")).toBe("closed");
    expect(trigger?.getAttribute("aria-controls")).toBe(content?.id);
    expect(trigger?.textContent).toContain("banana");
  });

  it("can still opt out of the mount, the way menu and popover default", async () => {
    mount(<Demo keepMounted={false} />);
    await settle();

    expect(queryPart(document.body, "content")).toBeNull();
  });

  // What the opt-out costs: no item is rendered, so no label is ever captured,
  // and a closed trigger that holds a value reads as if it held none.
  it("shows the placeholder over a value once unmounted, until the caller names the value", async () => {
    mount(<Demo keepMounted={false} defaultValue="banana" />);
    await settle();
    expect(queryPart(document.body, "trigger")?.textContent).toBe("Pick a fruit");
    unmountAll();

    mount(
      <Select
        label="Fruit"
        placeholder="Pick a fruit"
        options={[{ value: "banana", label: "Banana" }]}
        keepMounted={false}
        defaultValue="banana"
        parts={{ valueText: { children: "Banana" } }}
      />,
    );
    await settle();
    expect(queryPart(document.body, "trigger")?.textContent).toBe("Banana");
  });

  it("shows the placeholder until a value exists, then the captured label", async () => {
    mount(<Demo />);
    await settle();

    const trigger = queryPart(document.body, "trigger");
    expect(trigger?.textContent).toContain("Pick a fruit");
    expect(trigger?.getAttribute("data-placeholder")).toBe("");

    fire(() => trigger?.click());
    await settle();
    fire(() => queryPart(document.body, "item")?.click());
    await waitFor(() => {
      expect(queryPart(document.body, "trigger")?.getAttribute("data-state")).toBe("closed");
    });

    expect(trigger?.textContent).toContain("apple");
    expect(trigger?.hasAttribute("data-placeholder")).toBe(false);
  });

  it("mirrors exactly one option into the native select", async () => {
    mount(<Demo name="fruit" defaultValue="banana" />);
    await settle();

    const mirror = queryPart<HTMLSelectElement>(document.body, "hidden-select");
    expect(mirror?.tagName).toBe("SELECT");
    expect(mirror?.options.length).toBe(1);
    expect(mirror?.value).toBe("banana");
    expect(mirror?.getAttribute("aria-hidden")).toBe("true");
    expect(mirror?.tabIndex).toBe(-1);
  });

  it("fails native validation while required and empty", async () => {
    function Host(): React.ReactNode {
      return (
        <form data-testid="form">
          <Demo name="fruit" required />
        </form>
      );
    }
    mount(<Host />);
    await settle();

    const form = document.querySelector<HTMLFormElement>('[data-testid="form"]');
    expect(form?.checkValidity()).toBe(false);
  });

  it("opens onto a surface its effects can already find, focus and all", async () => {
    mount(<Demo />);
    fire(() => queryPart(document.body, "trigger")?.click());
    await settle();

    const content = queryPart(document.body, "content");
    expect(content?.getAttribute("role")).toBe("listbox");
    expect(content?.hasAttribute("aria-activedescendant")).toBe(false);
    await waitFor(() => {
      expect(content?.contains(document.activeElement)).toBe(true);
    });
    expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
  });

  it("renders the cancel card in the sheet only, and outside the listbox", async () => {
    mount(<Demo presentation="sheet" cancel defaultOpen />);
    await settle();

    const cancel = queryPart(document.body, "cancel-trigger");
    const content = queryPart(document.body, "content");
    expect(cancel).not.toBeNull();
    expect(content?.contains(cancel)).toBe(false);
    expect(queryPart(document.body, "backdrop")).not.toBeNull();

    unmountAll();
    mount(<Demo presentation="popup" cancel defaultOpen />);
    await settle();
    expect(queryPart(document.body, "cancel-trigger")).toBeNull();
    expect(queryPart(document.body, "backdrop")).toBeNull();
  });

  /**
   * R59: the cancel card is a sibling of the listbox, so a real press on it used
   * to land outside the dismissable layer — `outside-pointer` instead of `back`,
   * and under `closeOnInteractOutside={false}` the swallowed click left the
   * button dead. A trusted pointer sequence, because `element.click()` sends no
   * pointerdown and the layer never sees it. The press focuses the cancel, which
   * sits beside the listbox: the restore must still hand the focus to the trigger.
   */
  for (const closeOnInteractOutside of [true, false]) {
    it(`a real press on the sheet's cancel closes with "back" and refocuses the trigger (closeOnInteractOutside=${closeOnInteractOutside})`, async () => {
      const reasons: string[] = [];
      mount(
        <Demo
          presentation="sheet"
          cancel
          defaultOpen
          closeOnInteractOutside={closeOnInteractOutside}
          onDismiss={(details) => reasons.push(details.reason)}
        />,
      );
      await settle();

      const cancel = queryPart(document.body, "cancel-trigger");
      if (cancel === null) throw new Error("no cancel trigger");
      await realClick(cancel);

      await waitFor(() =>
        expect(queryPart(document.body, "trigger")?.getAttribute("aria-expanded")).toBe("false"),
      );
      expect(reasons).toEqual(["back"]);
      await waitFor(() => expect(document.activeElement).toBe(queryPart(document.body, "trigger")));
    });
  }

  /**
   * R59 without the shipped stylesheet (decision 01): a consumer's own sheet whose
   * positioner covers the viewport and takes the pointer. A press beside the
   * listbox lands on the positioner, outside the surface, and must still close
   * with `outside-pointer` — so only the cancel may leave the outside set.
   */
  it("a press on a full-viewport positioner beside the listbox closes with outside-pointer, without the stylesheet", async () => {
    const style = document.createElement("style");
    style.textContent =
      '[data-part~="select:positioner"]{position:fixed;inset:0;display:flex;align-items:flex-end}';
    document.head.append(style);
    try {
      const reasons: string[] = [];
      mount(
        <Demo
          presentation="sheet"
          cancel
          defaultOpen
          onDismiss={(details) => reasons.push(details.reason)}
        />,
      );
      await settle();

      const positioner = queryPart(document.body, "positioner");
      if (positioner === null) throw new Error("no positioner");
      expect(document.elementFromPoint(8, 8)).toBe(positioner);
      await realClick(positioner, { x: 8, y: 8 });

      await waitFor(() =>
        expect(queryPart(document.body, "trigger")?.getAttribute("aria-expanded")).toBe("false"),
      );
      expect(reasons).toEqual(["outside-pointer"]);
    } finally {
      style.remove();
    }
  });

  it("inherits the field's wiring: the label names the trigger, the flags reach the machine", async () => {
    mount(
      <FieldRoot invalid required>
        <FieldLabel>Fruit</FieldLabel>
        <Demo />
      </FieldRoot>,
    );
    await settle();

    const trigger = queryPart(document.body, "trigger");
    const label = document.querySelector("label");
    // The trigger is the labelable control, so it wears the field's control id
    // and `label[for]` resolves natively.
    expect(label?.getAttribute("for")).toBe(trigger?.id);
    expect(trigger?.getAttribute("aria-invalid")).toBe("true");
    expect(trigger?.getAttribute("aria-required")).toBe("true");
    expect(trigger?.getAttribute("data-invalid")).toBe("");
  });
});

describe("select in React — a modal select inside a modal dialog", () => {
  function Scene(props: { readonly after: boolean }): React.ReactNode {
    return (
      <DialogRoot defaultOpen>
        <DialogPortal>
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Document</DialogTitle>
              <button type="button">Before</button>
              {/* Unmounted while closed: a kept-mounted surface is already in the
                  DOM when the dialog opens, and the dialog's own `hideOthers`
                  makes it inert — a separate defect this scene does not cover. */}
              <Demo modal keepMounted={false} />
              {props.after ? <button type="button">After</button> : null}
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    );
  }

  async function openInDialog(after: boolean): Promise<HTMLElement | null> {
    mount(<Scene after={after} />);
    await settle();
    await waitFor(() => {
      expect(
        document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
      ).toBe(true);
    });
    const trigger = queryPart(document.body, "trigger");
    fire(() => trigger?.click());
    await settle();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
    });
    return trigger;
  }

  async function settledFocus(): Promise<Element | null> {
    await waitFor(() => {
      expect(queryPart(document.body, "trigger")?.getAttribute("data-state")).toBe("closed");
    });
    await settle();
    return document.activeElement;
  }

  it("Tab commits, closes and lands on the control after the trigger", async () => {
    const trigger = await openInDialog(true);
    await realKey("{Tab}");
    const focused = await settledFocus();
    expect(focused?.textContent).toBe("After");
    expect(trigger?.textContent).toContain("apple");
  });

  it("Shift+Tab commits, closes and lands on the trigger", async () => {
    const trigger = await openInDialog(true);
    await realKey("{Shift>}{Tab}{/Shift}");
    const focused = await settledFocus();
    expect(focused).toBe(trigger);
    expect(trigger?.textContent).toContain("apple");
  });

  it("Tab from the last control of the dialog lands on the trigger", async () => {
    const trigger = await openInDialog(false);
    await realKey("{Tab}");
    const focused = await settledFocus();
    expect(focused).toBe(trigger);
  });
});

describe("select in React — a modal select whose open is controlled", () => {
  type Policy = "refuse" | "accept-later";
  const control: { setOpen: (open: boolean) => void; setSheet: (sheet: boolean) => void } = {
    setOpen: () => {},
    setSheet: () => {},
  };

  function Controlled(props: { readonly policy: Policy }): React.ReactNode {
    const [open, setOpen] = useState(false);
    const [sheet, setSheet] = useState(false);
    control.setOpen = setOpen;
    control.setSheet = setSheet;
    return (
      <Demo
        modal
        keepMounted={false}
        open={open}
        presentation={sheet ? "sheet" : "popup"}
        onOpenChange={(details) => {
          if (details.open) setOpen(true);
          else if (props.policy === "accept-later") setTimeout(() => setOpen(false), 30);
        }}
      />
    );
  }

  function Scene(props: { readonly policy: Policy; readonly dialog: boolean }): React.ReactNode {
    const body = (
      <>
        <button type="button">Before</button>
        <Controlled policy={props.policy} />
        <button type="button">After</button>
      </>
    );
    if (!props.dialog) return body;
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

  async function openControlled(policy: Policy, dialog: boolean): Promise<HTMLElement | null> {
    mount(<Scene policy={policy} dialog={dialog} />);
    await settle();
    if (dialog) {
      await waitFor(() => {
        expect(
          document.querySelector('[data-part~="dialog:content"]')?.contains(document.activeElement),
        ).toBe(true);
      });
    }
    const trigger = queryPart(document.body, "trigger");
    // Focused first, as a real press would: the restore goes back to whatever
    // held the focus when the select opened.
    fire(() => trigger?.focus());
    fire(() => trigger?.click());
    await settle();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-value")).toBe("apple");
    });
    return trigger;
  }

  async function refusedTab(): Promise<void> {
    await realKey("{Tab}");
    await settle();
    expect(queryPart(document.body, "trigger")?.getAttribute("data-state")).toBe("open");
  }

  async function closedFocus(): Promise<Element | null> {
    await waitFor(() => {
      expect(queryPart(document.body, "trigger")?.getAttribute("data-state")).toBe("closed");
    });
    await settle();
    return document.activeElement;
  }

  for (const dialog of [false, true]) {
    const where = dialog ? "inside a dialog" : "on the page";

    it(`a refused Tab does not steer the next Escape (${where})`, async () => {
      const trigger = await openControlled("refuse", dialog);
      await refusedTab();
      await realKey("{Escape}");
      fire(() => control.setOpen(false));
      expect(await closedFocus()).toBe(trigger);
    });

    it(`a refused Tab does not steer the next item click (${where})`, async () => {
      const trigger = await openControlled("refuse", dialog);
      await refusedTab();
      const banana = queryParts(document.body, "item").find(
        (node) => node.getAttribute("data-value") === "banana",
      );
      fire(() => banana?.click());
      await settle();
      fire(() => control.setOpen(false));
      expect(await closedFocus()).toBe(trigger);
    });

    it(`a key after a refused Tab drops the step before the parent closes (${where})`, async () => {
      const trigger = await openControlled("refuse", dialog);
      await refusedTab();
      await realKey("{ArrowDown}");
      fire(() => control.setOpen(false));
      expect(await closedFocus()).toBe(trigger);
    });

    it(`a refused Tab does not leave a presentation change (${where})`, async () => {
      await openControlled("refuse", dialog);
      await refusedTab();
      // Only the held step is watched: the restore to the trigger on a reenter is
      // the named debt of `select.machine.ts` (`PRESENTATION.SYNC`), not this one.
      const outside: string[] = [];
      const record = (event: FocusEvent): void => {
        const target = event.target as Element;
        if (target.textContent === "After") outside.push(target.outerHTML);
      };
      document.addEventListener("focusin", record, true);
      fire(() => control.setSheet(true));
      await settle();
      document.removeEventListener("focusin", record, true);
      expect(outside).toEqual([]);
      await settle();
      expect(queryPart(document.body, "trigger")?.getAttribute("data-state")).toBe("open");
      expect(queryPart(document.body, "select:content")?.contains(document.activeElement)).toBe(
        true,
      );
    });

    it(`a close the parent accepts later still lands after the trigger (${where})`, async () => {
      await openControlled("accept-later", dialog);
      await realKey("{Tab}");
      expect((await closedFocus())?.textContent).toBe("After");
    });
  }
});

/**
 * axe's `region` rule is a statement about the *page*, not about the select:
 * every content node must have a landmark above it. This fixture puts two nodes
 * straight into `<body>` — the harness's mount container and the portal — so a
 * scan of `document.body` reports both, and no ARIA the component could emit
 * would change that. `popover` runs the identical scan and passes only because
 * its surface is `role="dialog"`, which the rule accepts as a region of its own;
 * a `listbox` is not, and is not meant to be.
 *
 * So the fixture supplies the landmarks a real page would have. `<main>` around
 * the trigger is what `clipboard.browser.test.tsx:191` already does here; the
 * portal needs its own, because it is a sibling of the mount container and no
 * wrapper inside the React tree can ever reach it. `region` rather than a second
 * `<main>`, which would be a landmark violation of its own.
 *
 * Created imperatively before the mount, and that is not a style choice:
 * `Portal` resolves its container during the first render and falls back to a
 * second commit when the node is not there yet, and a surface that arrives one
 * commit late starts its machine against an empty document (the whole subject of
 * the note at the top of `packages/react/src/portal.tsx`). A host rendered by
 * React inside the same tree would land exactly in that case.
 */
function landmarkedPortalHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Select surface");
  document.body.append(host);
  return host;
}

describe("select in React — axe", () => {
  afterEach(() => {
    for (const host of document.querySelectorAll('[aria-label="Select surface"]')) host.remove();
  });

  it("closed: a named combobox, nothing hidden that should not be", async () => {
    const { container } = mount(
      <FieldRoot>
        <FieldLabel>Fruit</FieldLabel>
        <Demo defaultValue="apple" />
      </FieldRoot>,
    );
    await settle();

    await expectNoAxeViolations(container);
  });

  it("open popup: listbox, options, groups — and separators that own nothing", async () => {
    mount(
      <main>
        <Demo
          label="Fruit"
          defaultOpen
          defaultValue="apple"
          portalContainer={landmarkedPortalHost()}
        />
      </main>,
    );
    await settle();

    // The separator carries `role="none"`: with the menu's `role="separator"`
    // this run reports `aria-required-children` on the listbox.
    expect(queryPart(document.body, "separator")?.getAttribute("role")).toBe("none");
    const disabled = queryParts(document.body, "item").find(
      (node) => node.getAttribute("data-value") === "cherry",
    );
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");

    await expectNoAxeViolations(document.body);
  });

  it("open sheet: the cancel card does not pollute the listbox", async () => {
    mount(
      <main>
        <Demo
          label="Fruit"
          presentation="sheet"
          cancel
          defaultOpen
          portalContainer={landmarkedPortalHost()}
        />
      </main>,
    );
    await settle();

    await expectNoAxeViolations(document.body);
  });
});
