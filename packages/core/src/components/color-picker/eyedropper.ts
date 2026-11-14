/**
 * The screen picker, opt-in at `@standarui/core/color-picker/eyedropper` — the
 * one progressive enhancement in the component, and the only piece of it that
 * talks to an API no other engine has. `EyeDropper` ships on Chromium 95+ and on
 * nothing else (MDN, caniuse); a picker built on the assumption that it exists
 * would throw everywhere else.
 *
 * A sub-path rather than a part of the picker, the split decision 34 prescribes
 * over a raised ceiling: a consumer who never passes `eyedropper` downloads none
 * of it, and the machine knows only the shape it is handed. Nothing but types is
 * imported from the core, or the picker's own bytes would be bundled twice.
 *
 * The types are declared here rather than pulled from a lib: `EyeDropper` is not
 * in TypeScript's DOM library, and a global `declare` would tell every consumer's
 * compiler that the API exists on every engine.
 */

import type { EffectCleanup, MachineParams } from "../../machine/types";
import type { ColorPickerEyedropper, ColorPickerSchema } from "./color-picker.types";

type Params = MachineParams<ColorPickerSchema>;

interface EyeDropperResult {
  readonly sRGBHex: string;
}

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}

type EyeDropperConstructor = new () => EyeDropperInstance;

function eyeDropperOf(win: Window): EyeDropperConstructor | undefined {
  return (win as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

/**
 * Read in an effect rather than at render for the only reason that matters: the
 * server has no `EyeDropper` and neither does Firefox or WebKit, so a render-time
 * read would either mismatch on hydration or ship a trigger that throws.
 *
 * Read straight through, with no frame in between — the arrangement
 * `trackEnvironment` already uses. Effects install *after* the render hydration
 * compares against, so the write cannot cause a mismatch; a deferral would only
 * put the answer outside the adapter's own commit, which on React means a state
 * update nothing is holding.
 *
 * No listener either: support does not change while a page is open; the machine
 * asks again only when the `eyedropper` prop does. The disposer
 * is also where an in-flight pick is called off — the surface can go away while
 * the browser still owns the pointer.
 */
function detectEyedropper({ context, refs, scope }: Params): EffectCleanup {
  if (scope.getRootNode() === null) return;
  context.set("eyedropperSupported", eyeDropperOf(scope.getWin()) !== undefined);
  return () => {
    refs.get("eyedropperAbort")?.abort();
    refs.set("eyedropperAbort", null);
  };
}

/**
 * A promise with a way out. Both ends of it check that the ref still points at
 * *this* pick before writing anything: a surface that closed mid-gesture aborted
 * the controller and dropped the handle, and a resolution arriving afterwards
 * belongs to nobody.
 *
 * The rejection path writes no value, reports no change and announces nothing —
 * an Escape during the capture is not an event to narrate.
 */
function openEyedropper({ scope, refs, send }: Params): void {
  const win = scope.getWin();
  const Picker = eyeDropperOf(win);
  if (Picker === undefined) {
    send({ type: "EYEDROPPER.DISMISS", reason: "error" });
    return;
  }
  refs.get("eyedropperAbort")?.abort();
  const controller = new win.AbortController();
  refs.set("eyedropperAbort", controller);

  new Picker().open({ signal: controller.signal }).then(
    (result) => {
      if (refs.get("eyedropperAbort") !== controller) return;
      refs.set("eyedropperAbort", null);
      send({ type: "EYEDROPPER.RESULT", sRGBHex: result.sRGBHex });
    },
    (error: unknown) => {
      if (refs.get("eyedropperAbort") !== controller) return;
      refs.set("eyedropperAbort", null);
      send({
        type: "EYEDROPPER.DISMISS",
        reason: error instanceof Error && error.name === "AbortError" ? "abort" : "error",
      });
    },
  );
}

/** What `eyedropper` takes on the picker; without it the part never renders. */
export const eyedropper: ColorPickerEyedropper = {
  detect: detectEyedropper,
  open: openEyedropper,
};
