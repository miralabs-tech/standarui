/**
 * The listbox through React, and only what an adapter can get wrong: the parts it
 * renders, the two bands it adds, the composition it has to survive, and the
 * controlled path.
 *
 * Every rule about *which* row wins — the roving order, the ranges, the typeahead,
 * the focus rescue — is proved against a real engine with no framework at all in
 * `packages/core/src/components/listbox/listbox.browser.test.ts`.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputSystem } from "../../nav";
import { NavProvider, useInputSystem } from "../../nav";
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
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
} from "../dialog/dialog";
import {
  ListboxContent,
  ListboxItem,
  ListboxItemGroup,
  ListboxItemGroupLabel,
  ListboxItemIndicator,
  ListboxItemText,
  ListboxLabel,
  ListboxRoot,
  type ListboxRootProps,
} from "./listbox";

afterEach(() => unmountAll());

const PEOPLE = [
  { value: "ada", label: "Ada Lovelace" },
  { value: "alan", label: "Alan Turing" },
  { value: "grace", label: "Grace Hopper", disabled: true },
];

/**
 * The checkmark is an inline SVG and never a `✓` character: text stands on its
 * font's baseline inside the centred line box, so its ink paints below the box's
 * centre while a viewBox fills the square.
 */
function Check(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function People(props: Omit<ListboxRootProps, "children">): React.ReactNode {
  return (
    <ListboxRoot {...props}>
      <ListboxLabel>People</ListboxLabel>
      <ListboxContent>
        <ListboxItemGroup id="pioneers" label>
          <ListboxItemGroupLabel>Pioneers</ListboxItemGroupLabel>
          {PEOPLE.map((person) => (
            <ListboxItem key={person.value} value={person.value} disabled={person.disabled}>
              <ListboxItemText>{person.label}</ListboxItemText>
              <ListboxItemIndicator>
                <Check />
              </ListboxItemIndicator>
            </ListboxItem>
          ))}
        </ListboxItemGroup>
      </ListboxContent>
    </ListboxRoot>
  );
}

const row = (container: HTMLElement, value: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(`[data-value="${value}"]`);
  if (node === null) throw new Error(`no row for "${value}"`);
  return node;
};

describe("listbox in React", () => {
  it("renders every part under its own scope-qualified token", async () => {
    const { container } = mount(<People defaultValue={["ada"]} />);
    await settle();

    expect(queryPart(container, "root")).not.toBeNull();
    expect(queryPart(container, "label")?.textContent).toBe("People");
    expect(queryPart(container, "content")?.getAttribute("role")).toBe("listbox");
    expect(queryPart(container, "item-group")?.getAttribute("role")).toBe("group");
    expect(queryPart(container, "item-group-label")?.textContent).toBe("Pioneers");
    expect(queryParts(container, "item")).toHaveLength(3);
    expect(queryPart(container, "item")?.getAttribute("role")).toBe("option");
    // The state is `aria-selected` on the row; the glyph is hidden so the two can
    // never disagree.
    expect(queryPart(container, "item-indicator")?.getAttribute("aria-hidden")).toBe("true");
    expect(queryPart(container, "item-indicator")?.dataset.state).toBe("selected");

    // The group names itself through a label that is really rendered — never a
    // dangling IDREF, which names nothing and which axe grades `incomplete`.
    const group = queryPart(container, "item-group");
    const groupLabel = queryPart(container, "item-group-label");
    expect(group?.getAttribute("aria-labelledby")).toBe(groupLabel?.id);
  });

  it("draws the scroll bands inside the scroller and outside the collection", async () => {
    const { container } = mount(<People />);
    await settle();

    const content = queryPart(container, "content");
    const bands = content?.querySelectorAll("[data-scroll-edge]") ?? [];
    expect(bands).toHaveLength(2);
    for (const band of bands) {
      expect(band.getAttribute("aria-hidden")).toBe("true");
      // Decoration, not a part: nothing composes into it and nothing renders
      // inside it, so it stays out of the anatomy and out of the roving list.
      expect(band.hasAttribute("data-part")).toBe(false);
    }
    // Outermost on both sides: the first row is what slides under the top band.
    expect(content?.firstElementChild?.getAttribute("data-scroll-edge")).toBe("up");
    expect(content?.lastElementChild?.getAttribute("data-scroll-edge")).toBe("down");
  });

  it("reports without writing when the value is controlled", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(<People value={["ada"]} onValueChange={onValueChange} />);
    await settle();

    fire(() => row(container, "alan").click());
    await settle();

    expect(onValueChange).toHaveBeenCalledWith({ value: ["alan"] });
    // The consumer owns the value: nothing moved until they say so.
    expect(row(container, "ada").getAttribute("aria-selected")).toBe("true");
    expect(row(container, "alan").getAttribute("aria-selected")).toBe("false");
  });

  it("reports the act of selecting even when the value does not move", async () => {
    const onSelect = vi.fn();
    const onValueChange = vi.fn();
    const { container } = mount(<People onSelect={onSelect} onValueChange={onValueChange} />);
    await settle();

    fire(() => row(container, "ada").click());
    fire(() => row(container, "ada").click());
    await settle();

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("keeps a part's identity through a substituted element", async () => {
    const { container } = mount(
      <ListboxRoot>
        <ListboxLabel render={<h2 className="heading">People</h2>} />
        <ListboxContent>
          <ListboxItem value="ada">
            <ListboxItemText>Ada Lovelace</ListboxItemText>
          </ListboxItem>
        </ListboxContent>
      </ListboxRoot>,
    );
    await settle();

    const label = queryPart(container, "label");
    expect(label?.tagName).toBe("H2");
    expect(label?.className).toBe("heading");
    // A heading the listbox is named by has to keep something to read out.
    expect(label?.textContent).toBe("People");
  });

  it("lets a consumer's own handler veto the machine's", async () => {
    const onValueChange = vi.fn();
    const { container } = mount(
      <ListboxRoot onValueChange={onValueChange}>
        <ListboxContent>
          <ListboxItem value="ada" onClick={(event) => event.preventDefault()}>
            <ListboxItemText>Ada Lovelace</ListboxItemText>
          </ListboxItem>
        </ListboxContent>
      </ListboxRoot>,
    );
    await settle();

    fire(() => row(container, "ada").click());
    await settle();

    // The consumer's handler runs first, and `preventDefault` is a real veto —
    // `mergeProps`' ordering rule, held at the part boundary.
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("passes axe in both modes", async () => {
    const single = mount(<People defaultValue={["ada"]} />);
    await settle();
    await expectNoAxeViolations(single.container);

    const multiple = mount(<People selectionMode="multiple" defaultValue={["ada", "alan"]} />);
    await settle();
    await expectNoAxeViolations(multiple.container);
  });
});

/**
 * R17: the list's scope opens at mount, before the dialog's trap around it, and
 * only `within` on both lets the trap still ask it.
 */
describe("listbox in React — the pad inside a modal dialog", () => {
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

  it("still moves the highlight on the d-pad", async () => {
    mount(
      <NavProvider>
        <Capture />
        <DialogRoot defaultOpen>
          <DialogPortal>
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Pick someone</DialogTitle>
                <People />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </NavProvider>,
    );
    await settle();

    // The trap's own initial focus lands two frames late; focusing first would
    // let it take the focus back off the row before the pad is pressed.
    const content = document.querySelector('[data-part~="dialog:content"]');
    await waitFor(() => expect(content?.contains(document.activeElement)).toBe(true));
    const ada = row(document.body, "ada");
    fire(() => ada.focus());
    await settle();
    expect(document.activeElement).toBe(ada);

    fire(() => input?.emit({ intent: "moveDown", source: "gamepad" }));
    await settle();

    expect(document.activeElement).toBe(row(document.body, "alan"));
  });
});
