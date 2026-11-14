import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import { connect, parts } from "./empty-state";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

describe("empty-state", () => {
  it("defaults to the large-symbol presentation, with no role", () => {
    const api = connect({}, normalize);

    expect(api.variant).toBe("symbol");
    expect(api.getRootProps()).toMatchObject({
      "data-scope": "empty-state",
      "data-part": "empty-state:root",
      "data-variant": "symbol",
    });
    // A static page-level empty state is not a live region: no role at all,
    // never an empty one.
    expect(api.getRootProps().role).toBeUndefined();
    expect(api.getIndicatorProps()["data-variant"]).toBe("symbol");
  });

  it("announces as a status region only when asked", () => {
    expect(connect({ announce: true }, normalize).getRootProps().role).toBe("status");
    expect(connect({ announce: false }, normalize).getRootProps().role).toBeUndefined();
    expect(connect({}, normalize).getRootProps().role).toBeUndefined();
  });

  it("carries the circle variant on root and indicator alike", () => {
    const api = connect({ variant: "circle" }, normalize);

    expect(api.variant).toBe("circle");
    expect(api.getRootProps()["data-variant"]).toBe("circle");
    expect(api.getIndicatorProps()["data-variant"]).toBe("circle");
  });

  it("keeps the indicator decorative in every variant", () => {
    expect(connect({}, normalize).getIndicatorProps()["aria-hidden"]).toBe("true");
    expect(connect({ variant: "circle" }, normalize).getIndicatorProps()["aria-hidden"]).toBe(
      "true",
    );
  });

  it("hands every part its scope-qualified tokens", () => {
    const api = connect({}, normalize);
    const byPart: Record<string, Record<string, unknown>> = {
      root: api.getRootProps(),
      indicator: api.getIndicatorProps(),
      title: api.getTitleProps(),
      description: api.getDescriptionProps(),
      actions: api.getActionsProps(),
    };

    for (const [name, props] of Object.entries(byPart)) {
      expect(props["data-scope"]).toBe("empty-state");
      expect(props["data-part"]).toBe(`empty-state:${name}`);
    }
  });

  it("emits no ARIA where the element already is the semantics", () => {
    const api = connect({}, normalize);

    // The title is a heading, the actions hold ordinary buttons: naming, focus
    // and order are the elements' own business, so nothing is focusable here.
    for (const props of [
      api.getRootProps(),
      api.getTitleProps(),
      api.getDescriptionProps(),
      api.getActionsProps(),
    ]) {
      expect(props.tabIndex).toBeUndefined();
      expect(props["aria-labelledby"]).toBeUndefined();
    }
    expect(api.getTitleProps().role).toBeUndefined();
    expect(api.getActionsProps().role).toBeUndefined();
  });

  it("publishes selectors the styles can use", () => {
    expect(parts.root.selector).toBe('[data-part~="empty-state:root"]');
    expect(parts.indicator.selector).toBe('[data-part~="empty-state:indicator"]');
    expect(parts.title.selector).toBe('[data-part~="empty-state:title"]');
    expect(parts.description.selector).toBe('[data-part~="empty-state:description"]');
    expect(parts.actions.selector).toBe('[data-part~="empty-state:actions"]');
  });
});
