/**
 * `render` composes two parts onto one element, and until this file existed
 * nothing asserted what that element ends up being.
 *
 * It was the popover's trigger and nothing else: `data-scope`/`data-part` were
 * single-valued and merged "later wins", so the outer part erased the inner and
 * every rule in `_button.scss` stopped matching. Measured in a real page, the
 * composed button came out 16px tall, transparent, with no radius and no padding
 * — the button's whole sheet, silently absent, on the composition the library
 * documents as the way to use its triggers.
 *
 * `renderToString` rather than a browser: what is being asserted is the markup the
 * adapter produces, and the server is where it is cheapest to read. The sheet's
 * half of the same fix is measured in `packages/styles/src/composed-parts.browser.test.ts`.
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlertDialogAction, AlertDialogActions, AlertDialogRoot } from "./components/alert-dialog";
import { ButtonRoot } from "./components/button";
import { DialogCloseTrigger, DialogRoot, DialogTrigger } from "./components/dialog";
import { PopoverRoot, PopoverTrigger } from "./components/popover";
import { TooltipRoot, TooltipTrigger } from "./components/tooltip";

/**
 * The token list of the element carrying `token`, not of the first element in the
 * markup: an alert's action button sits inside an `actions` part, and reading the
 * first one would assert against its container.
 */
function tokensAround(html: string, attribute: string, token: string): string[] {
  const lists = [...html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, "g"))].map((match) =>
    (match[1] ?? "").split(" ").filter((entry) => entry !== ""),
  );
  return lists.find((list) => list.includes(token)) ?? [];
}

function partsOf(html: string, token: string): string[] {
  return tokensAround(html, "data-part", token);
}

describe("a part composed into another keeps both identities", () => {
  it.each([
    [
      "popover trigger",
      <PopoverRoot key="p">
        <PopoverTrigger render={<ButtonRoot variant="gray" />}>Share</PopoverTrigger>
      </PopoverRoot>,
      "popover:trigger",
    ],
    [
      "dialog trigger",
      <DialogRoot key="d">
        <DialogTrigger render={<ButtonRoot variant="gray" />}>Rename</DialogTrigger>
      </DialogRoot>,
      "dialog:trigger",
    ],
    [
      "dialog close trigger",
      <DialogRoot key="dc" open>
        <DialogCloseTrigger render={<ButtonRoot variant="plain" />}>Close</DialogCloseTrigger>
      </DialogRoot>,
      "dialog:close-trigger",
    ],
    [
      "tooltip trigger",
      <TooltipRoot key="t">
        <TooltipTrigger render={<ButtonRoot variant="gray" />}>Rename</TooltipTrigger>
      </TooltipRoot>,
      "tooltip:trigger",
    ],
    [
      "alert dialog action",
      <AlertDialogRoot key="a" open>
        <AlertDialogActions>
          <AlertDialogAction render={<ButtonRoot variant="filled" />}>Delete</AlertDialogAction>
        </AlertDialogActions>
      </AlertDialogRoot>,
      "dialog:action-trigger",
    ],
  ])("%s composed with the button root", (_name, element, outer) => {
    const html = renderToString(element);

    expect(partsOf(html, "button:root")).toEqual(expect.arrayContaining([outer, "button:root"]));
  });

  it("carries both scopes so the reset and any scope-wide rule still see it", () => {
    const html = renderToString(
      <PopoverRoot>
        <PopoverTrigger render={<ButtonRoot variant="gray" />}>Share</PopoverTrigger>
      </PopoverRoot>,
    );

    expect(tokensAround(html, "data-scope", "button")).toEqual(
      expect.arrayContaining(["popover", "button"]),
    );
  });

  /**
   * The reason the pair travels in one token. With the scope in a list of its own,
   * this element would answer to `[data-scope~="popover"][data-part~="root"]` as
   * well — a pair nobody rendered, and the day somebody styles `popover:root` the
   * breakage is silent.
   */
  it("states the two pairs it has and no third", () => {
    const html = renderToString(
      <PopoverRoot>
        <PopoverTrigger render={<ButtonRoot variant="gray" />}>Share</PopoverTrigger>
      </PopoverRoot>,
    );

    expect(partsOf(html, "button:root").sort()).toEqual(["button:root", "popover:trigger"]);
  });

  /**
   * A plain element is not a part: composing one adds no identity, so the outer
   * part stays alone and its bare-form rules — the ones behind
   * `:not([data-part*=" "])` — keep applying.
   */
  it("adds nothing when what is composed in is not a part", () => {
    const html = renderToString(
      <DialogRoot open>
        <DialogCloseTrigger render={<span />}>Close</DialogCloseTrigger>
      </DialogRoot>,
    );

    expect(partsOf(html, "dialog:close-trigger")).toEqual(["dialog:close-trigger"]);
  });

  it("does not repeat an identity when a part is composed into itself", () => {
    const html = renderToString(<ButtonRoot render={<ButtonRoot />}>Save</ButtonRoot>);

    expect(partsOf(html, "button:root")).toEqual(["button:root"]);
  });
});
