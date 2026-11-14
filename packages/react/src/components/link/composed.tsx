/**
 * `<Link href="…">…</Link>` — the anchor and the two companion parts of the
 * outbound affordance, in the one order the accessible name depends on: the
 * text, then the glyph, then the sr-only wording. Three nodes at most, no
 * collection, and the smallest composed layer in the navigation family.
 *
 * **`asChild` is omitted, and that is a correctness fix rather than tidiness.**
 * `LinkRoot` infers `nativeLink` from what it is about to render, and the two
 * branches of that inference read different things: `render` is read as the
 * element it is, while `asChild` sends `isNativeLink` to the root's *children*
 * instead (`link.tsx`, `onlyElement` → `Children.count(children) === 1`). In the
 * composed form those children are the layer's — the consumer's text plus
 * whichever of the two companion parts were asked for — so the inference would be
 * answering about a tree the consumer never wrote: one child on the minimal form,
 * three on the outbound one, and either way an element that is not what
 * `asChild` was pointed at. `render` is unaffected and stays, which is also the
 * substitution that matters here: a router's `Link` renders an `<a>` and the
 * inference is written to lean that way.
 *
 * **Both companion parts are gated on the consumer's content, never on
 * `external`.** That is the parts form's own behaviour — `getExternalIconProps`
 * and `getExternalLabelProps` each write `hidden: !external`, so the machine is
 * what makes them appear and disappear — and keeping placement independent of the
 * flag preserves the property this component's page states: toggling `external`
 * on a mounted link changes an attribute and remounts nothing.
 *
 * **`icon` is placed only once it is supplied**, and that one is about pixels
 * rather than semantics. `_link.scss` gives `link:external-icon` a 0.65em box and
 * a 0.3em inline margin and draws nothing inside it — there is no `:empty`
 * default here, unlike the chevrons and checkmarks elsewhere, because the
 * outbound mark is the one symbol this library never picked for the consumer.
 * Placed empty it is a third of an em of visible nothing in the middle of a
 * sentence. Hence the case-(c) guard: React renders `false` as nothing, so
 * `icon={isExternal && <ArrowUpRight/>}` would otherwise reach the part as a
 * falsy child rather than as an absent slot.
 *
 * **`externalLabel` is a name, not a slot.** `getExternalLabelProps` writes the
 * part token and `hidden` and nothing that says anything; the words are the
 * consumer's, and so is their language (WCAG G201 — warn before a new window
 * opens; H83 — say it in the link's own text). The part is `sr-only` in the sheet
 * and lives *inside* the anchor, so the wording joins the accessible name with no
 * `aria-describedby` to keep in sync. The empty string counts as absent, the way
 * `Dialog.closeLabel` and `MenuContent.cancelLabel` already read it: an empty
 * sr-only span adds nothing to the name and one node to every link on the page.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import { LinkExternalIcon, LinkExternalLabel, LinkRoot, type UseLinkProps } from "./link";

/**
 * The escape hatch, applied **last** on both parts: what the layer defaults is a
 * default, and the consumer's entry wins over it — including over the `hidden`
 * and `aria-hidden` the machine writes itself. No `root` key, because the root's
 * props *are* the composed props; and no `Omit` of `id` or of an IDREF, unlike the
 * collections, since each of these two parts is placed once — a fixed id here is a
 * fixed id and not the same one repeated down a list.
 */
export interface LinkParts {
  readonly externalIcon?: PartProps<"span"> | undefined;
  readonly externalLabel?: PartProps<"span"> | undefined;
}

export interface LinkComposedProps
  extends UseLinkProps,
    Omit<PartProps<"a", UseLinkProps>, "children" | "asChild"> {
  /** The link text — what names the link, and the only thing that can. */
  readonly children?: ReactNode;
  /** The outbound glyph: an inline SVG, never a text character — see above. */
  readonly icon?: ReactNode;
  /**
   * The "opens in a new tab" wording, hidden visually and read as part of the
   * name. Empty counts as absent.
   */
  readonly externalLabel?: string | undefined;
  readonly parts?: LinkParts | undefined;
}

export function Link(props: LinkComposedProps): ReactNode {
  const { children, icon, externalLabel, parts, ...root } = props;

  return (
    <LinkRoot {...root}>
      {children}
      {/* Case (c): the sheet sizes this box and draws nothing in it, so a falsy
          slot placed anyway is 0.65em plus a 0.3em margin of visible nothing
          inside a run of text. */}
      {icon == null || icon === false ? null : (
        <LinkExternalIcon {...parts?.externalIcon}>{icon}</LinkExternalIcon>
      )}
      {externalLabel == null || externalLabel === "" ? null : (
        <LinkExternalLabel {...parts?.externalLabel}>{externalLabel}</LinkExternalLabel>
      )}
    </LinkRoot>
  );
}
