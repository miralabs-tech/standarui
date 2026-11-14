/**
 * The avatar against a real engine, driven with no framework at all.
 *
 * Everything here needs a page: `load` and `error` are events only a real
 * decoder fires, the src swap is a `MutationObserver` record, the missing part
 * is a `childList` record, and the fallback delay is a real clock. The machine's
 * own transitions are proved without a document in `avatar.test.ts`.
 *
 * No stylesheet is loaded in this harness, so the assertions are on attributes —
 * `data-state`, `hidden` — and never on opacity: the fade lives in the sheet and
 * asserting it here would test nothing that ships.
 */

import { afterEach, describe, expect, it } from "vitest";
import { type ApplyProps, type DomPropTypes, mountMachine, unmountAll } from "../harness";
import { connect } from "./avatar.connect";
import { machine } from "./avatar.machine";
import type { AvatarApi, AvatarMachineProps, AvatarSchema, AvatarStatus } from "./avatar.types";

type Api = AvatarApi<DomPropTypes>;
type Harness = ReturnType<typeof render>;

/** A 1×1 GIF and a 1×1 PNG: two real pictures, no network. */
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
/** Valid base64, and not an image: the decoder rejects it and fires `error`. */
const BROKEN = "data:image/png;base64,AAAAAAAA";

function markup(src: string | null): string {
  const attribute = src === null ? "" : ` src="${src}"`;
  return `
    <span data-slot="root">
      <img data-slot="image" alt=""${attribute}>
      <span data-slot="fallback">AB</span>
    </span>`;
}

function render(src: string | null, props: AvatarMachineProps = {}) {
  return mountMachine<AvatarSchema, Api>({
    machine,
    connect,
    html: markup(src),
    id: "a1",
    props,
    paint(host: HTMLElement, api: Api, apply: ApplyProps): void {
      const put = (slot: string, values: Record<string, unknown>): void => {
        // Looked up by slot rather than by position: one test takes the image
        // out of the tree, and a positional read would then hand the image's
        // props to the fallback.
        const node = host.querySelector(`[data-slot="${slot}"]`);
        if (node !== null) apply(node, values);
      };
      put("root", api.getRootProps());
      put("image", api.getImageProps());
      put("fallback", api.getFallbackProps());
    },
  });
}

function slot<T extends HTMLElement = HTMLElement>(harness: Harness, name: string): T {
  const node = harness.host.querySelector<T>(`[data-slot="${name}"]`);
  if (node === null) throw new Error(`no slot "${name}" in the harness markup`);
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Polls rather than waits a fixed span: a decode has no promised duration. */
async function until(assertion: () => boolean, budget = 1000): Promise<void> {
  const deadline = Date.now() + budget;
  while (!assertion()) {
    if (Date.now() > deadline) throw new Error("the avatar never reached the expected state");
    await wait(5);
  }
}

afterEach(() => {
  unmountAll();
});

describe("avatar in a page", () => {
  it("reaches `loaded` on a picture that decodes, and puts the monogram away", async () => {
    const harness = render(GIF);

    await until(() => harness.service.state.get() === "loaded");

    expect(slot(harness, "root").getAttribute("data-state")).toBe("loaded");
    expect(slot(harness, "image").getAttribute("data-state")).toBe("loaded");
    expect(slot(harness, "image").hasAttribute("hidden")).toBe(false);
    expect(slot(harness, "fallback").hasAttribute("hidden")).toBe(true);
    expect(harness.api().loaded).toBe(true);
  });

  it("takes the broken image out of the page itself and shows the monogram", async () => {
    const harness = render(BROKEN);

    await until(() => harness.service.state.get() === "error");

    expect(slot(harness, "root").getAttribute("data-state")).toBe("error");
    // The browser paints its own broken-image glyph, and no stylesheet is
    // required to be loaded for that. So the core removes the element.
    expect(slot(harness, "image").hasAttribute("hidden")).toBe(true);
    expect(slot(harness, "fallback").hasAttribute("hidden")).toBe(false);
  });

  it("holds the monogram back for the delay it was given, then shows it", async () => {
    // An image element with no `src` is `complete` and has decoded nothing: it
    // fires neither `load` nor `error`, ever. That is the gap the delay covers,
    // and the only way to hold a real page in `loading` on purpose.
    const harness = render(null, { fallbackDelay: 60 });

    expect(harness.service.state.get()).toBe("loading");
    expect(slot(harness, "fallback").hasAttribute("hidden")).toBe(true);

    await until(() => !slot(harness, "fallback").hasAttribute("hidden"));

    expect(harness.service.state.get()).toBe("loading");
    expect(harness.api().showFallback).toBe(true);
  });

  it("reads the status off an element that was already complete", async () => {
    const harness = render(PNG);
    await until(() => harness.service.state.get() === "loaded");

    // Back to `loading` against the very same element, which will never fire
    // `load` again — it has already fired. This is the hydration and disk-cache
    // case, and `checkImageState` is the only thing that answers it.
    harness.service.send({ type: "IMAGE.SRC_CHANGE" });
    expect(harness.service.state.get()).toBe("loading");

    await until(() => harness.service.state.get() === "loaded");
    expect(slot(harness, "fallback").hasAttribute("hidden")).toBe(true);
  });

  it("follows a src mutation from a broken picture to a good one", async () => {
    const statusLog: AvatarStatus[] = [];
    const harness = render(BROKEN, {
      onStatusChange: (details): void => {
        statusLog.push(details.status);
      },
    });

    await until(() => harness.service.state.get() === "error");

    slot(harness, "image").setAttribute("src", GIF);

    await until(() => harness.service.state.get() === "loaded");

    // The attribute record lands in a microtask and the `load` event in a task,
    // so the machine hears about the swap before it hears about the picture.
    expect(statusLog).toEqual(["error", "loading", "loaded"]);
    expect(slot(harness, "image").hasAttribute("hidden")).toBe(false);
  });

  it("shows the monogram when the image part leaves, and hides it when it comes back", async () => {
    const harness = render(GIF);
    await until(() => harness.service.state.get() === "loaded");

    const image = slot(harness, "image");
    image.remove();

    await until(() => !slot(harness, "fallback").hasAttribute("hidden"));
    // The status is unchanged — the picture that loaded is still loaded. What
    // changed is that there is nowhere to show it.
    expect(harness.service.state.get()).toBe("loaded");
    expect(harness.api().showFallback).toBe(true);

    slot(harness, "root").prepend(image);

    await until(() => slot(harness, "fallback").hasAttribute("hidden"));
    expect(harness.service.state.get()).toBe("loaded");
  });

  it("takes no tab stop anywhere in the component", async () => {
    const harness = render(GIF);
    await until(() => harness.service.state.get() === "loaded");

    for (const name of ["root", "image", "fallback"]) {
      expect(slot(harness, name).hasAttribute("tabindex")).toBe(false);
    }

    // A `<span>` with no tabindex cannot take focus, and the avatar declares
    // none: `focus()` on it is a no-op rather than a stop the reader has to
    // tab past. A clickable avatar is a button rendering an avatar root.
    slot(harness, "root").focus();
    expect(document.activeElement).not.toBe(slot(harness, "root"));
  });

  it("leaves the alt the consumer wrote alone", async () => {
    const harness = render(GIF);
    await until(() => harness.service.state.get() === "loaded");

    const image = slot(harness, "image");
    image.setAttribute("alt", "Ada Lovelace");
    harness.setProps({ size: "lg" });

    // A repaint writes `data-state` and `hidden`; `alt` is not the core's to
    // touch, so it survives.
    expect(image.getAttribute("alt")).toBe("Ada Lovelace");
    expect(slot(harness, "root").getAttribute("data-size")).toBe("lg");
  });
});
