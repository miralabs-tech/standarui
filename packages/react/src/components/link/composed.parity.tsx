/**
 * The link's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. `getRootProps` writes the root's own id from the scope
 * (`link:<id>:root`), so an unpinned row would compare two different `useId`
 * counters on the one attribute both forms are certain to carry.
 */

import { BOLT, type ParityCase } from "../../composed.harness";
import { Link } from "./composed";
import { LinkExternalIcon, LinkExternalLabel, LinkRoot } from "./link";

/**
 * Shared between the two fixtures of the substituted row on purpose: `useRender`
 * *clones* what it is handed rather than mounting it, so one element can stand in
 * two trees without either seeing the other's props.
 */
const SPAN = <span />;

export const parity: readonly ParityCase[] = [
  /** The minimal form, and the whole of it: an anchor, its text, neither companion part. */
  {
    name: "link",
    composed: (
      <Link id="docs" href="/docs">
        Read the documentation
      </Link>
    ),
    parts: (
      <LinkRoot id="docs" href="/docs">
        Read the documentation
      </LinkRoot>
    ),
  },
  /**
   * Both conditionals present, and the DOM order pinned with them. The order is
   * the order the name is read in — `link:external-label` sits *inside* the
   * anchor rather than beside it — so a layer that placed the wording first would
   * pass every attribute check there is and still announce "(opens in a new tab)
   * The ARIA specification".
   */
  {
    name: "link",
    composed: (
      <Link
        id="aria"
        href="https://www.w3.org/TR/wai-aria-1.2/"
        external
        icon={BOLT}
        externalLabel="(opens in a new tab)"
      >
        The ARIA specification
      </Link>
    ),
    parts: (
      <LinkRoot id="aria" href="https://www.w3.org/TR/wai-aria-1.2/" external>
        The ARIA specification
        <LinkExternalIcon>{BOLT}</LinkExternalIcon>
        <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>
    ),
  },
  /**
   * The glyph without the wording. Nothing in the layer couples the two parts,
   * which is what this row and the next one prove between them: a page that marks
   * its outbound links and says the sentence once, above the list, places one part
   * and not two.
   */
  {
    name: "link",
    composed: (
      <Link id="changelog" href="https://example.com/changelog" external icon={BOLT}>
        The changelog
      </Link>
    ),
    parts: (
      <LinkRoot id="changelog" href="https://example.com/changelog" external>
        The changelog
        <LinkExternalIcon>{BOLT}</LinkExternalIcon>
      </LinkRoot>
    ),
  },
  /**
   * The other half — the wording with no mark — plus `aria-current`, which the
   * connect writes twice from one prop: `aria-current="page"` for the
   * accessibility tree and `data-current="page"` for the sheet, which answers it
   * in weight rather than in colour.
   */
  {
    name: "link",
    composed: (
      <Link
        id="status"
        href="https://status.example.com"
        external
        current="page"
        externalLabel="(opens in a new tab)"
      >
        Service status
      </Link>
    ),
    parts: (
      <LinkRoot id="status" href="https://status.example.com" external current="page">
        Service status
        <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>
    ),
  },
  /**
   * The rule no row above exercises: `parts` is applied **last**, so it wins over
   * what the machine itself wrote. Two witnesses, and both are values the layer
   * never chooses and the machine always does — `getExternalIconProps` writes
   * `aria-hidden="true"` on every render, and both getters write `hidden` while
   * `external` is false, which it is here because nothing sets it.
   *
   * Typed attributes on purpose. React's prop types carry no `data-${string}`
   * index signature, so a `parts` entry cannot spell `data-external`; a witness
   * has to be something the element's own type already names.
   */
  {
    name: "link",
    composed: (
      <Link
        id="internal"
        href="/settings"
        icon={BOLT}
        externalLabel="(opens in a new tab)"
        parts={{
          externalIcon: { "aria-hidden": "false", className: "mark" },
          externalLabel: { hidden: false },
        }}
      >
        Settings
      </Link>
    ),
    parts: (
      <LinkRoot id="internal" href="/settings">
        Settings
        <LinkExternalIcon aria-hidden="false" className="mark">
          {BOLT}
        </LinkExternalIcon>
        <LinkExternalLabel hidden={false}>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>
    ),
  },
  /**
   * The inference, reached from the composed form. `isNativeLink` answers `false`
   * for an intrinsic that is not `<a>`, and the connect turns that answer into
   * `role="link"` and the `tabindex="0"` a `<span>` would not otherwise have —
   * the whole substituted path, through a prop this layer only forwards. The
   * layer's own children ride along beside it and change none of it, which is the
   * half `asChild` could not have kept: that branch reads the children instead.
   */
  {
    name: "link",
    composed: (
      <Link id="router" render={SPAN} href="/settings" icon={BOLT}>
        Settings
      </Link>
    ),
    parts: (
      <LinkRoot id="router" render={SPAN} href="/settings">
        Settings
        <LinkExternalIcon>{BOLT}</LinkExternalIcon>
      </LinkRoot>
    ),
  },
];
