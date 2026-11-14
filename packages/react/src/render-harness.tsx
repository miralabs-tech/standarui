/**
 * Thirty lines of `react-dom/client` instead of a testing library: the adapter's
 * job is to be a correct React citizen, so the tests drive React directly —
 * `act`, real roots, real commits — rather than through something that smooths
 * over exactly the timing this file exists to get right.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

declare global {
  // `var` is not a style choice here: it is the only declaration form that lands
  // on `globalThis`, which is where React looks for this flag.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  readonly container: HTMLElement;
  render(node: ReactNode): void;
  unmount(): void;
}

const mounted: Mounted[] = [];

export function mount(node: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(node);
  });

  const handle: Mounted = {
    container,
    render(next: ReactNode): void {
      act(() => root?.render(next));
    },
    unmount(): void {
      act(() => root?.unmount());
      container.remove();
    },
  };
  mounted.push(handle);
  return handle;
}

/**
 * Finds a part by its bare name, the way `packages/core/src/components/harness.ts`
 * does: the element carries the scope-qualified id (`"popover:trigger"`), and a
 * test that already knows which component it mounted has no use for the scope.
 *
 * Read token by token rather than with `[data-part*=":name"]`, which would also
 * match a longer part whose name merely begins the same way, and which would miss
 * nothing today only by luck.
 */
export function queryPart<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T | null {
  for (const node of root.querySelectorAll<T>("[data-part]")) {
    const tokens = (node.getAttribute("data-part") ?? "").split(" ");
    if (tokens.some((token) => token === name || token.endsWith(`:${name}`))) return node;
  }
  return null;
}

export function queryParts<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T[] {
  return [...root.querySelectorAll<T>("[data-part]")].filter((node) =>
    (node.getAttribute("data-part") ?? "")
      .split(" ")
      .some((token) => token === name || token.endsWith(`:${name}`)),
  );
}

/** Dispatch a real event and let React commit what it caused. */
export function fire(action: VoidFunction): void {
  act(action);
}

export function unmountAll(): void {
  for (const handle of mounted.splice(0, mounted.length)) handle.unmount();
}

/**
 * Every `aria-*` IDREF in the subtree that resolves to nothing — asked of the
 * whole document, because a surface lives in a portal and the id it answers to is
 * outside the node under test. The DOM twin of `composed.harness.tsx`'s string
 * check, and it exists because axe **declines this question**: an element that
 * carries `aria-haspopup` beside `aria-controls` comes back `incomplete` with
 * "unable to determine if aria-controls referenced ID exists", on the grounds that
 * the popup may legitimately not be rendered. Every disclosure in this library
 * carries that pair, so taking axe's abstention as a failure would fail 17 tests
 * over nothing while still not answering the question.
 */
function danglingIdRefsIn(node: Element): string[] {
  const document = node.ownerDocument;
  const referenced = [...node.querySelectorAll("[aria-labelledby],[aria-describedby]")].flatMap(
    (element) =>
      ["aria-labelledby", "aria-describedby"]
        .flatMap((attribute) => (element.getAttribute(attribute) ?? "").split(/\s+/))
        .filter((id) => id !== ""),
  );
  return [...new Set(referenced)].filter((id) => document.getElementById(id) === null);
}

/** axe's own words when it refuses to check an `aria-controls` (see above). */
const AXE_HASPOPUP_ABSTENTION = "while using aria-haspopup";

/**
 * Runs axe against a mounted subtree — the DoD's a11y line, on the real component
 * rather than on a story. Scoped to the node so the harness's own containers and
 * the live regions the announcer leaves behind never colour the result.
 *
 * Contrast is off here and only here: nothing in this harness loads the design
 * system's stylesheet, so the rule would be measuring unstyled black on white.
 * Contrast is checked where the styles exist — `packages/styles/src/
 * contrast.browser.test.ts` runs axe's color-contrast rule against the compiled
 * sheet over the whole theme × density matrix. (An earlier version of this
 * comment delegated to Storybook's a11y addon, which was never installed: a
 * delegation to a runner that does not run is how the check went missing.)
 *
 * **`incomplete` counts, and it is not a nicety.** A whole class of defect never
 * reaches `violations`: `th-has-data-cells` returns `incomplete` and never
 * `violation`, and an `aria-labelledby` pointing at an id nobody rendered comes
 * back as `aria-valid-attr-value` `incomplete` — so a harness that read
 * `violations` alone could not fail on either. It let two blocking defects of the
 * 2026-09-05 audit through under green tests. `contrast.browser.test.ts:380` and
 * `accordion.browser.test.tsx:359` already read both arrays; this is the shared
 * harness catching up with them.
 */
export async function expectNoAxeViolations(node: Element): Promise<void> {
  const { run } = await import("axe-core");
  const results = await run(node as HTMLElement, {
    resultTypes: ["violations", "incomplete"],
    rules: { "color-contrast": { enabled: false } },
  });
  // Named down to the element: a failure that gives the rule and a count sends
  // the reader looking for the node by hand, and `incomplete` results are exactly
  // the ones whose subject is not obvious from the rule's name.
  const describe = (result: {
    id: string;
    help: string;
    nodes: readonly { target: unknown[]; html: string; failureSummary?: string | undefined }[];
  }): string =>
    `${result.id}: ${result.help} — ${result.nodes
      .map(
        (entry) => `${String(entry.target.join(" "))} ${entry.html} ${entry.failureSummary ?? ""}`,
      )
      .join(" | ")}`;
  const undecided = results.incomplete.filter(
    (entry) =>
      !entry.nodes.every((subject) =>
        (subject.failureSummary ?? "").includes(AXE_HASPOPUP_ABSTENTION),
      ),
  );
  const described = [...results.violations, ...undecided].map(describe);
  expect(described).toEqual([]);
  // The one question axe handed back, answered here rather than dropped.
  expect(danglingIdRefsIn(node)).toEqual([]);
}

/** Two animation frames: what a focus trap's activation waits before it places the focus. */
export function twoFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/**
 * A real key through the browser, so its own sequential navigation runs after the
 * handlers — a synthetic `KeyboardEvent` has no default action at all. The act
 * environment is off for the press: the update it causes is scheduled by the
 * browser, not by the test.
 *
 * The page asks for the focus first, as a user's window has it before any key
 * reaches it. Under Firefox a test file starting beside this one takes the
 * window's focus, and this document then receives the keydown and the keypress
 * of a real Enter on a focused button without the click they activate (R81).
 * Vitest's own `window.focus()` runs only when the active element is `body`.
 */
export async function realKey(keys: string): Promise<void> {
  if (!document.hasFocus()) window.focus();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await userEvent.keyboard(keys);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
  await twoFrames();
}

/** Lets React's passive effects and any queued microtask land. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Polls an assertion while React is allowed to commit on its own.
 *
 * Anything React learns about from outside its scheduler — an animation
 * finishing, a rAF landing — schedules its update outside `act`, and there is no
 * wrapping that fixes it: the update is scheduled by the browser, not by the
 * test. Polling *inside* `act` would be worse than the warning, because `act`
 * holds the update back until it exits and the assertion could never come true.
 * So the act environment is switched off for the wait, exactly as React's own
 * guidance for external updates says.
 */
export async function waitFor(assertion: () => void): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await vi.waitFor(assertion);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
}
