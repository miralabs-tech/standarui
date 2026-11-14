import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import {
  connect,
  parts,
  type SidebarApi,
  type SidebarPart,
  type SidebarPlacement,
  type SidebarPresentation,
} from "./sidebar";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
  button: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

const PART_NAMES: readonly SidebarPart[] = [
  "root",
  "header",
  "headerLabel",
  "content",
  "section",
  "sectionHeader",
  "group",
  "item",
  "link",
  "leading",
  "label",
  "trailing",
  "footer",
  "footerLabel",
  "trigger",
  "drawer",
];

const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const PRESENTATIONS: readonly SidebarPresentation[] = ["auto", "inline", "drawer"];
const PLACEMENTS: readonly SidebarPlacement[] = ["inline", "drawer"];

function getters(api: SidebarApi<Plain>): Record<SidebarPart, Record<string, unknown>> {
  return {
    root: api.getRootProps(),
    header: api.getHeaderProps(),
    headerLabel: api.getHeaderLabelProps(),
    content: api.getContentProps(),
    section: api.getSectionProps(),
    sectionHeader: api.getSectionHeaderProps(),
    group: api.getGroupProps(),
    item: api.getItemProps(),
    link: api.getLinkProps(),
    leading: api.getLeadingProps(),
    label: api.getLabelProps(),
    trailing: api.getTrailingProps(),
    footer: api.getFooterProps(),
    footerLabel: api.getFooterLabelProps(),
    trigger: api.getTriggerProps(),
    drawer: api.getDrawerProps(),
  };
}

describe("sidebar", () => {
  it("is a named navigation container, inline and automatic by default", () => {
    const props = connect({ label: "Library" }, normalize).getRootProps();

    expect(props).toMatchObject({
      "data-scope": "sidebar",
      "data-part": "sidebar:root",
      "aria-label": "Library",
      "data-presentation": "auto",
      "data-placement": "inline",
      "data-snav": "container",
    });
  });

  it("stamps every part with its own scope-qualified token", () => {
    const emitted = getters(connect({}, normalize));

    for (const part of PART_NAMES) {
      expect(emitted[part]).toMatchObject(parts[part].attrs);
      expect(parts[part].selector).toBe(`[data-part~="sidebar:${kebab(part)}"]`);
    }
  });

  it("emits no id on any part, because the adapter renders the parts twice", () => {
    const emitted = getters(connect({ label: "Library" }, normalize));

    for (const part of PART_NAMES) {
      expect("id" in emitted[part], part).toBe(false);
    }
  });

  it("gives the group the list role and no other part a role", () => {
    const emitted = getters(connect({}, normalize));

    for (const part of PART_NAMES) {
      expect(emitted[part].role, part).toBe(part === "group" ? "list" : undefined);
    }
  });

  it("publishes the presentation on the root and on the trigger, whatever it is", () => {
    for (const presentation of PRESENTATIONS) {
      const api = connect({ presentation }, normalize);

      expect(api.presentation).toBe(presentation);
      expect(api.getRootProps()["data-presentation"]).toBe(presentation);
      expect(api.getTriggerProps()["data-presentation"]).toBe(presentation);
    }
  });

  it("publishes the placement it is asked for, inline otherwise", () => {
    const api = connect({}, normalize);

    expect(api.getRootProps({})["data-placement"]).toBe("inline");
    for (const placement of PLACEMENTS) {
      expect(api.getRootProps({ placement })["data-placement"]).toBe(placement);
    }
  });

  it("gives the on-glass palette to the inline root alone", () => {
    const api = connect({}, normalize);

    expect(api.getRootProps()["data-sui-on-glass"]).toBe("");
    expect(api.getRootProps({ placement: "drawer" })["data-sui-on-glass"]).toBeUndefined();
  });

  it("marks the current page on the link with aria-current and on the item with data-current", () => {
    const api = connect({}, normalize);

    expect(api.getLinkProps()["aria-current"]).toBeUndefined();
    expect(api.getLinkProps({ current: false })["aria-current"]).toBeUndefined();
    expect(api.getLinkProps({ current: true })["aria-current"]).toBe("page");
    expect(api.getLinkProps({ current: true })["data-current"]).toBe("");
    expect(api.getLinkProps({ current: true })["aria-selected"]).toBeUndefined();
    expect(api.getItemProps()["data-current"]).toBeUndefined();
    expect(api.getItemProps({ current: true })["data-current"]).toBe("");
  });

  it("keeps a disabled link in the tab order and cancels its activation", () => {
    const api = connect({}, normalize);
    const enabled = api.getLinkProps();
    const disabled = api.getLinkProps({ disabled: true });

    expect(enabled["aria-disabled"]).toBeUndefined();
    expect(enabled["data-disabled"]).toBeUndefined();
    expect(disabled["aria-disabled"]).toBe("true");
    expect(disabled["data-disabled"]).toBe("");
    expect("tabIndex" in disabled).toBe(false);
    expect("disabled" in disabled).toBe(false);

    const event = { preventDefault: () => (cancelled += 1) };
    let cancelled = 0;
    (enabled.onClick as (event: unknown) => void)(event);
    expect(cancelled).toBe(0);
    (disabled.onClick as (event: unknown) => void)(event);
    expect(cancelled).toBe(1);
  });

  it("describes the trigger as a button that opens a dialog, without aria-controls", () => {
    const api = connect({}, normalize);

    expect(api.getTriggerProps()).toMatchObject({
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "data-state": "closed",
    });
    expect(api.getTriggerProps({ open: true })).toMatchObject({
      "aria-expanded": "true",
      "data-state": "open",
    });
    expect("aria-controls" in api.getTriggerProps({ open: true })).toBe(false);
  });
});
