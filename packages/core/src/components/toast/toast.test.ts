/**
 * The store and the machine with no document anywhere — which is the whole point
 * of both. `createToaster` is a module a consumer can import from a fetch handler,
 * and the group's machine has to start, run and stop in a place where
 * `scope.getDoc()` would throw.
 *
 * Everything that needs a real engine — the announcer, the hotkey, the hand-off,
 * the measurement, the popover — is in `toast.browser.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./toast.connect";
import { machine, matchesHotkey } from "./toast.machine";
import { createToaster } from "./toast.store";
import type {
  ToastApi,
  Toaster,
  ToastGroupMachineProps,
  ToastGroupSchema,
  ToastRecord,
} from "./toast.types";

type Api = ToastApi<PlainPropTypes>;

const build = (props: ToastGroupMachineProps) =>
  connectWithoutDom<ToastGroupSchema, Api>({ machine, connect, id: "t1", props });

function run(props: ToastGroupMachineProps) {
  const harness = build(props);
  harness.service.start();
  return harness;
}

/** What a prop getter's click handler is handed, minus everything it never reads. */
function click(): MouseEvent {
  return { defaultPrevented: false, preventDefault() {} } as unknown as MouseEvent;
}

function ids(toasts: readonly ToastRecord[]): string[] {
  return toasts.map((record) => record.id);
}

/** The store's clock only runs while something is mounted, so tests that want it say so. */
function mount(toaster: Toaster): () => void {
  return toaster.subscribe(() => {});
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the toaster store", () => {
  it("stacks the newest in front and answers with the id it minted", () => {
    const toaster = createToaster();
    const first = toaster.create({ title: "Saved" });
    const second = toaster.create({ title: "Copied" });

    expect(first).toBe("toast:1");
    expect(ids(toaster.getVisibleToasts())).toEqual([second, first]);
    expect(toaster.isVisible(first)).toBe(true);
  });

  it("queues past the ceiling and promotes the oldest of the queue on a removal", () => {
    const toaster = createToaster({ max: 3 });
    const created = ["a", "b", "c", "d", "e"].map((title) => toaster.create({ title }));

    expect(toaster.getVisibleToasts()).toHaveLength(3);
    expect(toaster.getQueuedCount()).toBe(2);
    // The queued ones are not mounted, so they are not visible either.
    expect(toaster.isVisible(created[3] as string)).toBe(false);

    toaster.remove(created[2]);
    // FIFO out of the queue, and in front: what was queued is newer than what is
    // already on screen.
    expect(ids(toaster.getVisibleToasts())[0]).toBe(created[3]);
    expect(toaster.getQueuedCount()).toBe(1);
  });

  it("runs no clock while nothing is mounted", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const id = toaster.create({ title: "Saved" });

    vi.advanceTimersByTime(10_000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");

    const unmount = mount(toaster);
    vi.advanceTimersByTime(999);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");
    vi.advanceTimersByTime(1);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
    expect(toaster.isVisible(id)).toBe(true);
    unmount();
  });

  it("reports the timeout to the record that asked for it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const toaster = createToaster({ duration: 500 });
    mount(toaster);
    toaster.create({ title: "Saved", onDismiss });

    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "timeout" });
  });

  it("keeps what is left of a paused timer, and counts its reasons", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 5000 });
    mount(toaster);
    toaster.create({ title: "Saved" });

    vi.advanceTimersByTime(3000);
    toaster.pause("interaction");
    vi.advanceTimersByTime(60_000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");

    // Two holds, one release: still held. Hover and a hidden page cannot let go
    // of each other's grip.
    toaster.pause("page-hidden");
    toaster.resume("interaction");
    vi.advanceTimersByTime(60_000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");

    toaster.resume("page-hidden");
    vi.advanceTimersByTime(1999);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");
    vi.advanceTimersByTime(1);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("makes an error and a spinner sticky, and an error assertive", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 100 });
    mount(toaster);
    toaster.create({ title: "Upload failed", type: "error" });
    toaster.create({ title: "Uploading", type: "loading" });

    vi.advanceTimersByTime(60_000);
    for (const record of toaster.getVisibleToasts()) {
      expect(record.duration).toBeNull();
      expect(record.status).toBe("visible");
    }
    const error = toaster.getVisibleToasts().find((record) => record.type === "error");
    expect(error?.politeness).toBe("assertive");
  });

  it("re-arms the clock and bumps the version when a loading toast succeeds", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    mount(toaster);
    const id = toaster.create({ title: "Uploading", type: "loading" });

    toaster.update(id, { type: "success", title: "Uploaded" });
    const record = toaster.getVisibleToasts()[0];
    expect(record?.type).toBe("success");
    expect(record?.duration).toBe(1000);
    expect(record?.version).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("walks a promise through its three states and still settles it", async () => {
    const toaster = createToaster();
    mount(toaster);
    const promise = toaster.promise(Promise.resolve(42), {
      loading: { title: "Uploading" },
      success: (value) => ({ title: `Uploaded ${value}` }),
      error: { title: "Failed" },
    });

    expect(toaster.getVisibleToasts()[0]?.type).toBe("loading");
    await expect(promise).resolves.toBe(42);
    expect(toaster.getVisibleToasts()[0]?.title).toBe("Uploaded 42");
    expect(toaster.getVisibleToasts()[0]?.type).toBe("success");
  });

  it("rejects with the original error and says so on the card", async () => {
    const toaster = createToaster();
    mount(toaster);
    const failure = new Error("network");
    const promise = toaster.promise(Promise.reject(failure), {
      loading: { title: "Uploading" },
      success: { title: "Uploaded" },
      error: (error) => ({ title: (error as Error).message }),
    });

    await expect(promise).rejects.toBe(failure);
    expect(toaster.getVisibleToasts()[0]?.title).toBe("network");
    expect(toaster.getVisibleToasts()[0]?.type).toBe("error");
  });

  it("empties the queue as well as the screen, and `remove` skips the exit", () => {
    const onRemove = vi.fn();
    const toaster = createToaster({ max: 2 });
    mount(toaster);
    toaster.create({ title: "a", onRemove });
    toaster.create({ title: "b" });
    toaster.create({ title: "c" });

    toaster.dismiss();
    expect(toaster.getQueuedCount()).toBe(0);
    expect(toaster.getVisibleToasts().every((record) => record.status === "dismissing")).toBe(true);

    toaster.remove();
    expect(toaster.getVisibleToasts()).toHaveLength(0);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("carries the reason all the way to the record", () => {
    const onDismiss = vi.fn();
    const toaster = createToaster();
    mount(toaster);
    const id = toaster.create({ title: "Saved", onDismiss });

    toaster.dismiss(id, "close-trigger");
    expect(onDismiss).toHaveBeenCalledWith({ reason: "close-trigger" });
    // Already leaving: a second dismissal is not a second event.
    toaster.dismiss(id, "escape");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("the toast group without a DOM", () => {
  it("resolves its initial state from the store alone, so the server renders the region", () => {
    const empty = createToaster();
    expect(build({ toaster: empty }).service.state.get()).toBe("empty");

    const filled = createToaster();
    filled.create({ title: "Saved" });
    expect(build({ toaster: filled }).service.state.get()).toBe("active");
  });

  it("refuses to run without a store, by name", () => {
    expect(() => build({} as ToastGroupMachineProps).service.state.get()).toThrow(/toaster/);
  });

  it("follows the store in and out of the active state", () => {
    const toaster = createToaster();
    const harness = run({ toaster });
    expect(harness.service.state.get()).toBe("empty");

    const id = toaster.create({ title: "Saved" });
    expect(harness.service.state.get()).toBe("active");
    expect(harness.api().count).toBe(1);

    toaster.remove(id);
    expect(harness.service.state.get()).toBe("empty");
  });

  it("connects the region and the card a server can render", () => {
    const toaster = createToaster();
    toaster.create({ title: "Upload failed", description: "The file is too large", type: "error" });
    const harness = run({ toaster });
    const api = harness.api();
    const record = api.toasts[0] as ToastRecord;

    const group = api.getGroupProps();
    expect(group.role).toBe("region");
    expect(group["aria-label"]).toBe("Notifications (1)");
    expect(group.tabIndex).toBe(-1);
    expect(group["data-placement"]).toBe("top-end");
    expect(group["data-overlap"]).toBe("");
    expect(group["data-snav-ignore"]).toBe("");
    expect(group.style).toEqual({ "--sui-toast-count": "1" });

    const root = api.getRootProps(record);
    // Assertive gravity takes the alert role; the speech itself goes through the
    // announcer, which is why the card is not a live region of its own.
    expect(root.role).toBe("alert");
    expect(root["aria-live"]).toBe("off");
    expect(root["aria-labelledby"]).toBe("toast:t1:title:toast:1");
    expect(root["aria-describedby"]).toBe("toast:t1:description:toast:1");
    expect(root.id).toBe("toast:t1:root:toast:1");
    expect(root.tabIndex).toBe(0);
    expect(root["data-type"]).toBe("error");
    expect(root["data-state"]).toBe("open");
    expect(root["data-front"]).toBe("");
    expect(root["data-sui-on-glass"]).toBe("");
    expect(root.style).toEqual({ "--sui-toast-index": "0" });

    expect(api.getIndicatorProps(record)["aria-hidden"]).toBe("true");
    expect(api.getCloseTriggerProps(record)["aria-label"]).toBe("Dismiss notification");
  });

  it("names no description it has not been given", () => {
    const toaster = createToaster();
    toaster.create({ title: "Saved" });
    const harness = run({ toaster });
    const record = harness.api().toasts[0] as ToastRecord;
    expect(harness.api().getRootProps(record)["aria-describedby"]).toBeUndefined();
  });

  it("says a card is leaving before it has left", () => {
    const toaster = createToaster();
    const id = toaster.create({ title: "Saved" });
    const harness = run({ toaster });

    toaster.dismiss(id);
    const record = harness.api().toasts[0] as ToastRecord;
    expect(record.status).toBe("dismissing");
    expect(harness.api().getRootProps(record)["data-state"]).toBe("closed");
    // Still mounted: the adapter's presence owns the exit, and the record only
    // leaves the store when it reports back.
    expect(harness.api().count).toBe(1);

    harness.api().notifyExit(id);
    expect(harness.api().count).toBe(0);
  });

  it("dismisses with the reason the part that asked for it carries", () => {
    const onDismiss = vi.fn();
    const toaster = createToaster();
    toaster.create({ title: "Saved", onDismiss, action: { label: "Undo", onClick: () => {} } });
    const harness = run({ toaster });
    const record = harness.api().toasts[0] as ToastRecord;

    const close = harness.api().getCloseTriggerProps(record).onClick as (event: MouseEvent) => void;
    close(click());
    expect(onDismiss).toHaveBeenCalledWith({ reason: "close-trigger" });
  });

  it("runs the action, then closes — unless the action says otherwise", () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    const toaster = createToaster();
    toaster.create({ title: "Deleted", onDismiss, action: { label: "Undo", onClick } });
    toaster.create({
      title: "Kept",
      action: { label: "Details", onClick, dismissOnClick: false },
    });
    const harness = run({ toaster });

    const [kept, deleted] = harness.api().toasts as [ToastRecord, ToastRecord];
    const fire = (record: ToastRecord): void => {
      const props = harness.api().getActionTriggerProps(record);
      (props.onClick as (event: MouseEvent) => void)(click());
    };

    fire(kept);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(harness.api().toasts[0]?.status).toBe("visible");

    fire(deleted);
    expect(onDismiss).toHaveBeenCalledWith({ reason: "action" });
  });

  it("pauses on an interaction, and only while the consumer allows it", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const harness = run({ toaster });
    toaster.create({ title: "Saved" });

    harness.service.send({ type: "GROUP.POINTER_ENTER" });
    expect(harness.api().paused).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");

    harness.service.send({ type: "GROUP.POINTER_LEAVE" });
    expect(harness.api().paused).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("leaves the clock alone when the consumer turned the pause off", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const harness = run({ toaster, pauseOnInteraction: false });
    toaster.create({ title: "Saved" });

    harness.service.send({ type: "GROUP.POINTER_ENTER" });
    expect(harness.api().paused).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("pauses on a hidden page and resumes on a visible one", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const harness = run({ toaster });
    toaster.create({ title: "Saved" });

    harness.service.send({ type: "DOC.VISIBILITY", hidden: true });
    vi.advanceTimersByTime(5000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("visible");

    harness.service.send({ type: "DOC.VISIBILITY", hidden: false });
    vi.advanceTimersByTime(1000);
    expect(toaster.getVisibleToasts()[0]?.status).toBe("dismissing");
  });

  it("does not re-render for a list that says the same thing twice", () => {
    const toaster = createToaster();
    toaster.create({ title: "Saved" });
    const harness = run({ toaster });
    const first = harness.service.context.get("toasts");

    harness.service.send({ type: "STORE.SYNC", toasts: [...first] });
    expect(harness.service.context.get("toasts")).toBe(first);

    const [record] = first as [ToastRecord];
    harness.service.send({
      type: "STORE.SYNC",
      toasts: [{ ...record, version: record.version + 1 }],
    });
    expect(harness.service.context.get("toasts")).not.toBe(first);
  });
});

describe("the hotkey matcher", () => {
  const event = (init: Partial<KeyboardEvent>): KeyboardEvent => init as KeyboardEvent;

  it("matches a bare key by `key` or by `code`", () => {
    expect(matchesHotkey(event({ key: "F6", code: "F6" }), ["F6"])).toBe(true);
    expect(matchesHotkey(event({ key: "t", code: "KeyT" }), ["KeyT"])).toBe(true);
    expect(matchesHotkey(event({ key: "F7", code: "F7" }), ["F6"])).toBe(false);
  });

  it("requires every entry, modifiers included", () => {
    const combo = ["altKey", "KeyT"];
    expect(matchesHotkey(event({ key: "t", code: "KeyT", altKey: true }), combo)).toBe(true);
    expect(matchesHotkey(event({ key: "t", code: "KeyT", altKey: false }), combo)).toBe(false);
    expect(matchesHotkey(event({ key: "F6", code: "F6", altKey: true }), combo)).toBe(false);
    expect(matchesHotkey(event({ key: "F6", code: "F6" }), [])).toBe(false);
  });
});
