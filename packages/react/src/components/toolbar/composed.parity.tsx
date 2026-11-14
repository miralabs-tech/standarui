/**
 * The bar's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id` and `label`. `label` names the `toolbar` role and the machine
 * does not default it; every stop also pins its `value`, which the composed side
 * requires and the parts side would otherwise fill from a `useId` — two different
 * counters, one guaranteed mismatch.
 */

import type { ReactElement } from "react";
import type { ParityCase } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { ToggleRoot } from "../toggle/toggle";
import { Toolbar } from "./composed";
import {
  ToolbarGroup,
  ToolbarItem,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSpacer,
  ToolbarTitle,
} from "./toolbar";

// biome-ignore lint/a11y/useAnchorContent: the anchor is a substitution handed to `useRender`, which fills it with the item's text.
const HOME_LINK: ReactElement = <a href="/" aria-current="page" />;
// biome-ignore lint/a11y/useAnchorContent: the anchor is a substitution handed to `useRender`, which fills it with the item's text.
const SEARCH_LINK: ReactElement = <a href="/search" />;

export const parity: readonly ParityCase[] = [
  /** The flat bar: three stops, no group, no rule. */
  {
    name: "toolbar",
    composed: (
      <Toolbar
        id="tools"
        label="Tools"
        orientation="vertical"
        items={[
          { value: "select", label: "Select", render: <ButtonRoot variant="plain" /> },
          { value: "draw", label: "Draw", render: <ButtonRoot variant="plain" /> },
          {
            value: "erase",
            label: "Erase",
            render: <ButtonRoot variant="plain" />,
            disabled: true,
          },
        ]}
      />
    ),
    parts: (
      <ToolbarRoot id="tools" label="Tools" orientation="vertical">
        <ToolbarItem value="select" render={<ButtonRoot variant="plain" />}>
          Select
        </ToolbarItem>
        <ToolbarItem value="draw" render={<ButtonRoot variant="plain" />}>
          Draw
        </ToolbarItem>
        <ToolbarItem value="erase" disabled render={<ButtonRoot variant="plain" />}>
          Erase
        </ToolbarItem>
      </ToolbarRoot>
    ),
  },
  /**
   * All four entry shapes in one bar, which is the narrowing this file exists to
   * pin: a group carrying its name as an attribute, a rule, a spacer, and a stop
   * sitting directly on the root beside them.
   */
  {
    name: "toolbar",
    composed: (
      <Toolbar
        id="document"
        label="Document"
        items={[
          {
            id: "style",
            label: "Text style",
            options: [
              { value: "bold", label: "Bold", render: <ToggleRoot /> },
              { value: "italic", label: "Italic", render: <ToggleRoot /> },
            ],
          },
          { separator: true },
          {
            id: "history",
            label: "History",
            options: [{ value: "undo", label: "Undo", render: <ButtonRoot variant="plain" /> }],
          },
          { spacer: true },
          { value: "share", label: "Share", render: <ButtonRoot variant="plain" /> },
        ]}
      />
    ),
    parts: (
      <ToolbarRoot id="document" label="Document">
        <ToolbarGroup aria-label="Text style">
          <ToolbarItem value="bold" render={<ToggleRoot />}>
            Bold
          </ToolbarItem>
          <ToolbarItem value="italic" render={<ToggleRoot />}>
            Italic
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup aria-label="History">
          <ToolbarItem value="undo" render={<ButtonRoot variant="plain" />}>
            Undo
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarSpacer />
        <ToolbarItem value="share" render={<ButtonRoot variant="plain" />}>
          Share
        </ToolbarItem>
      </ToolbarRoot>
    ),
  },
  /**
   * `icon` before the label, and `parts` applied **last** — reaching every stop of
   * both the group and the root rather than the first of either.
   */
  {
    name: "toolbar",
    composed: (
      <Toolbar
        id="hatched"
        label="Hatched"
        parts={{ group: { className: "cluster" }, item: { className: "stop" } }}
        items={[
          {
            id: "style",
            label: "Text style",
            options: [{ value: "bold", label: "Bold", icon: <span aria-hidden>B</span> }],
          },
          { value: "share", label: "Share", icon: <span aria-hidden>↗</span> },
        ]}
      />
    ),
    parts: (
      <ToolbarRoot id="hatched" label="Hatched">
        <ToolbarGroup aria-label="Text style" className="cluster">
          <ToolbarItem value="bold" className="stop">
            <span aria-hidden>B</span>
            Bold
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarItem value="share" className="stop">
          <span aria-hidden>↗</span>
          Share
        </ToolbarItem>
      </ToolbarRoot>
    ),
  },
  /**
   * A navigation bar: the row of controls with a spacer between its two clusters,
   * and the large title under it. The title is positional, so the entry order is
   * the markup order.
   */
  {
    name: "toolbar",
    composed: (
      <Toolbar
        id="library"
        label="Library"
        data-variant="navigation-bar"
        items={[
          {
            id: "leading",
            label: "Navigation",
            options: [{ value: "back", label: "Back", render: <ButtonRoot variant="plain" /> }],
          },
          { spacer: true },
          {
            id: "trailing",
            label: "Actions",
            options: [{ value: "add", label: "Add", render: <ButtonRoot variant="plain" /> }],
          },
          { title: "Library", size: "large" },
        ]}
      />
    ),
    parts: (
      <ToolbarRoot id="library" label="Library" data-variant="navigation-bar">
        <ToolbarGroup aria-label="Navigation">
          <ToolbarItem value="back" render={<ButtonRoot variant="plain" />}>
            Back
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarSpacer />
        <ToolbarGroup aria-label="Actions">
          <ToolbarItem value="add" render={<ButtonRoot variant="plain" />}>
            Add
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarTitle size="large">Library</ToolbarTitle>
      </ToolbarRoot>
    ),
  },
  /**
   * A tab bar: one island of links, the current page carried by `aria-current` on
   * the anchor the item renders, never by a tab role.
   */
  {
    name: "toolbar",
    composed: (
      <Toolbar
        id="sections"
        label="Sections"
        data-variant="tab-bar"
        items={[
          {
            id: "pages",
            label: "Pages",
            options: [
              { value: "home", label: "Home", render: HOME_LINK },
              { value: "search", label: "Search", render: SEARCH_LINK },
            ],
          },
        ]}
      />
    ),
    parts: (
      <ToolbarRoot id="sections" label="Sections" data-variant="tab-bar">
        <ToolbarGroup aria-label="Pages">
          <ToolbarItem value="home" render={<a href="/" aria-current="page" />}>
            Home
          </ToolbarItem>
          <ToolbarItem value="search" render={<a href="/search" />}>
            Search
          </ToolbarItem>
        </ToolbarGroup>
      </ToolbarRoot>
    ),
  },
];
