import type { PropTypes } from "../../machine/prop-types";
import type { MachineSchema } from "../../machine/types";
import type { Direction } from "../../types";

/** The machine state IS the loading status — there is no second copy to drift. */
export type AvatarStatus = "loading" | "loaded" | "error";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarStatusChangeDetails {
  readonly status: AvatarStatus;
}

export interface AvatarMachineProps {
  readonly dir?: Direction | undefined;
  /** Pure presentation — `data-size` on the root, never a fork in the machine. */
  readonly size?: AvatarSize | undefined;
  /**
   * Milliseconds before the fallback shows while `loading`. 0 shows it
   * immediately (the default — the monogram is
   * visible at once); a positive delay is the anti-flash opt-in for images
   * that usually arrive fast. Once revealed it stays eligible through
   * reloads — no re-flash.
   */
  readonly fallbackDelay?: number | undefined;
  /**
   * The name the avatar answers to, whether the picture arrived or not.
   *
   * Without it the accessible name lives entirely in the image's `alt`, which
   * the consumer passes as element props — and that name **disappears on a
   * 404**: an errored image is removed from the accessibility tree with
   * `hidden`, and the monogram that replaces it is decorative typography, not a
   * name. The result is an avatar that is announced while the network is up and
   * silent when it is down, which is the wrong way round.
   *
   * With it, the root becomes a single named `role="img"` — the picture, the
   * monogram and the loading state are all one image as far as assistive
   * technology is concerned, and the name never depends on the network. The
   * inner `alt` then has nothing left to say and should be `""`.
   */
  readonly label?: string | undefined;
  readonly onStatusChange?: ((details: AvatarStatusChangeDetails) => void) | undefined;
}

export interface ResolvedAvatarMachineProps extends AvatarMachineProps {
  readonly size: AvatarSize;
  readonly fallbackDelay: number;
}

export interface AvatarSchema extends MachineSchema {
  state: AvatarStatus;
  props: ResolvedAvatarMachineProps;
  context: { delayElapsed: boolean; hasImage: boolean };
  event:
    | { type: "IMAGE.LOAD" }
    | { type: "IMAGE.ERROR" }
    | { type: "IMAGE.SRC_CHANGE" }
    | { type: "DELAY.ELAPSED" }
    | { type: "PARTS.SYNC" };
  action: "revealFallback" | "syncParts" | "notifyLoading" | "notifyLoaded" | "notifyError";
  guard: "imageAppeared";
  effect: "trackParts" | "waitFallbackDelay" | "checkImageState" | "trackSrcChange";
}

export interface AvatarApi<T extends PropTypes = PropTypes> {
  readonly status: AvatarStatus;
  readonly loaded: boolean;
  readonly showFallback: boolean;
  getRootProps(): T["element"];
  getImageProps(): T["img"];
  getFallbackProps(): T["element"];
}
