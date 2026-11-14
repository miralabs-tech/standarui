/**
 * The trail's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id` and `label`. `label` names the `nav` landmark and is not
 * defaulted by the machine, so an unpinned row would compare two unnamed
 * landmarks and prove the parity of a defect.
 */

import type { ParityCase } from "../../composed.harness";
import {
  BreadcrumbEllipsis,
  BreadcrumbEllipsisTrigger,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbRoot,
} from "./breadcrumb";
import { Breadcrumb } from "./composed";

export const parity: readonly ParityCase[] = [
  /**
   * The flat trail, and the derivation that carries it: the last entry keeps no
   * `href`, takes `aria-current` and renders through a `span`. The parts side
   * writes out what that costs by hand.
   */
  {
    name: "breadcrumb",
    composed: (
      <Breadcrumb
        id="flat"
        label="Flat path"
        items={[
          { label: "Home", href: "#home" },
          { label: "Library", href: "#library" },
          { label: "Photographs", href: "#photographs" },
        ]}
      />
    ),
    parts: (
      <BreadcrumbRoot id="flat" label="Flat path">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#home">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink href="#library">Library</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink current render={<span />}>
              Photographs
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>
    ),
  },
  /**
   * The fold. The reveal button is placed immediately before the first collapsed
   * level and nowhere else — the one thing `items` cannot express, and therefore
   * the one worth pinning to the character.
   */
  {
    name: "breadcrumb",
    composed: (
      <Breadcrumb
        id="folded"
        label="Folded path"
        items={[
          { label: "Home", href: "#home" },
          { label: "Library", href: "#library", collapsed: true },
          { label: "Photographs", href: "#photographs", collapsed: true },
          { label: "2026", href: "#2026" },
        ]}
      />
    ),
    parts: (
      <BreadcrumbRoot id="folded" label="Folded path">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#home">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbEllipsis>
            <BreadcrumbEllipsisTrigger />
          </BreadcrumbEllipsis>
          <BreadcrumbItem collapsed>
            <BreadcrumbLink href="#library">Library</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem collapsed>
            <BreadcrumbLink href="#photographs">Photographs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink current render={<span />}>
              2026
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>
    ),
  },
  /**
   * `parts` applied **last**, reaching every element of each collection rather
   * than the first — and `defaultExpanded`, which unfolds the trail without
   * removing the ellipsis from the markup.
   */
  {
    name: "breadcrumb",
    composed: (
      <Breadcrumb
        id="hatched"
        label="Hatched path"
        defaultExpanded
        parts={{
          list: { className: "trail" },
          ellipsis: { className: "fold" },
          ellipsisTrigger: { className: "fold-button" },
          item: { className: "level" },
          link: { className: "step" },
        }}
        items={[
          { label: "Home", href: "#home" },
          { label: "Library", href: "#library", collapsed: true },
          { label: "2026", href: "#2026" },
        ]}
      />
    ),
    parts: (
      <BreadcrumbRoot id="hatched" label="Hatched path" defaultExpanded>
        <BreadcrumbList className="trail">
          <BreadcrumbItem className="level">
            <BreadcrumbLink href="#home" className="step">
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbEllipsis className="fold">
            <BreadcrumbEllipsisTrigger className="fold-button" />
          </BreadcrumbEllipsis>
          <BreadcrumbItem collapsed className="level">
            <BreadcrumbLink href="#library" className="step">
              Library
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem className="level">
            <BreadcrumbLink current render={<span />} className="step">
              2026
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>
    ),
  },
];
