/**
 * The alert dialog through React: only what this composition adds.
 *
 * The machine's half — `role="alertdialog"`, `data-destructive`, focus opening on
 * the least destructive action — is proved against real nodes with no framework
 * in `packages/core/src/components/dialog/alert-dialog.browser.test.ts`, and the
 * dialog's own surface, portal, presences and layer stack are proved in the two
 * dialog suites. What is here is the seam: the root that pins `role` and cannot
 * be told otherwise, and the `preventDefault()` veto — which only means anything
 * because `useRender` runs the consumer's handler before the machine's, an order
 * the DOM harness cannot reproduce and this one can.
 */

import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  settle,
  unmountAll,
  waitFor,
} from "../../render-harness";
import {
  AlertDialogAction,
  AlertDialogActions,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogPositioner,
  AlertDialogRoot,
  type AlertDialogRootProps,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

/** Queried from the document: the surface is portalled, and its scope is the dialog's. */
function query(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-part~="dialog:${name}"]`);
}

function part(name: string): HTMLElement {
  const node = query(name);
  if (node === null) throw new Error(`no alert dialog part "${name}"`);
  return node;
}

/** The presence keeps the surface mounted through its exit, so a close is awaited. */
function closed(): Promise<void> {
  return waitFor(() => expect(query("content")).toBeNull());
}

type SceneProps = Omit<AlertDialogRootProps, "children"> & {
  readonly destructive?: boolean;
  readonly onAction?: ((event: React.MouseEvent) => void) | undefined;
};

/**
 * The confirm button is written first on purpose — the reading order of the
 * sentence, and the arrangement that would arm it if the focus rule were dropped.
 */
function Scene(props: SceneProps): ReactNode {
  const { destructive = true, onAction, ...root } = props;
  return (
    <AlertDialogRoot {...root}>
      <AlertDialogTrigger>Delete file</AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogBackdrop />
        <AlertDialogPositioner>
          <AlertDialogContent>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogAction destructive={destructive} onClick={onAction}>
                Delete
              </AlertDialogAction>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogActions>
          </AlertDialogContent>
        </AlertDialogPositioner>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("AlertDialogRoot — what the composition adds", () => {
  it("publishes role=alertdialog, and the parts keep the dialog's scope", async () => {
    mount(<Scene defaultOpen />);
    await settle();

    expect(part("content").getAttribute("role")).toBe("alertdialog");
    // The whole point of not forking: one scope, so one stylesheet.
    expect(part("actions").dataset.scope).toBe("dialog");
    expect(part("cancel-trigger").dataset.scope).toBe("dialog");
  });

  it("opens focus on cancel, not on the confirm button written above it", async () => {
    mount(<Scene defaultOpen />);
    await settle();

    // Awaited, not read once: the trap settles over two frames.
    await waitFor(() => expect(document.activeElement).toBe(part("cancel-trigger")));
  });

  it("marks the destructive action and only it", async () => {
    mount(<Scene defaultOpen />);
    await settle();

    expect(part("action-trigger").hasAttribute("data-destructive")).toBe(true);
    expect(part("cancel-trigger").hasAttribute("data-destructive")).toBe(false);
  });

  it("leaves the action unmarked when it is not destructive", async () => {
    mount(<Scene defaultOpen destructive={false} />);
    await settle();

    expect(part("action-trigger").hasAttribute("data-destructive")).toBe(false);
  });
});

describe("the action's veto", () => {
  it("closes on the action by default", async () => {
    mount(<Scene defaultOpen />);
    await settle();
    fire(() => part("action-trigger").click());

    await closed();
  });

  // An action that awaits a request has to be able to keep its own surface up.
  // This works because the consumer's `onClick` runs first and the machine's
  // reads `defaultPrevented` — the order `use-render` pins.
  it("stays open when the consumer prevents the default", async () => {
    mount(<Scene defaultOpen onAction={(event) => event.preventDefault()} />);
    await settle();
    fire(() => part("action-trigger").click());
    await settle();

    expect(part("content").dataset.state).toBe("open");
  });

  it("still closes on cancel while the action is vetoed", async () => {
    mount(<Scene defaultOpen onAction={(event) => event.preventDefault()} />);
    await settle();
    fire(() => part("cancel-trigger").click());

    await closed();
  });
});

describe("the DoD's accessibility pass", () => {
  it("has no axe violations, destructive or not", async () => {
    const { container } = mount(<Scene defaultOpen />);
    await settle();

    await expectNoAxeViolations(container.ownerDocument.body);
  });

  it("survives a controlled close without leaving the surface behind", async () => {
    function Controlled(): ReactNode {
      const [open, setOpen] = useState(true);
      return <Scene open={open} onOpenChange={(details) => setOpen(details.open)} />;
    }

    mount(<Controlled />);
    await settle();
    fire(() => part("cancel-trigger").click());

    await closed();
  });
});
