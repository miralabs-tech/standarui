/**
 * The toast region's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop.
 *
 * **Two things here are not decoration, and a row without either would be green and
 * empty.** `portalled={false}` — because `ToastGroup` wraps everything in a
 * `Portal`, which returns `null` during a server render, so a row without it would
 * compare `"" === ""` and pass while measuring nothing; the repository already
 * stands portals down this way in `ssr.test.tsx` for the same reason, the body not
 * being writable from a string. And the toaster is seeded at module scope, because
 * an empty store renders a region with no cards in it — the landmark would be
 * compared and the card, which is what this layer actually builds, would not.
 *
 * Ids are pinned on every record. The store derives them from a counter rather than
 * at random — that is what makes a server render match — but the counter advances
 * per `create`, so two forms reading one seeded toaster is what keeps them equal.
 */

import { createToaster } from "@standarui/core/toast";
import type { ReactNode } from "react";
import type { ParityCase } from "../../composed.harness";
import { Toast } from "./composed";
import {
  ToastActionTrigger,
  ToastCloseTrigger,
  ToastDescription,
  ToastGroup,
  ToastIndicator,
  ToastRoot,
  ToastTitle,
} from "./toast";

/**
 * One of each branch the default card carries: a plain record, one with every
 * optional piece, and one the machine never typed — which is the case whose
 * indicator must not be placed at all.
 */
const toaster = createToaster({ placement: "top-end", max: 5 });

toaster.create({ id: "saved", title: "Saved", type: "success" });
toaster.create({
  id: "failed",
  title: "Upload failed",
  description: "The connection dropped.",
  type: "error",
  closable: true,
  action: { label: "Retry", onClick: () => undefined },
});
toaster.create({ id: "bare", title: "Working" });

/** The card this layer renders, written out — the half the table compares. */
function Card(record: Parameters<Parameters<typeof ToastGroup>[0]["children"]>[0]): ReactNode {
  return (
    <ToastRoot toast={record}>
      {record.type === undefined ? null : <ToastIndicator />}
      <ToastTitle>{record.title}</ToastTitle>
      {record.description === undefined ? null : (
        <ToastDescription>{record.description}</ToastDescription>
      )}
      {record.action === undefined ? null : (
        <ToastActionTrigger>{record.action.label}</ToastActionTrigger>
      )}
      {record.closable === true ? <ToastCloseTrigger /> : null}
    </ToastRoot>
  );
}

export const parity: readonly ParityCase[] = [
  {
    name: "toast",
    composed: <Toast id="notifications" toaster={toaster} portalled={false} />,
    parts: (
      <ToastGroup id="notifications" toaster={toaster} portalled={false}>
        {(record) => <Card {...record} />}
      </ToastGroup>
    ),
  },
];
