/**
 * The rule the per-component node tests are instances of: **every component
 * connects without a DOM.**
 *
 * CDC:49 and :51 promise it, ROADMAP.md:139 ships it as a ticked box, and it was
 * false for five of eleven components — `progress`, `field`, `radio-group`,
 * `toggle-group`, `checkbox-group` all threw `ReferenceError: document is not
 * defined`. Nothing could see it, because every component test ran in a page.
 *
 * The table below is checked against the component folders on disk by
 * `scripts/component-coverage.test.ts` — the filesystem read lives there because
 * `tsconfig.base.json` deliberately gives this package no node types, and one
 * test is not a reason to hand the core a way to reach the filesystem.
 */

import { describe, expect, it } from "vitest";
import { connect as accordion, machine as accordionMachine } from "./accordion";
import { connect as avatar, machine as avatarMachine } from "./avatar";
import { connect as badge } from "./badge";
import { connect as breadcrumb, machine as breadcrumbMachine } from "./breadcrumb";
import { connect as button, machine as buttonMachine } from "./button";
import { connect as calendar, machine as calendarMachine } from "./calendar";
import { connect as card } from "./card";
import { connect as checkbox, machine as checkboxMachine } from "./checkbox";
import { connect as checkboxGroup, machine as checkboxGroupMachine } from "./checkbox-group";
import { connect as clipboard, machine as clipboardMachine } from "./clipboard";
import { connect as collapsible, machine as collapsibleMachine } from "./collapsible";
import { connect as colorPicker, machine as colorPickerMachine } from "./color-picker";
import { connect as dateField, machine as dateFieldMachine } from "./date-field";
import { connect as datePicker, machine as datePickerMachine } from "./date-picker";
import { connect as dialog, machine as dialogMachine } from "./dialog";
import { connect as drawer, machine as drawerMachine } from "./drawer";
import { connect as emptyState } from "./empty-state";
import { connect as field, machine as fieldMachine } from "./field";
import { connect as input, machine as inputMachine } from "./input";
import { connect as link, machine as linkMachine } from "./link";
import { connect as list } from "./list";
import { connect as listbox, machine as listboxMachine } from "./listbox";
import { connect as menu, machine as menuMachine } from "./menu";
import { connect as meter, machine as meterMachine } from "./meter";
import { connectWithoutDom, plainNormalizer } from "./node-harness";
import { connect as pagination, machine as paginationMachine } from "./pagination";
import { connect as popover, machine as popoverMachine } from "./popover";
import { connect as progress, machine as progressMachine } from "./progress";
import { connect as radioGroup, machine as radioGroupMachine } from "./radio-group";
import { connect as scrollArea, machine as scrollAreaMachine } from "./scroll-area";
import { connect as searchField, machine as searchFieldMachine } from "./search-field";
import { connect as select, machine as selectMachine } from "./select";
import { connect as separator } from "./separator";
import { connect as sidebar } from "./sidebar";
import { connect as slider, machine as sliderMachine } from "./slider";
import { connect as splitter, machine as splitterMachine } from "./splitter";
import { connect as switchControl, machine as switchMachine } from "./switch";
import { connect as tabs, machine as tabsMachine } from "./tabs";
import { createToaster, connect as toast, machine as toastMachine } from "./toast";
import { connect as toggle, machine as toggleMachine } from "./toggle";
import { connect as toggleGroup, machine as toggleGroupMachine } from "./toggle-group";
import { connect as toolbar, machine as toolbarMachine } from "./toolbar";
import { connect as tooltip, machine as tooltipMachine } from "./tooltip";

interface RootProps {
  getRootProps(): Record<string, unknown>;
}

/**
 * `machine: null` marks the components with no machine — `separator` first, then
 * the presentational family (`badge`, `card`, `empty-state`, `list`, `sidebar`): no state, no
 * events, no id to derive, so `connect` takes props directly. They are listed
 * rather than skipped: the point is that this table and the folder list agree.
 *
 * `part` is `root` everywhere but `dialog`, which has none: its trigger and its
 * portalled surface are siblings, so there is no element to carry one.
 */
interface Entry {
  readonly machine: unknown;
  readonly part: string;
  /**
   * Props the machine cannot invent and refuses to run without. Only `toast`
   * needs them: its region is a view onto a store the page owns, so a machine
   * with no toaster throws rather than render a region that is empty forever.
   */
  readonly machineProps?: Record<string, unknown> | undefined;
  props(service: never, normalize: NormalizeFor): Record<string, unknown>;
}

type NormalizeFor = typeof plainNormalizer;

type ConnectFor<Api> = (service: never, normalize: NormalizeFor) => Api;

const asEntry = (machine: unknown, connect: unknown): Entry => ({
  machine,
  part: "root",
  props: (service, normalize) =>
    (connect as ConnectFor<RootProps>)(service, normalize).getRootProps(),
});

// Keys are quoted throughout, including the ones that do not need it:
// `scripts/component-coverage.test.ts` matches them as quoted literals so that
// `"toggle"` is not satisfied by `toggle-group` happening to contain it.
const COMPONENTS: Readonly<Record<string, Entry>> = {
  accordion: asEntry(accordionMachine, accordion),
  avatar: asEntry(avatarMachine, avatar),
  badge: asEntry(null, badge),
  breadcrumb: asEntry(breadcrumbMachine, breadcrumb),
  button: asEntry(buttonMachine, button),
  // The page is derived from the anchor rather than stored, so a server that has
  // read no clock still renders a whole month — `data-today` is what waits for the
  // first client `ENVIRONMENT.SYNC`, not the grid.
  calendar: asEntry(calendarMachine, calendar),
  card: asEntry(null, card),
  checkbox: asEntry(checkboxMachine, checkbox),
  "checkbox-group": asEntry(checkboxGroupMachine, checkboxGroup),
  clipboard: asEntry(clipboardMachine, clipboard),
  collapsible: asEntry(collapsibleMachine, collapsible),
  // A surface *with* a root: the trigger and the panel are both inside it, which
  // is what lets `presentation="inline"` render the whole picker with no portal.
  "color-picker": asEntry(colorPickerMachine, colorPicker),
  // Nothing rendered here reads a clock: unfilled units resolve against constants
  // (a leap year, January) so the bounds a segment announces are the same on both
  // sides of the hydration.
  "date-field": asEntry(dateFieldMachine, dateField),
  "date-picker": asEntry(datePickerMachine, datePicker),
  dialog: {
    machine: dialogMachine,
    part: "content",
    props: (service, normalize) =>
      (dialog as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
  // The dialog's shape again, and here it is not a quirk but the design: three of
  // the drawer's four parts are co-identities laid on a dialog's own elements, so
  // the surface is the only thing there is to connect.
  drawer: {
    machine: drawerMachine,
    part: "content",
    props: (service, normalize) =>
      (drawer as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
  "empty-state": asEntry(null, emptyState),
  field: asEntry(fieldMachine, field),
  input: asEntry(inputMachine, input),
  link: asEntry(linkMachine, link),
  list: asEntry(null, list),
  listbox: asEntry(listboxMachine, listbox),
  // The fourth surface with no `root`: the trigger stays where the author wrote
  // it and the menu is portalled, so there is nothing above the pair.
  menu: {
    machine: menuMachine,
    part: "content",
    props: (service, normalize) =>
      (menu as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
  meter: asEntry(meterMachine, meter),
  pagination: asEntry(paginationMachine, pagination),
  // Same shape as the dialog and for the same reason: no `root` part, so the
  // surface is what gets connected.
  popover: {
    machine: popoverMachine,
    part: "content",
    props: (service, normalize) =>
      (popover as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
  progress: asEntry(progressMachine, progress),
  "radio-group": asEntry(radioGroupMachine, radioGroup),
  "scroll-area": asEntry(scrollAreaMachine, scrollArea),
  "search-field": asEntry(searchFieldMachine, searchField),
  // The fifth surface with no `root`: like the menu, a trigger where the author
  // wrote it and a portalled surface, nothing above the pair.
  select: {
    machine: selectMachine,
    part: "content",
    props: (service, normalize) =>
      (select as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
  separator: asEntry(null, separator),
  sidebar: asEntry(null, sidebar),
  slider: asEntry(sliderMachine, slider),
  splitter: {
    machine: splitterMachine,
    part: "panel",
    props: (service, normalize) =>
      (splitter as ConnectFor<{ getPanelProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getPanelProps(),
  },
  switch: asEntry(switchMachine, switchControl),
  tabs: asEntry(tabsMachine, tabs),
  // `group` and not `root`, on the dialog's reading: the region is portalled and
  // has nothing above it. `root` here is the *card*, and a card needs a record.
  toast: {
    machine: toastMachine,
    part: "group",
    machineProps: { toaster: createToaster() },
    props: (service, normalize) =>
      (toast as ConnectFor<{ getGroupProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getGroupProps(),
  },
  toggle: asEntry(toggleMachine, toggle),
  "toggle-group": asEntry(toggleGroupMachine, toggleGroup),
  toolbar: asEntry(toolbarMachine, toolbar),
  // Third of the three surfaces with no `root`, and the smallest: a trigger and
  // a portalled surface, nothing above them.
  tooltip: {
    machine: tooltipMachine,
    part: "content",
    props: (service, normalize) =>
      (tooltip as ConnectFor<{ getContentProps(): Record<string, unknown> }>)(
        service,
        normalize,
      ).getContentProps(),
  },
};

describe("every component renders on a server", () => {
  it("has no document to reach for", () => {
    // The premise of the whole file. In the `browser` project this would be a
    // lie, which is why these tests live in `unit`.
    expect(globalThis.document).toBeUndefined();
  });

  for (const [name, entry] of Object.entries(COMPONENTS)) {
    it(`${name} builds a service and connects with no document`, () => {
      const props =
        entry.machine === null
          ? entry.props({} as never, plainNormalizer)
          : connectWithoutDom<never, Record<string, unknown>>({
              machine: entry.machine as never,
              connect: entry.props,
              id: "ssr",
              props: entry.machineProps as never,
            }).api();

      expect(props["data-scope"]).toBe(name);
      expect(props["data-part"]).toBe(`${name}:${entry.part}`);
    });
  }
});
