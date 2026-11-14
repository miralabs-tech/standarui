import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./avatar.anatomy";
import { getImageId, getRootId } from "./avatar.dom";
import type { AvatarApi, AvatarSchema } from "./avatar.types";

export function connect<T extends PropTypes>(
  service: Service<AvatarSchema>,
  normalize: NormalizeProps<T>,
): AvatarApi<T> {
  const { state, context, prop, send, scope } = service;

  const status = state.get();
  const label = prop("label");
  const showFallback =
    status === "error" ||
    !context.get("hasImage") ||
    (status === "loading" && context.get("delayElapsed"));

  return {
    status,
    loaded: status === "loaded",
    showFallback,

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        // Without `label` there is no role and no name from the core: the
        // accessible name lives in the image's alt or in adjacent text.
        //
        // With it the whole avatar is one image, and that is what makes the name
        // survive a 404 — an errored `<img>` leaves the accessibility tree with
        // its `hidden`, taking its `alt` with it, and the monogram behind it is
        // decorative. A name carried by the root depends on nothing that can
        // fail. `role="img"` also makes the subtree presentational, so the inner
        // `alt` cannot double up.
        role: label === undefined ? undefined : "img",
        "aria-label": label,
        dir: prop("dir"),
        "data-state": status,
        "data-size": prop("size"),
      }),

    getImageProps: (): T["img"] =>
      normalize.img({
        ...parts.image.attrs,
        id: getImageId(scope),
        "data-state": status,
        // `hidden`, not CSS: a broken image paints the browser's glyph even
        // under an absent stylesheet, so the core removes it itself.
        hidden: status === "error" ? true : undefined,
        // An avatar is not a document to drag off the page.
        draggable: false,
        // Never `alt` — it belongs to the consumer and flows in as element props.
        onLoad: () => send({ type: "IMAGE.LOAD" }),
        onError: () => send({ type: "IMAGE.ERROR" }),
      }),

    getFallbackProps: (): T["element"] =>
      normalize.element({
        ...parts.fallback.attrs,
        "data-state": status,
        hidden: showFallback ? undefined : true,
        // Decorative typography: the accessible name lives in the alt or in
        // adjacent text, never in a monogram.
        "aria-hidden": "true",
      }),
  };
}
