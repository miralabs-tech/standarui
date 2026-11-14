import { describe, expect, it } from "vitest";
import { createAnatomy } from "./anatomy";

describe("createAnatomy", () => {
  it("emits the scope and part attributes plus a matching selector", () => {
    const parts = createAnatomy("toggle").parts("root", "indicator").build();

    expect(parts.root.attrs).toEqual({ "data-scope": "toggle", "data-part": "toggle:root" });
    expect(parts.root.selector).toBe('[data-part~="toggle:root"]');
  });

  it("kebab-cases part names so the SCSS reads naturally", () => {
    const parts = createAnatomy("menu").parts("itemTrigger").build();

    expect(parts.itemTrigger.attrs["data-part"]).toBe("menu:item-trigger");
    expect(parts.itemTrigger.selector).toBe('[data-part~="menu:item-trigger"]');
  });

  /**
   * The pair travels in one token rather than in two attributes so that composing
   * two parts onto one element cannot invent a third: an element that is both
   * `popover:trigger` and `button:root` answers to exactly those two, never to
   * `popover:root`.
   */
  it("qualifies the part with its scope so a composed element states real pairs only", () => {
    const trigger = createAnatomy("popover").parts("trigger").build().trigger;
    const root = createAnatomy("button").parts("root").build().root;
    const composed = `${trigger.attrs["data-part"]} ${root.attrs["data-part"]}`;

    expect(composed.split(" ")).toEqual(["popover:trigger", "button:root"]);
    expect(composed).not.toContain("popover:root");
  });

  it("extends and renames without touching the original", () => {
    const base = createAnatomy("dialog").parts("root", "content");
    const extended = base.extendWith("closeTrigger");
    const renamed = extended.rename("alert-dialog");

    expect(base.keys()).toEqual(["root", "content"]);
    expect(extended.keys()).toEqual(["root", "content", "closeTrigger"]);
    expect(renamed.build().root.attrs["data-scope"]).toBe("alert-dialog");
    expect(extended.build().root.attrs["data-scope"]).toBe("dialog");
  });
});
