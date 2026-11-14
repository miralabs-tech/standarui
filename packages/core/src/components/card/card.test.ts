import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import { type CardApi, type CardPart, type CardVariant, connect, parts } from "./card";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

const PART_NAMES: readonly CardPart[] = [
  "root",
  "header",
  "title",
  "description",
  "action",
  "body",
  "footer",
];

const VARIANTS: readonly CardVariant[] = ["raised", "filled", "inset", "glass"];

function getters(api: CardApi<Plain>): Record<CardPart, Record<string, unknown>> {
  return {
    root: api.getRootProps(),
    header: api.getHeaderProps(),
    title: api.getTitleProps(),
    description: api.getDescriptionProps(),
    action: api.getActionProps(),
    body: api.getBodyProps(),
    footer: api.getFooterProps(),
  };
}

describe("card", () => {
  it("is a raised, role-less surface by default", () => {
    const props = connect({}, normalize).getRootProps();

    expect(props).toMatchObject({
      "data-scope": "card",
      "data-part": "card:root",
      "data-variant": "raised",
    });
    expect(props["data-sui-on-glass"]).toBeUndefined();
    // No APG pattern exists for "card": the root claims no role and no aria-*,
    // and the semantics come from what is composed inside.
    expect(props.role).toBeUndefined();
    expect(Object.keys(props).filter((key) => key.startsWith("aria-"))).toEqual([]);
  });

  it("stamps every part with its own scope-qualified token and nothing else", () => {
    const emitted = getters(connect({}, normalize));

    for (const part of PART_NAMES) {
      expect(emitted[part]).toMatchObject(parts[part].attrs);
      expect(emitted[part].role).toBeUndefined();
      expect(Object.keys(emitted[part]).filter((key) => key.startsWith("aria-"))).toEqual([]);
    }
  });

  it("declares the on-glass context only when it applies the material", () => {
    for (const variant of VARIANTS) {
      const props = connect({ variant }, normalize).getRootProps();
      expect(props["data-sui-on-glass"]).toBe(variant === "glass" ? "" : undefined);
    }
  });

  it("always publishes the variant it was given", () => {
    for (const variant of VARIANTS) {
      const api = connect({ variant }, normalize);
      expect(api.variant).toBe(variant);
      expect(api.getRootProps()["data-variant"]).toBe(variant);
    }
  });

  it("publishes a selector per part the styles can use", () => {
    for (const part of PART_NAMES) {
      expect(parts[part].selector).toBe(`[data-part~="card:${part}"]`);
    }
  });
});
