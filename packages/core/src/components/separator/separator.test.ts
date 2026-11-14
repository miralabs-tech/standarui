import { describe, expect, it } from "vitest";
import { createNormalizer, type PropTypes } from "../../machine/prop-types";
import { connect, parts } from "./separator";

interface Plain extends PropTypes {
  element: Record<string, unknown>;
}

const normalize = createNormalizer<Plain>((props) => props);

describe("separator", () => {
  it("is a semantic separator by default", () => {
    const props = connect({}, normalize).getRootProps();

    expect(props).toMatchObject({
      "data-scope": "separator",
      "data-part": "separator:root",
      role: "separator",
      "data-orientation": "horizontal",
    });
    // Horizontal is the implicit orientation of a separator; spelling it out adds
    // nothing an assistive technology does not already assume.
    expect(props["aria-orientation"]).toBeUndefined();
    expect(props["aria-hidden"]).toBeUndefined();
  });

  it("spells out the vertical orientation, which is not the implicit one", () => {
    const props = connect({ orientation: "vertical" }, normalize).getRootProps();

    expect(props["aria-orientation"]).toBe("vertical");
    expect(props["data-orientation"]).toBe("vertical");
  });

  it("leaves the accessibility tree entirely when decorative", () => {
    const props = connect({ decorative: true, orientation: "vertical" }, normalize).getRootProps();

    expect(props.role).toBe("none");
    expect(props["aria-hidden"]).toBe("true");
    // Nothing to orient: it is not a separator any more, only a line.
    expect(props["aria-orientation"]).toBeUndefined();
    expect(props["data-orientation"]).toBe("vertical");
  });

  it("publishes a selector the styles can use", () => {
    expect(parts.root.selector).toBe('[data-part~="separator:root"]');
  });
});
