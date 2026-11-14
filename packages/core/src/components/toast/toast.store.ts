/**
 * The queue, the ceiling and the clock — with no DOM in the room.
 *
 * `setTimeout` is the one global here and it is not a DOM access: it exists on a
 * server, it survives SSR, and nothing in this file reads a document. Everything
 * that touches one lives in the machine's effects, behind `scope`.
 *
 * **The clock is gated on the subscribers.** While nothing is mounted no timer
 * runs, because a toast that expired without ever being shown was never
 * perceived — a tab restored after ten minutes must not find its notifications
 * already gone.
 */

import type { Politeness } from "../../a11y/live-announcer";
import type {
  ToastDismissReason,
  Toaster,
  ToasterOptions,
  ToastOptions,
  ToastPromiseOptions,
  ToastRecord,
  ToastSubscriber,
  ToastType,
} from "./toast.types";

const DEFAULT_DURATION = 5000;
const DEFAULT_MAX = 3;

interface ToastHandlers {
  readonly onDismiss: ((details: { reason: ToastDismissReason }) => void) | undefined;
  readonly onRemove: (() => void) | undefined;
}

interface Timer {
  /** What is left to run. Frozen on pause, which is what makes a resume honest. */
  remaining: number;
  deadline: number;
  handle: ReturnType<typeof setTimeout> | null;
}

/**
 * `error` and `loading` are sticky by default, and that is the parity line with the
 * reference app, whose error strips stayed until someone dismissed them: a spinner that
 * disappears on a five second clock is a lie about the work still running.
 */
function defaultDuration(type: ToastType, fallback: number): number | null {
  return type === "error" || type === "loading" ? null : fallback;
}

function defaultPoliteness(type: ToastType): Politeness {
  return type === "error" ? "assertive" : "polite";
}

function resolveOptions<T>(
  source: ToastOptions | ((value: T) => ToastOptions),
  value: T,
): ToastOptions {
  return typeof source === "function" ? source(value) : source;
}

export function createToaster(options: ToasterOptions = {}): Toaster {
  const placement = options.placement ?? "top-end";
  const overlap = options.overlap ?? true;
  const max = Math.max(1, options.max ?? DEFAULT_MAX);
  const fallbackDuration = options.duration ?? DEFAULT_DURATION;

  let visible: readonly ToastRecord[] = [];
  let queued: readonly ToastRecord[] = [];
  let created = 0;
  let held = 0;

  const handlers = new Map<string, ToastHandlers>();
  const timers = new Map<string, Timer>();
  const holds = new Map<string, number>();
  const subscribers = new Set<ToastSubscriber>();

  function notify(): void {
    for (const subscriber of [...subscribers]) subscriber(visible);
  }

  function find(id: string): ToastRecord | undefined {
    return visible.find((record) => record.id === id) ?? queued.find((record) => record.id === id);
  }

  function stopTimer(id: string): void {
    const timer = timers.get(id);
    if (timer === undefined || timer.handle === null) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.deadline - Date.now());
  }

  function startTimer(id: string): void {
    if (subscribers.size === 0 || held > 0) return;
    const timer = timers.get(id);
    if (timer === undefined || timer.handle !== null) return;
    const record = visible.find((candidate) => candidate.id === id);
    if (record === undefined || record.status !== "visible") return;
    timer.deadline = Date.now() + timer.remaining;
    timer.handle = setTimeout(() => {
      timer.handle = null;
      dismissWith(id, "timeout");
    }, timer.remaining);
  }

  function armTimer(record: ToastRecord): void {
    timers.delete(record.id);
    if (record.duration === null) return;
    timers.set(record.id, { remaining: record.duration, deadline: 0, handle: null });
    startTimer(record.id);
  }

  function dropTimer(id: string): void {
    stopTimer(id);
    timers.delete(id);
  }

  /** A visible slot freed by a removal is filled by the oldest toast in the queue. */
  function promote(): void {
    while (visible.length < max && queued.length > 0) {
      const next = queued[0];
      if (next === undefined) return;
      queued = queued.slice(1);
      // In front: what was queued is newer than everything already on screen.
      visible = [next, ...visible];
      armTimer(next);
    }
  }

  function replace(record: ToastRecord): void {
    if (visible.some((candidate) => candidate.id === record.id)) {
      visible = visible.map((candidate) => (candidate.id === record.id ? record : candidate));
      return;
    }
    queued = queued.map((candidate) => (candidate.id === record.id ? record : candidate));
  }

  function dismissWith(id: string, reason: ToastDismissReason): void {
    const record = find(id);
    if (record === undefined || record.status === "dismissing") return;
    dropTimer(id);

    if (queued.some((candidate) => candidate.id === id)) {
      // Never mounted, so there is no exit to wait for and nothing to animate.
      queued = queued.filter((candidate) => candidate.id !== id);
      const entry = handlers.get(id);
      handlers.delete(id);
      entry?.onDismiss?.({ reason });
      entry?.onRemove?.();
      notify();
      return;
    }

    // Version untouched on purpose: a dismissal is not something to announce
    // again, and the announcer is keyed on `(id, version)`.
    replace({ ...record, status: "dismissing" });
    handlers.get(id)?.onDismiss?.({ reason });
    notify();
  }

  function removeOne(id: string): void {
    const wasVisible = visible.some((candidate) => candidate.id === id);
    if (!wasVisible && !queued.some((candidate) => candidate.id === id)) return;
    dropTimer(id);
    visible = visible.filter((candidate) => candidate.id !== id);
    queued = queued.filter((candidate) => candidate.id !== id);
    const entry = handlers.get(id);
    handlers.delete(id);
    entry?.onRemove?.();
    if (wasVisible) promote();
    notify();
  }

  function create(input: ToastOptions): string {
    created += 1;
    const id = input.id ?? `toast:${created}`;
    const type = input.type ?? "info";
    const record: ToastRecord = {
      id,
      type,
      title: input.title,
      description: input.description,
      duration:
        input.duration === undefined ? defaultDuration(type, fallbackDuration) : input.duration,
      closable: input.closable ?? true,
      action: input.action,
      politeness: input.politeness ?? defaultPoliteness(type),
      status: "visible",
      meta: input.meta,
      version: 0,
    };
    handlers.set(id, { onDismiss: input.onDismiss, onRemove: input.onRemove });

    if (visible.length < max) {
      visible = [record, ...visible];
      armTimer(record);
    } else {
      // Queued: not mounted, not announced, not on any clock. It becomes all
      // three at once, when a slot frees up and `promote` puts it on screen.
      queued = [...queued, record];
    }
    notify();
    return id;
  }

  function update(id: string, changes: Partial<Omit<ToastOptions, "id">>): void {
    const record = find(id);
    if (record === undefined) return;
    const type = changes.type ?? record.type;
    const duration =
      changes.duration !== undefined
        ? changes.duration
        : type === record.type
          ? record.duration
          : defaultDuration(type, fallbackDuration);

    const next: ToastRecord = {
      ...record,
      type,
      title: changes.title ?? record.title,
      description: "description" in changes ? changes.description : record.description,
      duration,
      closable: changes.closable ?? record.closable,
      action: "action" in changes ? changes.action : record.action,
      politeness:
        changes.politeness ??
        (changes.type === undefined ? record.politeness : defaultPoliteness(type)),
      meta: "meta" in changes ? changes.meta : record.meta,
      // The announcer speaks again: loading → success is new information, and
      // the live region deduplicates identical text on its own.
      version: record.version + 1,
    };

    if ("onDismiss" in changes || "onRemove" in changes) {
      const entry = handlers.get(id);
      handlers.set(id, {
        onDismiss: "onDismiss" in changes ? changes.onDismiss : entry?.onDismiss,
        onRemove: "onRemove" in changes ? changes.onRemove : entry?.onRemove,
      });
    }

    replace(next);
    if (next.status === "visible") armTimer(next);
    notify();
  }

  const toaster: Toaster = {
    create,
    update,
    placement,
    overlap,

    dismiss(id?: string | undefined, reason: ToastDismissReason = "programmatic"): void {
      if (id !== undefined) {
        dismissWith(id, reason);
        return;
      }
      for (const record of [...visible, ...queued]) dismissWith(record.id, reason);
    },

    remove(id?: string | undefined): void {
      if (id !== undefined) {
        removeOne(id);
        return;
      }
      for (const record of [...visible, ...queued]) removeOne(record.id);
    },

    pause(reason = "manual"): void {
      holds.set(reason, (holds.get(reason) ?? 0) + 1);
      held += 1;
      if (held !== 1) return;
      for (const id of timers.keys()) stopTimer(id);
    },

    resume(reason = "manual"): void {
      const count = holds.get(reason) ?? 0;
      if (count === 0) return;
      if (count === 1) holds.delete(reason);
      else holds.set(reason, count - 1);
      held -= 1;
      if (held !== 0) return;
      for (const id of timers.keys()) startTimer(id);
    },

    promise<T>(promise: Promise<T>, promiseOptions: ToastPromiseOptions<T>): Promise<T> {
      const id = create({ type: "loading", ...promiseOptions.loading });
      return promise.then(
        (value) => {
          update(id, { type: "success", ...resolveOptions(promiseOptions.success, value) });
          return value;
        },
        (error: unknown) => {
          update(id, { type: "error", ...resolveOptions(promiseOptions.error, error) });
          throw error;
        },
      );
    },

    isVisible: (id: string): boolean => visible.some((record) => record.id === id),
    getVisibleToasts: (): readonly ToastRecord[] => visible,
    getQueuedCount: (): number => queued.length,

    subscribe(callback: ToastSubscriber): () => void {
      subscribers.add(callback);
      if (subscribers.size === 1) {
        for (const id of timers.keys()) startTimer(id);
      }
      return () => {
        if (!subscribers.delete(callback)) return;
        if (subscribers.size > 0) return;
        for (const id of timers.keys()) stopTimer(id);
      };
    },
  };

  return toaster;
}
