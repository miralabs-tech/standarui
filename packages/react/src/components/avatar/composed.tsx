/**
 * `<Avatar label="…" src="…">AL</Avatar>` — three nodes, no collection, and the
 * one composed layer here whose whole argument is an attribute the consumer is
 * asked *not* to write.
 *
 * **The layer writes `alt=""` on the image, and that is the accessibility fact
 * rather than a default worth overriding.** An avatar is named once, on the root:
 * `getRootProps` turns `label` into `role="img"` plus `aria-label`, so the
 * picture, the monogram and the loading state read as a single image to assistive
 * technology. A name carried by the alt instead is a name that disappears exactly
 * when it is needed — `getImageProps` writes `hidden` on `error`, which takes the
 * whole element out of the accessibility tree and its `alt` with it, and the
 * monogram behind it is decorative typography (`getFallbackProps` writes
 * `aria-hidden="true"`). The result would be an avatar announced while the network
 * is up and silent when it is down, which is the wrong way round. `role="img"`
 * also makes the subtree presentational, so an inner name could not double up
 * anyway. There is deliberately no `alt` prop: an avatar that really is named by
 * its picture reaches the attribute through `parts.image.alt`, where the choice is
 * explicit, and so does `srcSet`, `sizes` or a `loading` hint.
 *
 * **`src` is a string and the empty string counts as absent.** `""` on an `<img>`
 * is not "no picture" to a browser — it resolves against the base URL and fetches
 * the document itself, which then fails to decode, which lands the machine in
 * `error` for a picture nobody asked for. The rule is `dialog`'s `closeLabel`
 * rule, and here the cost of getting it wrong is a real request. Absent, the image
 * part is not rendered at all rather than rendered blank: the machine watches for
 * it (`PARTS.SYNC`) and `showFallback` follows from `!hasImage` on its own.
 *
 * **The fallback is `children`, not `icon`.** It is the component's one content
 * slot — the monogram, or the consumer's own silhouette SVG, which `_avatar.scss`
 * sizes against the disc. `icon` in this library means the single leading track
 * shared with a selection checkmark, reserved once per surface, and an avatar has
 * no track: both parts occupy the same grid cell. Left out, the fallback part is
 * not placed and the disc is the empty state.
 *
 * The order is the picture then the monogram, which is the order every example of
 * the parts form already writes, and it is not layout: both parts are
 * `grid-area: 1 / 1`, and which one is visible is decided by `hidden` on the
 * fallback and `opacity` on the image, never by their position.
 *
 * `label`, `size` and `fallbackDelay` are the machine's own props, inherited and
 * forwarded untouched — never re-declared here.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { AvatarFallback, AvatarImage, AvatarRoot, type UseAvatarProps } from "./avatar";

/**
 * The escape hatch, applied **last** on every part: what the layer defaults is a
 * default, and the consumer's entry wins over it — including the `alt=""` above
 * and the machine's own `draggable` and `aria-hidden`. No `Omit` of `id` here,
 * unlike the collections: each of these two parts is placed once, so a fixed id is
 * a fixed id and not the same one repeated down a list.
 */
export interface AvatarParts {
  readonly image?: PartProps<"img"> | undefined;
  readonly fallback?: PartProps<"span"> | undefined;
}

export interface AvatarComposedProps
  extends UseAvatarProps,
    Omit<PartProps<"span", UseAvatarProps>, "children"> {
  /**
   * The picture. Absent — or `""`, which counts as absent — no image part is
   * placed at all, and the monogram is what the avatar is.
   */
  readonly src?: string | undefined;
  /** The fallback: initials, or a silhouette. See above for why it is `children`. */
  readonly children?: ReactNode;
  readonly parts?: AvatarParts | undefined;
}

export function Avatar(props: AvatarComposedProps): ReactNode {
  const { src, children, parts, ...root } = props;

  return (
    <AvatarRoot {...root}>
      {src == null || src === "" ? null : <AvatarImage src={src} alt="" {...parts?.image} />}
      {children == null ? null : <AvatarFallback {...parts?.fallback}>{children}</AvatarFallback>}
    </AvatarRoot>
  );
}
