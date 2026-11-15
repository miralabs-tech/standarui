import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { realKey } from "./render-harness";

declare module "vitest/browser" {
  interface BrowserCommands {
    takePageFocus: () => Promise<void>;
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * R81: under Firefox, a page that loses the window's focus to another one keeps
 * its focused element, takes the keydown and the keypress of a real Enter, and
 * activates nothing. In the full suite the other page is a test file starting
 * beside this one. No user can press a key into a window that is not active, so
 * the press has to be made from an active one, as a user's would be.
 */
it("a real Enter clicks the focused button after another page took the focus", async () => {
  const button = document.createElement("button");
  button.textContent = "Go";
  document.body.append(button);
  let clicks = 0;
  button.addEventListener("click", () => {
    clicks += 1;
  });
  button.focus();

  await commands.takePageFocus();
  expect(document.activeElement).toBe(button);

  await realKey("{Enter}");

  expect(clicks).toBe(1);
});
