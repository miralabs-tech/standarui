/**
 * The node half of `search-field`: no document, no framework, the shape a server
 * render has. What is provable here is the markup — the landmark, the capsule
 * under it, the native searchbox inside that, and the two buttons' own
 * visibility rules.
 *
 * The machine is deliberately never `start()`ed here, and it could not be: its
 * `trackModality` effect reaches for a document on the first tick. So everything
 * event-shaped — the cancel gesture, the focus it hands back, the rescue —
 * lives in `search-field.browser.test.ts` beside the clear gesture it mirrors.
 */

import { describe, expect, it } from "vitest";
import { connectWithoutDom, type PlainPropTypes, plainNormalizer } from "../node-harness";
import { connect } from "./search-field.connect";
import { isSearchHotkey } from "./search-field.hotkey";
import { machine } from "./search-field.machine";
import type {
  SearchFieldApi,
  SearchFieldMachineProps,
  SearchFieldSchema,
} from "./search-field.types";

type Api = SearchFieldApi<PlainPropTypes>;

const build = (props: SearchFieldMachineProps = {}) =>
  connectWithoutDom<SearchFieldSchema, Api>({ machine, connect, id: "s1", props });

/**
 * The five fields the predicate reads, and nothing else. Node has no
 * `KeyboardEvent` constructor — this project runs without a DOM on purpose — and
 * a predicate that needs one to be tested is a predicate that reaches too far.
 */
const key = (init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent =>
  ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  }) as unknown as KeyboardEvent;

describe("search-field without a DOM", () => {
  it("connects on a server", () => {
    const harness = build({ defaultValue: "hello", label: "Search files" });
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.getRootProps().id).toBe("search-field:s1:root");
    expect(api.getFieldProps().id).toBe("search-field:s1:field");
    expect(api.getControlProps().id).toBe("search-field:s1:control");
    expect(api.getIndicatorProps().id).toBe("search-field:s1:indicator");
    expect(api.getCancelTriggerProps().id).toBe("search-field:s1:cancelTrigger");
    // The id keeps the part's own spelling while `data-part` is kebab-cased by
    // the anatomy — `input` already does exactly this with `visibilityTrigger`,
    // and this field's parts sit in that machine's own subtree, so matching the
    // sibling matters more here than matching `menu`, which spells its ids the
    // other way. The library is not of one mind about it; this is not the place
    // to decide, and a silent divergence inside one DOM tree would be worse.
    expect(api.getClearTriggerProps().id).toBe("search-field:s1:clearTrigger");
    expect(api.getControlProps().value).toBe("hello");
  });

  it("is a landmark around a native searchbox, and never a hand-written role", () => {
    const api = build({ label: "Search files" }).api();

    // The whole normative recipe: there is no APG pattern named "search", there
    // is `role="search"` around `input[type=search]`.
    expect(api.getRootProps().role).toBe("search");
    expect(api.getRootProps()["aria-label"]).toBe("Search files");
    expect(api.getControlProps().type).toBe("search");
    expect(api.getControlProps()["aria-label"]).toBe("Search files");
    // Writing `role="searchbox"` by hand would override a native role with a
    // worse copy of itself.
    expect(api.getControlProps().role).toBeUndefined();
  });

  // The field itself still ships none — a search field with no label has a way
  // out, which is to compose it into `field`. The clear button has none: without
  // a name it is an icon-only `<button>` with an `aria-hidden` glyph, which axe
  // grades `button-name` and WCAG 2.2 grades a level A failure. So the asymmetry
  // is the contract, and it is asserted rather than assumed.
  it("names its own clear button, and nothing else, when no label was given", () => {
    const api = build().api();

    expect(api.getRootProps()["aria-label"]).toBeUndefined();
    expect(api.getControlProps()["aria-label"]).toBeUndefined();
    expect(api.getClearTriggerProps()["aria-label"]).toBe("Clear search");
  });

  it("lets the consumer's own clear label win over the default", () => {
    const api = build({ clearLabel: "Vider" }).api();

    expect(api.getClearTriggerProps()["aria-label"]).toBe("Vider");
  });

  // Same argument as the clear button's, and stronger: that one is out of the
  // tab order, this one is a tab stop a keyboard user meets head-on. A wrong
  // language is recoverable; an unnamed tab stop is not.
  it("names its own cancel button, and lets the consumer say otherwise", () => {
    expect(build().api().getCancelTriggerProps()["aria-label"]).toBe("Cancel search");
    expect(build({ cancelLabel: "Annuler" }).api().getCancelTriggerProps()["aria-label"]).toBe(
      "Annuler",
    );
  });

  it("says whether it is empty, on the element and in the api", () => {
    // Both the row and the capsule wear it: the row lays itself out on it and
    // the capsule paints on it.
    expect(build().api().getRootProps()["data-empty"]).toBe("");
    expect(build().api().getFieldProps()["data-empty"]).toBe("");
    expect(build().api().empty).toBe(true);
    expect(build({ defaultValue: "a" }).api().getRootProps()["data-empty"]).toBeUndefined();
    expect(build({ defaultValue: "a" }).api().getFieldProps()["data-empty"]).toBeUndefined();
    expect(build({ defaultValue: "a" }).api().empty).toBe(false);
  });

  // The 2026-09-05 split: `root` is the row and the landmark, `field` is the
  // box. The two presentation tokens describe a box, so they travel with it —
  // left on the root they would be looked for on an element that no longer
  // carries them, and `soft`, `rect` and `invalid` would vanish without a word.
  it("puts the box's own tokens on the box and not on the row", () => {
    const api = build({ shape: "rect" }).api();

    expect(api.getFieldProps()["data-shape"]).toBe("rect");
    expect(api.getFieldProps()["data-variant"]).toBe("search");
    expect(api.getRootProps()["data-shape"]).toBeUndefined();
    expect(api.getRootProps()["data-variant"]).toBeUndefined();
  });

  it("keeps the search inset whatever shape it is drawn in", () => {
    // The 2026-08-31 amendment, read literally: the presentation settles the
    // inset (`data-variant`), the consumer settles the shape.
    expect(build().api().getFieldProps()["data-shape"]).toBe("capsule");
    expect(build().api().getFieldProps()["data-variant"]).toBe("search");
    expect(build({ shape: "rect" }).api().getFieldProps()["data-shape"]).toBe("rect");
    expect(build({ shape: "rect" }).api().getFieldProps()["data-variant"]).toBe("search");
    expect(build({ shape: "soft" }).api().getFieldProps()["data-shape"]).toBe("soft");
  });

  it("hides the clear button until there is something to clear", () => {
    expect(build().api().getClearTriggerProps().hidden).toBe(true);
    expect(build({ defaultValue: "abc" }).api().getClearTriggerProps().hidden).toBe(false);
  });

  it("keeps the clear button hidden on a field nobody can clear", () => {
    // Search Field 480:761: a disabled field *with text in it* keeps the glyph
    // hidden. Read-only follows the same reasoning — the value is not the user's
    // to change.
    expect(build({ defaultValue: "abc", disabled: true }).api().getClearTriggerProps().hidden).toBe(
      true,
    );
    expect(build({ defaultValue: "abc", readOnly: true }).api().getClearTriggerProps().hidden).toBe(
      true,
    );
  });

  // Only emptiness takes it away. A form that disables itself must not re-lay
  // out its row under the reader's eyes, and a read-only field owes an answer
  // rather than a disappearance — `CANCEL.CLICK` empties the value, which
  // read-only forbids, so the button says so by being `disabled`.
  it("keeps the cancel button rendered on a field nobody can edit, and disables it", () => {
    expect(build().api().getCancelTriggerProps().hidden).toBe(true);
    expect(build({ defaultValue: "abc" }).api().getCancelTriggerProps().hidden).toBe(false);

    for (const props of [{ disabled: true }, { readOnly: true }] as const) {
      const trigger = build({ defaultValue: "abc", ...props })
        .api()
        .getCancelTriggerProps();

      expect(trigger.hidden).toBe(false);
      expect(trigger.disabled).toBe(true);
      expect(trigger["data-disabled"]).toBe("");
    }
  });

  it("leaves the cancel button in the tab order, and off the field's focus", () => {
    const trigger = build({ defaultValue: "abc" }).api().getCancelTriggerProps();

    // The clear button's argument does not transfer: Escape is that one's
    // keyboard double, and this one has none, so taking it out of the tab order
    // would be a 2.1.1 failure rather than a tidy-up.
    expect(trigger.tabIndex).toBeUndefined();
    expect(trigger.type).toBe("button");
    expect(trigger["aria-controls"]).toBe("search-field:s1:control");
    expect(trigger["aria-hidden"]).toBeUndefined();
    // Never `stateAttrs`: it would ring whenever the caret is in the control.
    expect(trigger["data-focus"]).toBeUndefined();
    expect(trigger["data-focus-visible"]).toBeUndefined();
    expect(trigger["data-focus-source"]).toBeUndefined();
    expect(trigger["data-readonly"]).toBeUndefined();
  });

  it("names the clear button and points it at the control, outside the tab order", () => {
    const api = build({ defaultValue: "abc", clearLabel: "Clear search" }).api();
    const trigger = api.getClearTriggerProps();

    expect(trigger["aria-label"]).toBe("Clear search");
    expect(trigger["aria-controls"]).toBe("search-field:s1:control");
    expect(trigger.type).toBe("button");
    // Not an oversight: Escape is the keyboard path, and a tab stop that vanishes
    // the moment it does its job drops the focus on `<body>`. It stays in the
    // a11y tree — no `aria-hidden` — so an AT user can still activate it.
    expect(trigger.tabIndex).toBe(-1);
    expect(trigger["aria-hidden"]).toBeUndefined();
    // `tabIndex: -1` keeps it off Tab and nothing else: the spatial engine
    // scores every *focusable*, so without this a d-pad would reach a control no
    // arrow key can — measured on 2026-09-05, `moveRight` from the control
    // landed here rather than on the cancel button.
    expect(trigger["data-snav-ignore"]).toBe("");
    expect(build({ defaultValue: "abc" }).api().getCancelTriggerProps()["data-snav-ignore"]).toBe(
      undefined,
    );
  });

  it("hides the magnifier from assistive technology", () => {
    // The landmark and the placeholder already said "search".
    expect(build().api().getIndicatorProps()["aria-hidden"]).toBe("true");
  });

  it("asks a phone keyboard for its search key, and lets the consumer say otherwise", () => {
    expect(build().api().getControlProps().inputMode).toBe("search");
    expect(build({ inputMode: "text" }).api().getControlProps().inputMode).toBe("text");
  });

  it("wears the states a field has", () => {
    const api = build({ disabled: true, invalid: true }).api();

    // On the row and on the capsule both: the row fades as one thing so the
    // cancel button fades with it, and the capsule paints its own border.
    expect(api.getRootProps()["data-disabled"]).toBe("");
    expect(api.getRootProps()["data-invalid"]).toBe("");
    expect(api.getFieldProps()["data-disabled"]).toBe("");
    expect(api.getFieldProps()["data-invalid"]).toBe("");
    expect(api.getControlProps()["aria-invalid"]).toBe("true");
  });

  it("keeps off the attribute the spatial engine owns, while focused", () => {
    // `data-snav-focused` belongs to `@standarx/nav`'s spatial engine. Only a
    // focused render could emit it, and a server never renders one, so the state
    // is answered for the machine.
    const { service } = build({ defaultValue: "abc" });
    const api = connect(
      {
        ...service,
        state: {
          ...service.state,
          get: () => "focused",
          matches: (...values) => values.includes("focused"),
        },
      },
      plainNormalizer,
    );

    expect(api.getRootProps()["data-focus"]).toBe("");
    expect(api.getFieldProps()["data-focus"]).toBe("");
    expect(api.getControlProps()["data-focus"]).toBe("");
    expect(api.getRootProps()["data-snav-focused"]).toBeUndefined();
    expect(api.getFieldProps()["data-snav-focused"]).toBeUndefined();
    expect(api.getControlProps()["data-snav-focused"]).toBeUndefined();
    // The clear button never wears the field's focus, or it would ring whenever
    // the caret is in the control.
    expect(api.getClearTriggerProps()["data-focus"]).toBeUndefined();
  });
});

describe("the search shortcut predicate", () => {
  it("matches one modifier and the letter f, and nothing else", () => {
    expect(isSearchHotkey(key({ key: "f", metaKey: true }))).toBe(true);
    expect(isSearchHotkey(key({ key: "f", ctrlKey: true }))).toBe(true);
    // Uppercase reaches the predicate when a layout sends it; Shift does not.
    expect(isSearchHotkey(key({ key: "F", metaKey: true }))).toBe(true);
  });

  it("refuses the chords that mean something else", () => {
    expect(isSearchHotkey(key({ key: "f" }))).toBe(false);
    expect(isSearchHotkey(key({ key: "f", metaKey: true, ctrlKey: true }))).toBe(false);
    expect(isSearchHotkey(key({ key: "f", metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchHotkey(key({ key: "f", ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchHotkey(key({ key: "g", metaKey: true }))).toBe(false);
  });
});
