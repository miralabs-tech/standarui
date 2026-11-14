/**
 * The node half of `avatar`: no document, no framework, no page — the shape a
 * server render has. `avatar.browser.test.ts` covers what needs a real engine:
 * the clock, the `load`/`error` events, the observers.
 *
 * Some cases start the service anyway. Every effect this machine installs is
 * written to answer "nothing" without a page — `trackParts` observes a root the
 * scope answers `null` for, `waitFallbackDelay` finds no window and files no
 * clock — so starting is safe here, and it is the only way to see an event
 * delivered: a not-started service queues what it is sent.
 *
 * One consequence runs through the whole file. `trackParts` fires `PARTS.SYNC`
 * on start, `syncParts` finds no image element, and `hasImage` goes false — so
 * every started harness here shows its fallback whatever the status says. That
 * is the correct answer (no image part, no image) and it is why "the fallback
 * hides once the picture is up" is a browser assertion rather than one here.
 */

import { describe, expect, it, vi } from "vitest";
import { connectWithoutDom, type PlainPropTypes } from "../node-harness";
import { connect } from "./avatar.connect";
import { machine } from "./avatar.machine";
import type { AvatarApi, AvatarMachineProps, AvatarSchema } from "./avatar.types";

type Api = AvatarApi<PlainPropTypes>;

const build = (props: AvatarMachineProps = {}) =>
  connectWithoutDom<AvatarSchema, Api>({ machine, connect, id: "a1", props });

describe("avatar without a DOM", () => {
  it("resolves its defaults", () => {
    const { service } = build();

    // No default, on purpose: a defaulted `dir` becomes a real HTML attribute,
    // and an attribute wins over the direction the page already inherits.
    expect(service.prop("dir")).toBeUndefined();
    expect(service.prop("size")).toBe("md");
    expect(service.prop("fallbackDelay")).toBe(0);
  });

  it("connects on a server, loading and already showing the monogram", () => {
    const harness = build();
    const api = harness.api();

    expect(harness.service.status()).toBe("not-started");
    expect(api.status).toBe("loading");
    expect(api.loaded).toBe(false);
    // `fallbackDelay: 0` latches `delayElapsed` true from the start, which is
    // what makes the monogram part of the first paint rather than of a later
    // one — the server and the client agree on it.
    expect(api.showFallback).toBe(true);

    const root = api.getRootProps();
    expect(root["data-state"]).toBe("loading");
    expect(root["data-size"]).toBe("md");
    // Omitted unless the consumer asked for one, so the root inherits the
    // direction of whatever region it was rendered into.
    expect(root.dir).toBeUndefined();
    // No role, no label: the accessible name is the image's `alt`, which is the
    // consumer's to write.
    expect(root.role).toBeUndefined();

    const image = api.getImageProps();
    expect(image.hidden).toBeUndefined();
    expect(image.draggable).toBe(false);
    // Never authored by the core — it would overwrite the consumer's.
    expect(image.alt).toBeUndefined();

    const fallback = api.getFallbackProps();
    expect(fallback.hidden).toBeUndefined();
    expect(fallback["aria-hidden"]).toBe("true");
  });

  it("keeps the monogram back while a delay is still running", () => {
    const api = build({ fallbackDelay: 200 }).api();

    expect(api.showFallback).toBe(false);
    expect(api.getFallbackProps().hidden).toBe(true);
  });

  it("shows the fallback when no image part was rendered at all, delay or not", () => {
    const harness = build({ fallbackDelay: 200 });
    harness.service.start();

    // `PARTS.SYNC` on start found no image, and no delay makes a missing
    // picture worth waiting for.
    expect(harness.service.context.get("hasImage")).toBe(false);
    expect(harness.api().showFallback).toBe(true);
  });

  it("says nothing at all on mount", () => {
    const onStatusChange = vi.fn();
    const harness = build({ onStatusChange });

    harness.service.start();

    // The initial state has no entry action, so nothing is notified for a
    // status the consumer already knows it asked for.
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("reports the load once, and only once", () => {
    const onStatusChange = vi.fn();
    const harness = build({ onStatusChange });
    harness.service.start();

    harness.service.send({ type: "IMAGE.LOAD" });

    expect(harness.api().status).toBe("loaded");
    expect(harness.api().loaded).toBe(true);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith({ status: "loaded" });

    // A second `load` on the same element — a srcset reflow — is not a status
    // change and is deliberately unhandled.
    harness.service.send({ type: "IMAGE.LOAD" });
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it("hides the broken image itself rather than leaving the browser's glyph", () => {
    const onStatusChange = vi.fn();
    const harness = build({ fallbackDelay: 5000, onStatusChange });
    harness.service.start();

    harness.service.send({ type: "IMAGE.ERROR" });

    expect(harness.api().status).toBe("error");
    expect(onStatusChange).toHaveBeenCalledWith({ status: "error" });
    // `hidden` and not a stylesheet's business: a broken image paints its glyph
    // even where no sheet has loaded.
    expect(harness.api().getImageProps().hidden).toBe(true);
    // The delay is for an image that is still coming. This one is not.
    expect(harness.api().showFallback).toBe(true);
  });

  it("takes a late success after an error", () => {
    const onStatusChange = vi.fn();
    const harness = build({ onStatusChange });
    harness.service.start();

    harness.service.send({ type: "IMAGE.ERROR" });
    harness.service.send({ type: "IMAGE.LOAD" });

    expect(harness.api().status).toBe("loaded");
    expect(harness.api().getImageProps().hidden).toBeUndefined();
    expect(onStatusChange.mock.calls).toEqual([[{ status: "error" }], [{ status: "loaded" }]]);
  });

  it("falls back to error when a swapped src fails on an element that had worked", () => {
    const harness = build();
    harness.service.start();

    harness.service.send({ type: "IMAGE.LOAD" });
    harness.service.send({ type: "IMAGE.ERROR" });

    expect(harness.api().status).toBe("error");
  });

  it("returns to loading on a src change, and says so only when it is news", () => {
    const onStatusChange = vi.fn();
    const harness = build({ onStatusChange });
    harness.service.start();

    harness.service.send({ type: "IMAGE.LOAD" });
    onStatusChange.mockClear();

    harness.service.send({ type: "IMAGE.SRC_CHANGE" });
    expect(harness.api().status).toBe("loading");
    expect(onStatusChange).toHaveBeenCalledWith({ status: "loading" });

    // Already loading: the same event re-arms the effects and notifies nothing,
    // because the status the consumer holds is still true.
    onStatusChange.mockClear();
    harness.service.send({ type: "IMAGE.SRC_CHANGE" });
    expect(harness.api().status).toBe("loading");
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("never takes the revealed monogram back", () => {
    const harness = build({ fallbackDelay: 200 });
    harness.service.start();

    expect(harness.service.context.get("delayElapsed")).toBe(false);

    harness.service.send({ type: "DELAY.ELAPSED" });
    expect(harness.service.context.get("delayElapsed")).toBe(true);

    // The latch: a reload must not flash the monogram out and back in. Once the
    // reader has seen it, it stays eligible.
    harness.service.send({ type: "IMAGE.SRC_CHANGE" });
    expect(harness.service.context.get("delayElapsed")).toBe(true);

    harness.service.send({ type: "IMAGE.LOAD" });
    harness.service.send({ type: "IMAGE.SRC_CHANGE" });
    expect(harness.service.context.get("delayElapsed")).toBe(true);
  });

  it("starts with a delay to run and no page to run it in, and does not crash", () => {
    const harness = build({ fallbackDelay: 200 });

    // `waitFallbackDelay` takes its clock off the root element rather than off
    // `scope.getWin()`, which throws where there is no document. A machine
    // driven with no page has nothing to show: that is a silence, not a crash.
    expect(() => harness.service.start()).not.toThrow();
    expect(harness.api().status).toBe("loading");
  });

  it("carries the size through as presentation, with no fork in the machine", () => {
    for (const size of ["xs", "sm", "md", "lg", "xl"] as const) {
      const harness = build({ size });

      expect(harness.api().getRootProps()["data-size"]).toBe(size);
      expect(harness.service.state.get()).toBe("loading");
    }
  });

  it("mirrors the direction it was handed", () => {
    expect(build({ dir: "rtl" }).api().getRootProps().dir).toBe("rtl");
  });
});
