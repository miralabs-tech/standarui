/**
 * The avatar's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. The root's DOM id and the image's are both minted from the
 * machine's scope id, so an unpinned row would compare two different `useId`
 * counters — and the composed form sits one component deeper in the tree than the
 * parts form, which is exactly the kind of difference React's own ids record.
 *
 * No row needs the portal stood down: this component has no surface and writes no
 * IDREF at all, so nothing here can dangle.
 */

import type { ParityCase } from "../../composed.harness";
import { AvatarFallback, AvatarImage, AvatarRoot } from "./avatar";
import { Avatar } from "./composed";

/** A picture that needs no network, so a row asserts markup and never a request. */
const PORTRAIT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Ccircle cx='4' cy='4' r='4' fill='%230a84ff'/%3E%3C/svg%3E";

export const parity: readonly ParityCase[] = [
  /** The whole component: a picture, a monogram behind it, and one name above both. */
  {
    name: "avatar",
    composed: (
      <Avatar id="ada" label="Ada Lovelace" src={PORTRAIT}>
        AL
      </Avatar>
    ),
    parts: (
      <AvatarRoot id="ada" label="Ada Lovelace">
        <AvatarImage src={PORTRAIT} alt="" />
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>
    ),
  },
  /**
   * No `src`: the image part is not placed at all, never placed blank. The machine
   * reads that off the tree — `PARTS.SYNC` clears `hasImage` — and `showFallback`
   * follows from it, so an absent picture and a failed one reach the same monogram
   * by two different routes.
   */
  {
    name: "avatar",
    composed: (
      <Avatar id="grace" label="Grace Hopper">
        GH
      </Avatar>
    ),
    parts: (
      <AvatarRoot id="grace" label="Grace Hopper">
        <AvatarFallback>GH</AvatarFallback>
      </AvatarRoot>
    ),
  },
  /**
   * Neither slot: no fallback part, and the root carries neither `role` nor
   * `aria-label` — `getRootProps` keys the role on `label` being given, so an
   * unnamed avatar is a decoration rather than a nameless `img`. The picture's
   * `alt=""` says the same thing from the other side.
   */
  {
    name: "avatar",
    composed: <Avatar id="anon" src={PORTRAIT} />,
    parts: (
      <AvatarRoot id="anon">
        <AvatarImage src={PORTRAIT} alt="" />
      </AvatarRoot>
    ),
  },
  /**
   * `src=""` is absent, not a picture. Left through, the browser would resolve the
   * empty string against the base URL and fetch the document itself — a real
   * request that then fails to decode, landing the machine in `error` for a
   * picture nobody asked for. The row is the same markup as the one two above.
   */
  {
    name: "avatar",
    composed: (
      <Avatar id="pending" label="Alan Turing" src="">
        AT
      </Avatar>
    ),
    parts: (
      <AvatarRoot id="pending" label="Alan Turing">
        <AvatarFallback>AT</AvatarFallback>
      </AvatarRoot>
    ),
  },
  /**
   * The rule no row above exercises: `parts` is applied **last**, so it wins over
   * both the layer's own default and the machine's. All three flip at once —
   * `alt=""` is the layer's, `draggable={false}` and `aria-hidden="true"` are
   * `getImageProps` and `getFallbackProps`, values this layer never chooses. An
   * avatar named by its picture rather than by its root is what `parts.image.alt`
   * is for, and this is the row that proves the door is open.
   */
  {
    name: "avatar",
    composed: (
      <Avatar
        id="katherine"
        label="Katherine Johnson"
        src={PORTRAIT}
        parts={{
          image: { alt: "Katherine Johnson", draggable: true },
          fallback: { "aria-hidden": "false" },
        }}
      >
        KJ
      </Avatar>
    ),
    parts: (
      <AvatarRoot id="katherine" label="Katherine Johnson">
        <AvatarImage src={PORTRAIT} alt="Katherine Johnson" draggable />
        <AvatarFallback aria-hidden="false">KJ</AvatarFallback>
      </AvatarRoot>
    ),
  },
  /**
   * `fallbackDelay` is forwarded, and forwarding is what a parity table checks.
   * It is also the one machine prop visible in a server render: `delayElapsed`
   * defaults to `fallbackDelay <= 0`, so a positive delay leaves `showFallback`
   * false at the first pass and the monogram ships carrying `hidden` — the
   * anti-flash opt-in, present in the markup before any clock has run.
   */
  {
    name: "avatar",
    composed: (
      <Avatar id="mae" label="Mae Jemison" src={PORTRAIT} fallbackDelay={300}>
        MJ
      </Avatar>
    ),
    parts: (
      <AvatarRoot id="mae" label="Mae Jemison" fallbackDelay={300}>
        <AvatarImage src={PORTRAIT} alt="" />
        <AvatarFallback>MJ</AvatarFallback>
      </AvatarRoot>
    ),
  },
];
