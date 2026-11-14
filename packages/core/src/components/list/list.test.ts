import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import { connect, type ListApi, type ListPart, type ListVariant, parts } from "./list";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

const PART_NAMES: readonly ListPart[] = [
  "root",
  "section",
  "header",
  "group",
  "row",
  "action",
  "leading",
  "title",
  "subtitle",
  "trailing",
  "footer",
];

const VARIANTS: readonly ListVariant[] = ["inset", "plain"];

function getters(api: ListApi<Plain>): Record<ListPart, Record<string, unknown>> {
  return {
    root: api.getRootProps(),
    section: api.getSectionProps(),
    header: api.getHeaderProps(),
    group: api.getGroupProps(),
    row: api.getRowProps(),
    action: api.getActionProps(),
    leading: api.getLeadingProps(),
    title: api.getTitleProps(),
    subtitle: api.getSubtitleProps(),
    trailing: api.getTrailingProps(),
    footer: api.getFooterProps(),
  };
}

describe("list", () => {
  it("is an inset, role-less root by default", () => {
    const props = connect({}, normalize).getRootProps();

    expect(props).toMatchObject({
      "data-scope": "list",
      "data-part": "list:root",
      "data-variant": "inset",
    });
    expect(props.role).toBeUndefined();
    expect(Object.keys(props).filter((key) => key.startsWith("aria-"))).toEqual([]);
  });

  it("stamps every part with its own scope-qualified token and a role on the group alone", () => {
    const emitted = getters(connect({}, normalize));

    for (const part of PART_NAMES) {
      expect(emitted[part]).toMatchObject(parts[part].attrs);
      expect(emitted[part].role).toBe(part === "group" ? "list" : undefined);
      expect(Object.keys(emitted[part]).filter((key) => key.startsWith("aria-"))).toEqual([]);
    }
  });

  it("always publishes the variant it was given", () => {
    for (const variant of VARIANTS) {
      const api = connect({ variant }, normalize);
      expect(api.variant).toBe(variant);
      expect(api.getRootProps()["data-variant"]).toBe(variant);
    }
  });

  it("sizes a row regular unless it is asked for tall", () => {
    const api = connect({}, normalize);

    expect(api.getRowProps()["data-size"]).toBe("regular");
    expect(api.getRowProps({})["data-size"]).toBe("regular");
    expect(api.getRowProps({ size: "regular" })["data-size"]).toBe("regular");
    expect(api.getRowProps({ size: "tall" })["data-size"]).toBe("tall");
  });

  it("writes data-chevron none only when the row withdraws its chevron", () => {
    const api = connect({}, normalize);

    expect(api.getRowProps()["data-chevron"]).toBeUndefined();
    expect(api.getRowProps({ chevron: "auto" })["data-chevron"]).toBeUndefined();
    expect(api.getRowProps({ chevron: "none" })["data-chevron"]).toBe("none");
  });

  it("writes data-size on the row alone", () => {
    const emitted = getters(connect({}, normalize));

    for (const part of PART_NAMES) {
      expect("data-size" in emitted[part]).toBe(part === "row");
    }
  });

  it("publishes a selector per part the styles can use", () => {
    for (const part of PART_NAMES) {
      expect(parts[part].selector).toBe(`[data-part~="list:${part}"]`);
    }
  });
});
