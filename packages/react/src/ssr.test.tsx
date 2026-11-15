/**
 * The audit's probe, kept: `renderToString` on every component.
 *
 * Five of the eleven — `progress`, `field`, `radio-group`, `toggle-group`,
 * `checkbox-group` — threw `ReferenceError: document is not defined` here, while
 * CDC:49 and :51 promised SSR without mismatch and ROADMAP.md:139 shipped it as a
 * ticked box. 715 tests were green at the time, because every one of them ran in
 * a page.
 *
 * `packages/core/src/components/ssr.test.ts` guards the same rule one layer down,
 * without React. This file is the one a Next or Remix user would recognise.
 */

import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AccordionBody,
  AccordionContent,
  AccordionHeader,
  AccordionIndicator,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from "./components/accordion";
import {
  AlertDialogAction,
  AlertDialogActions,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogPositioner,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/alert-dialog";
import { AvatarFallback, AvatarImage, AvatarRoot } from "./components/avatar";
import { BadgeRoot } from "./components/badge";
import {
  BreadcrumbEllipsis,
  BreadcrumbEllipsisTrigger,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbRoot,
} from "./components/breadcrumb";
import { ButtonRoot } from "./components/button";
import {
  CalendarCaption,
  CalendarCell,
  CalendarGrid,
  CalendarHeader,
  CalendarLabel,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarRoot,
  CalendarViewTrigger,
  CalendarWeekday,
  CalendarWeekdayRow,
  CalendarWeekRow,
  type DateValue,
  toISO,
  useCalendarContext,
} from "./components/calendar";
import {
  CardAction,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./components/card";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
} from "./components/checkbox";
import { CheckboxGroupLabel, CheckboxGroupRoot } from "./components/checkbox-group";
import {
  ClipboardControl,
  ClipboardIndicator,
  ClipboardInput,
  ClipboardLabel,
  ClipboardRoot,
  ClipboardTrigger,
} from "./components/clipboard";
import {
  CollapsibleContent,
  CollapsibleIndicator,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "./components/collapsible";
import {
  ColorPickerArea,
  ColorPickerAreaBackground,
  ColorPickerAreaThumb,
  ColorPickerAreaXInput,
  ColorPickerAreaYInput,
  ColorPickerChannelInput,
  ColorPickerChannelLabel,
  ColorPickerChannelSlider,
  ColorPickerChannelSliderRange,
  ColorPickerChannelSliderThumb,
  ColorPickerChannelSliderTrack,
  ColorPickerContent,
  ColorPickerFormatSelect,
  ColorPickerHiddenInput,
  ColorPickerLabel,
  ColorPickerRoot,
  ColorPickerSwatch,
  ColorPickerSwatchGroup,
  ColorPickerSwatchIndicator,
  ColorPickerSwatchRow,
  ColorPickerTitle,
  ColorPickerTransparencyGrid,
} from "./components/color-picker";
import {
  DateFieldControl,
  DateFieldDecrementTrigger,
  DateFieldHiddenInput,
  DateFieldIncrementTrigger,
  DateFieldRoot,
  DateFieldSegments,
} from "./components/date-field";
import {
  DatePickerCalendar,
  DatePickerContent,
  DatePickerField,
  DatePickerLabel,
  DatePickerPortal,
  DatePickerPositioner,
  DatePickerRoot,
  DatePickerTrigger,
} from "./components/date-picker";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog";
import {
  DrawerBackdrop,
  DrawerContent,
  DrawerGrabber,
  DrawerPositioner,
  DrawerRoot,
} from "./components/drawer";
import {
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIndicator,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./components/empty-state";
import {
  FieldErrorText,
  FieldHelperText,
  FieldLabel,
  FieldLegend,
  FieldRequiredIndicator,
  FieldRoot,
} from "./components/field";
import { InputControl, InputRoot, InputTextarea, InputVisibilityTrigger } from "./components/input";
import { LinkExternalIcon, LinkExternalLabel, LinkRoot } from "./components/link";
import {
  ListAction,
  ListFooter,
  ListGroup,
  ListHeader,
  ListLeading,
  ListRoot,
  ListRow,
  ListSection,
  ListSubtitle,
  ListTitle,
  ListTrailing,
} from "./components/list";
import {
  ListboxContent,
  ListboxItem,
  ListboxItemGroup,
  ListboxItemGroupLabel,
  ListboxItemIndicator,
  ListboxItemText,
  ListboxLabel,
  ListboxRoot,
} from "./components/listbox";
import {
  MenuContent,
  MenuIndicator,
  MenuItem,
  MenuItemDescription,
  MenuItemGroup,
  MenuItemGroupLabel,
  MenuItemIndicator,
  MenuItemShortcut,
  MenuItemSymbol,
  MenuItemText,
  MenuOptionItem,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  MenuTriggerItem,
} from "./components/menu";
import { MeterLabel, MeterRange, MeterRoot, MeterTrack, MeterValueText } from "./components/meter";
import {
  PaginationContext,
  PaginationEllipsis,
  PaginationItem,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "./components/pagination";
import {
  PopoverArrow,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverDescription,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "./components/popover";
import {
  ProgressLabel,
  ProgressRange,
  ProgressRoot,
  ProgressTrack,
  ProgressValueText,
} from "./components/progress";
import {
  RadioGroupIndicator,
  RadioGroupItem,
  RadioGroupItemControl,
  RadioGroupItemHiddenInput,
  RadioGroupItemText,
  RadioGroupLabel,
  RadioGroupRoot,
} from "./components/radio-group";
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "./components/scroll-area";
import {
  SearchFieldCancelTrigger,
  SearchFieldClearTrigger,
  SearchFieldControl,
  SearchFieldField,
  SearchFieldIndicator,
  SearchFieldRoot,
} from "./components/search-field";
import {
  SelectContent,
  SelectHiddenSelect,
  SelectIndicator,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectPositioner,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./components/select";
import { SeparatorRoot } from "./components/separator";
import {
  SidebarContent,
  SidebarFooter,
  SidebarFooterLabel,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderLabel,
  SidebarItem,
  SidebarLabel,
  SidebarLeading,
  SidebarLink,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeader,
  SidebarTrailing,
  SidebarTrigger,
} from "./components/sidebar";
import {
  SliderControl,
  SliderHiddenInput,
  SliderLabel,
  SliderMarker,
  SliderMarkerGroup,
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  SliderValueText,
} from "./components/slider";
import { Splitter, SplitterHandle, SplitterPanel, SplitterRoot } from "./components/splitter";
import {
  SwitchControl,
  SwitchHiddenInput,
  SwitchLabel,
  SwitchRoot,
  SwitchThumb,
} from "./components/switch";
import {
  TabsCloseTrigger,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsScrollbar,
  TabsThumb,
  TabsTrigger,
} from "./components/tabs";
import {
  createToaster,
  ToastActionTrigger,
  ToastCloseTrigger,
  ToastDescription,
  ToastGroup,
  ToastIndicator,
  ToastRoot,
  ToastTitle,
} from "./components/toast";
import { ToggleIndicator, ToggleRoot } from "./components/toggle";
import {
  ToggleGroupFrame,
  ToggleGroupIndicator,
  ToggleGroupItem,
  ToggleGroupLabel,
  ToggleGroupRoot,
  ToggleGroupScrollbar,
  ToggleGroupThumb,
} from "./components/toggle-group";
import {
  ToolbarGroup,
  ToolbarItem,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSpacer,
} from "./components/toolbar";
import {
  TooltipContent,
  TooltipPortal,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger,
} from "./components/tooltip";

/**
 * Every id an `aria-*` IDREF attribute points at has to exist in the same markup.
 * This is the defect the Phase 4 APG audit found on `progress` and `radio-group`
 * — a label that is only sometimes rendered — and the server is where it is most
 * likely to reappear, because that is where the DOM cannot be consulted.
 */
function danglingIdRefs(html: string): string[] {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? ""));
  const referenced = [...html.matchAll(/\saria-(?:labelledby|describedby|controls)="([^"]+)"/g)]
    .flatMap((match) => (match[1] ?? "").split(/\s+/))
    .filter((id) => id !== "");
  return [...new Set(referenced.filter((id) => !ids.has(id)))];
}

/**
 * The one shape here that needs a component of its own: a month's weeks are
 * computed from the anchor, so its cells cannot be written out as literal JSX.
 * Shared by the calendar's row and by the picker's case below, which is the
 * honest arrangement — a picker renders the same grid, from the props it spreads
 * onto a `CalendarRoot`.
 */
function CalendarMonth(): ReactNode {
  const api = useCalendarContext();
  return (
    <CalendarGrid>
      <CalendarWeekdayRow>
        {api.weekdays.map((weekday, index) => (
          <CalendarWeekday key={weekday.long} index={index} />
        ))}
      </CalendarWeekdayRow>
      {api.weeks.map((week, row) => (
        <CalendarWeekRow key={toISO(week[0] as DateValue)} index={row}>
          {week.map((day) => (
            <CalendarCell key={toISO(day)} value={day} />
          ))}
        </CalendarWeekRow>
      ))}
    </CalendarGrid>
  );
}

describe("server rendering", () => {
  it("has no document to reach for", () => {
    expect(globalThis.document).toBeUndefined();
  });

  it.each([
    [
      "button",
      <ButtonRoot key="b" loading>
        Save
      </ButtonRoot>,
    ],
    [
      "toggle",
      <ToggleRoot key="t" defaultPressed>
        <ToggleIndicator />B
      </ToggleRoot>,
    ],
    [
      "toggle-group",
      <ToggleGroupFrame key="tg" defaultValue={["monthly"]}>
        <ToggleGroupRoot>
          <ToggleGroupLabel>Billing</ToggleGroupLabel>
          <ToggleGroupIndicator />
          <ToggleGroupItem value="monthly" label="Monthly">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="yearly" label="Yearly">
            Yearly
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar>
          <ToggleGroupThumb />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>,
    ],
    [
      "checkbox",
      <CheckboxRoot key="c" defaultChecked="indeterminate" name="tos">
        <CheckboxHiddenInput />
        <CheckboxControl>
          <CheckboxIndicator />
        </CheckboxControl>
        <CheckboxLabel>Accept</CheckboxLabel>
      </CheckboxRoot>,
    ],
    [
      "checkbox-group",
      <CheckboxGroupRoot key="cg" name="toppings" defaultValue={["olive"]}>
        <CheckboxGroupLabel>Toppings</CheckboxGroupLabel>
        <CheckboxRoot>
          <CheckboxHiddenInput />
          <CheckboxLabel>All</CheckboxLabel>
        </CheckboxRoot>
        <CheckboxRoot value="olive">
          <CheckboxHiddenInput />
          <CheckboxLabel>Olive</CheckboxLabel>
        </CheckboxRoot>
        <CheckboxRoot value="caper">
          <CheckboxHiddenInput />
          <CheckboxLabel>Caper</CheckboxLabel>
        </CheckboxRoot>
      </CheckboxGroupRoot>,
    ],
    [
      "switch",
      <SwitchRoot key="s" defaultChecked name="wifi">
        <SwitchHiddenInput />
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
        <SwitchLabel>Wi-Fi</SwitchLabel>
      </SwitchRoot>,
    ],
    [
      "radio-group",
      <RadioGroupRoot key="rg" name="size" defaultValue="medium">
        <RadioGroupLabel>Size</RadioGroupLabel>
        <RadioGroupIndicator />
        {["small", "medium"].map((size) => (
          <RadioGroupItem key={size} value={size}>
            <RadioGroupItemHiddenInput />
            <RadioGroupItemControl />
            <RadioGroupItemText>{size}</RadioGroupItemText>
          </RadioGroupItem>
        ))}
      </RadioGroupRoot>,
    ],
    [
      "field",
      <FieldRoot key="f" required invalid>
        <FieldLabel>
          Email
          <FieldRequiredIndicator>*</FieldRequiredIndicator>
        </FieldLabel>
        <InputRoot type="email" name="email">
          <InputControl />
        </InputRoot>
        <FieldHelperText>We only use it to sign you in.</FieldHelperText>
        <FieldErrorText>That address does not look right.</FieldErrorText>
      </FieldRoot>,
    ],
    [
      "input",
      <InputRoot key="i" type="password" name="password">
        <InputControl />
        <InputVisibilityTrigger aria-label="Show password">o</InputVisibilityTrigger>
      </InputRoot>,
    ],
    [
      "progress",
      <ProgressRoot key="p" defaultValue={40}>
        <ProgressLabel>Uploading</ProgressLabel>
        <ProgressTrack>
          <ProgressRange />
        </ProgressTrack>
        <ProgressValueText />
      </ProgressRoot>,
    ],
    [
      // The label is rendered and still not pointed at: `hasLabel` is read from
      // the DOM, so on the server the thumb emits no `aria-labelledby` rather
      // than an IDREF it cannot prove exists. The client wires it on mount.
      "slider",
      <SliderRoot key="sl" defaultValue={40} name="volume" marks={[0, 50, 100]}>
        <SliderLabel>Volume</SliderLabel>
        <SliderValueText />
        <SliderControl>
          <SliderTrack>
            <SliderRange />
          </SliderTrack>
          <SliderMarkerGroup>
            <SliderMarker value={0} />
            <SliderMarker value={50} />
            <SliderMarker value={100} />
          </SliderMarkerGroup>
          <SliderThumb />
        </SliderControl>
        <SliderHiddenInput />
      </SliderRoot>,
    ],
    [
      // The `defaultValue` is what makes this markup complete on a server:
      // `syncTriggers` settles the APG invariant from an effect, and a server runs
      // none — so without one the first paint would have no selected tab and no
      // tab stop. The inactive panel is not rendered at all, which is also why the
      // inactive trigger emits no `aria-controls`: an IDREF is only written where
      // the panel it names is provably in the same markup.
      "tabs",
      <TabsRoot key="tabs" defaultValue="overview" closable>
        <TabsList aria-label="Document sections">
          <TabsIndicator />
          <TabsTrigger value="overview" label="Overview">
            Overview
          </TabsTrigger>
          <TabsCloseTrigger value="overview" aria-label="Close Overview" />
          <TabsTrigger value="activity" label="Activity">
            Activity
          </TabsTrigger>
          <TabsCloseTrigger value="activity" aria-label="Close Activity" />
        </TabsList>
        <TabsScrollbar>
          <TabsThumb />
        </TabsScrollbar>
        <TabsContent value="overview">Everything at a glance.</TabsContent>
        <TabsContent value="activity">Nothing yet.</TabsContent>
      </TabsRoot>,
    ],
    [
      "badge",
      <BadgeRoot key="bd" label="3 unread notifications">
        3
      </BadgeRoot>,
    ],
    [
      "card",
      <CardRoot key="cd">
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>What the volume holds.</CardDescription>
          <CardAction>
            <ButtonRoot variant="plain">Manage</ButtonRoot>
          </CardAction>
        </CardHeader>
        <CardBody>Nothing to show yet.</CardBody>
        <CardFooter>Updated today.</CardFooter>
      </CardRoot>,
    ],
    [
      "empty-state",
      <EmptyStateRoot key="es">
        <EmptyStateIndicator />
        <EmptyStateTitle>No results</EmptyStateTitle>
        <EmptyStateDescription>Try again.</EmptyStateDescription>
        <EmptyStateActions />
      </EmptyStateRoot>,
    ],
    [
      "meter",
      <MeterRoot key="mt" value={70} low={20} high={80}>
        <MeterLabel>Battery</MeterLabel>
        <MeterTrack>
          <MeterRange />
        </MeterTrack>
        <MeterValueText />
      </MeterRoot>,
    ],
    [
      // `defaultPage` inside the truncation window: the markup must arrive with
      // the ellipsis cells and `aria-current` already settled — a server runs no
      // effect to correct them later.
      "pagination",
      <PaginationRoot key="pg" count={100} defaultPage={5} aria-label="Results">
        <PaginationPrevTrigger aria-label="Previous page" />
        <PaginationContext>
          {(api) =>
            api.pages.map((item, index) => {
              if (item.type === "page") {
                return (
                  <PaginationItem key={item.value} page={item.value}>
                    {item.value}
                  </PaginationItem>
                );
              }
              // A gap has no identity of its own, and the pages around it are the
              // wrong thing to borrow one from: they change on every page turn, so
              // a key made of them makes both ellipses unmount and remount each
              // time. There are exactly two gaps and they are *positions* — one
              // before the window, one after — so that is the key (ratified
              // 2026-09-05; the composed layer picks this one for everyone).
              return (
                <PaginationEllipsis
                  key={index < api.pages.length / 2 ? "gap-start" : "gap-end"}
                  index={index}
                />
              );
            })
          }
        </PaginationContext>
        <PaginationNextTrigger aria-label="Next page" />
      </PaginationRoot>,
    ],
    [
      // One panel open and one closed, because the closed one is the interesting
      // half: it reaches the browser carrying `hidden`, and its trigger still
      // names an `aria-controls` that resolves — a panel is never unmounted,
      // which is the price of `hidden="until-found"` and of a server render that
      // matches.
      "accordion",
      <AccordionRoot key="ac" defaultValue={["shipping"]}>
        <AccordionItem value="shipping">
          <AccordionHeader>
            <AccordionTrigger>
              Shipping
              <AccordionIndicator />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Ships within two days.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="returns">
          <AccordionHeader>
            <AccordionTrigger>
              Returns
              <AccordionIndicator />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Thirty days, no questions.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>,
    ],
    [
      // `defaultOpen` is what makes this markup complete: the content is mounted
      // by the machine's own `open`, not by a presence, so the `aria-controls`
      // the trigger writes names an element really in the same markup — a closed
      // one would write none at all, which is the rule under test.
      "collapsible",
      <CollapsibleRoot key="cl" defaultOpen>
        <CollapsibleTrigger>
          Order details
          <CollapsibleIndicator />
        </CollapsibleTrigger>
        <CollapsibleContent>Two items, shipped separately.</CollapsibleContent>
      </CollapsibleRoot>,
    ],
    [
      // Every item carries an explicit `value` rather than leaning on the `useId`
      // fallback: the id the machine derives from it ends up in the markup, and a
      // server-rendered `data-value` of a React id describes nothing. The tab
      // stop is deliberately absent — until the first `ITEMS.SYNC` the machine
      // has read no items, and writing `-1` on every one would take the whole bar
      // out of a server-rendered page's tab order.
      "toolbar",
      <ToolbarRoot key="tb" label="Formatting">
        <ToolbarGroup>
          <ToolbarItem value="bold">B</ToolbarItem>
          <ToolbarItem value="italic">I</ToolbarItem>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarSpacer />
        <ToolbarItem value="share">Share</ToolbarItem>
      </ToolbarRoot>,
    ],
    [
      // The one collection here that is not a surface, and two absences are what
      // make it a server render: `itemCount` is `-1` until the machine has read
      // the DOM, so nothing writes a `data-empty` it has not measured, and the
      // tab stop falls back to the first selected value — the only entry point
      // knowable without a document.
      "listbox",
      <ListboxRoot key="lb" defaultValue={["ada"]} label="People">
        <ListboxLabel>People</ListboxLabel>
        <ListboxContent>
          <ListboxItemGroup id="pioneers" label>
            <ListboxItemGroupLabel>Pioneers</ListboxItemGroupLabel>
            <ListboxItem value="ada">
              <ListboxItemText>Ada Lovelace</ListboxItemText>
              <ListboxItemIndicator />
            </ListboxItem>
            <ListboxItem value="grace">
              <ListboxItemText>Grace Hopper</ListboxItemText>
              <ListboxItemIndicator />
            </ListboxItem>
          </ListboxItemGroup>
        </ListboxContent>
      </ListboxRoot>,
    ],
    [
      "avatar",
      <AvatarRoot key="av">
        <AvatarImage src="/ada.png" alt="Ada Lovelace" />
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>,
    ],
    [
      "breadcrumb",
      <BreadcrumbRoot key="bc">
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
          <BreadcrumbItem>
            <BreadcrumbLink current render={<span />}>
              Fjords
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>,
    ],
    [
      "link",
      <LinkRoot key="lk" href="https://example.com/docs" external>
        Read the docs
        <LinkExternalIcon>
          <svg viewBox="0 0 16 16" aria-hidden="true" />
        </LinkExternalIcon>
        <LinkExternalLabel>(opens in a new tab)</LinkExternalLabel>
      </LinkRoot>,
    ],
    [
      "list",
      <ListRoot key="ls">
        <ListSection>
          <ListHeader>Account</ListHeader>
          <ListGroup>
            <ListRow size="tall">
              <ListAction>
                <ListLeading>
                  <svg viewBox="0 0 16 16" aria-hidden="true" />
                </ListLeading>
                <ListTitle>Profile</ListTitle>
                <ListSubtitle>Name, photo</ListSubtitle>
                <ListTrailing />
              </ListAction>
            </ListRow>
            <ListRow>
              <ListTitle>Storage</ListTitle>
              <ListTrailing>128 GB</ListTrailing>
            </ListRow>
          </ListGroup>
          <ListFooter>Changes apply to every device.</ListFooter>
        </ListSection>
      </ListRoot>,
    ],
    [
      "clipboard",
      <ClipboardRoot key="cb" defaultValue="npm i standarui" copyLabel="Copy the command">
        <ClipboardLabel>Command</ClipboardLabel>
        <ClipboardControl>
          <ClipboardInput />
          <ClipboardTrigger>
            <ClipboardIndicator />
            <ClipboardIndicator copied />
          </ClipboardTrigger>
        </ClipboardControl>
      </ClipboardRoot>,
    ],
    [
      // Both new parts are rendered on purpose: `root` is the **row** since
      // 2026-09-05 and `field` is the capsule, so a fixture that skipped `field`
      // would be a search field with no box — green, and covering nothing.
      "search-field",
      <SearchFieldRoot key="sf" label="Search files" clearLabel="Clear search" defaultValue="glass">
        <SearchFieldField>
          <SearchFieldIndicator />
          <SearchFieldControl />
          <SearchFieldClearTrigger />
        </SearchFieldField>
        <SearchFieldCancelTrigger />
      </SearchFieldRoot>,
    ],
    [
      // `defaultValue`, `defaultFocusedValue` and `today` are what make this
      // markup complete on a server. The page is derived from the anchor, so
      // pinning it pins the month; `data-today` is written by nothing until the
      // first client `ENVIRONMENT.SYNC`, because a server in UTC and a reader in
      // `Pacific/Auckland` are not on the same day. The grid names itself with the
      // caption *as a string*: an `aria-labelledby` at a header a consumer may not
      // have rendered is exactly the dangling IDREF this table refuses.
      "calendar",
      <CalendarRoot
        key="cal"
        defaultValue={{ year: 2026, month: 4, day: 20 }}
        defaultFocusedValue={{ year: 2026, month: 4, day: 20 }}
        today={{ year: 2026, month: 4, day: 9 }}
        firstDayOfWeek={1}
      >
        <CalendarLabel>Trip date</CalendarLabel>
        <CalendarHeader>
          <CalendarPrevTrigger aria-label="Previous month" />
          <CalendarViewTrigger>
            <CalendarCaption />
          </CalendarViewTrigger>
          <CalendarNextTrigger aria-label="Next month" />
        </CalendarHeader>
        <CalendarMonth />
      </CalendarRoot>,
    ],
    [
      // `granularity: "minute"` on purpose: it is the row that proves the whole
      // clock half renders on a server too, and `DateFieldSegments` keys the
      // literals by rank rather than by character — two slashes in one field would
      // otherwise be one node to React.
      "date-field",
      <DateFieldRoot
        key="df"
        name="born"
        granularity="minute"
        defaultValue={{ year: 2026, month: 4, day: 9, hour: 13, minute: 5 }}
      >
        <DateFieldControl>
          <DateFieldSegments />
          <DateFieldIncrementTrigger />
          <DateFieldDecrementTrigger />
        </DateFieldControl>
        <DateFieldHiddenInput />
      </DateFieldRoot>,
    ],
    [
      // `inline` is the shape a server can render whole: the panel is open from
      // the first byte, `presence` never runs, and no portal resets hydration.
      // The screen picker is absent on purpose — the machine only learns whether
      // the engine has one from an effect, so the button appears after hydration
      // rather than mismatching during it.
      "color-picker",
      <ColorPickerRoot
        key="cp"
        presentation="inline"
        defaultValue="#0088ff"
        name="tint"
        swatches={["#ff0000", "#00ff00"]}
        swatchColumns={2}
      >
        <ColorPickerLabel>Tint</ColorPickerLabel>
        <ColorPickerHiddenInput />
        <ColorPickerContent>
          <ColorPickerTitle>Colors</ColorPickerTitle>
          <ColorPickerArea>
            <ColorPickerAreaBackground />
            <ColorPickerTransparencyGrid />
            <ColorPickerAreaThumb>
              <ColorPickerAreaXInput />
              <ColorPickerAreaYInput />
            </ColorPickerAreaThumb>
          </ColorPickerArea>
          <ColorPickerChannelSlider channel="hue">
            <ColorPickerChannelLabel>Hue</ColorPickerChannelLabel>
            <ColorPickerChannelSliderTrack>
              <ColorPickerChannelSliderRange />
            </ColorPickerChannelSliderTrack>
            <ColorPickerChannelSliderThumb />
          </ColorPickerChannelSlider>
          <ColorPickerChannelInput channel="hex" />
          <ColorPickerFormatSelect />
          <ColorPickerSwatchGroup>
            <ColorPickerSwatchRow row={0}>
              <ColorPickerSwatch index={0}>
                <ColorPickerSwatchIndicator />
              </ColorPickerSwatch>
              <ColorPickerSwatch index={1}>
                <ColorPickerSwatchIndicator />
              </ColorPickerSwatch>
            </ColorPickerSwatchRow>
          </ColorPickerSwatchGroup>
        </ColorPickerContent>
      </ColorPickerRoot>,
    ],
    ["separator", <SeparatorRoot key="sep" />],
    [
      "sidebar",
      <SidebarRoot key="sb" label="Library">
        <SidebarHeader>
          <SidebarHeaderLabel>Acme</SidebarHeaderLabel>
        </SidebarHeader>
        <SidebarContent>
          <SidebarSection>
            <SidebarSectionHeader>Browse</SidebarSectionHeader>
            <SidebarGroup>
              <SidebarItem current>
                <SidebarLink render={<a href="/home" />} current>
                  <SidebarLeading>
                    <svg viewBox="0 0 16 16" aria-hidden="true" />
                  </SidebarLeading>
                  <SidebarLabel>Home</SidebarLabel>
                  <SidebarTrailing>24</SidebarTrailing>
                </SidebarLink>
              </SidebarItem>
            </SidebarGroup>
          </SidebarSection>
        </SidebarContent>
        <SidebarFooter>
          <SidebarFooterLabel>v1.0</SidebarFooterLabel>
          <SidebarTrigger aria-label="Show the sidebar" open={false} />
        </SidebarFooter>
      </SidebarRoot>,
    ],
  ])("renders %s", (name, element) => {
    const html = renderToString(element);

    expect(html).toContain(`data-scope="${name}"`);
    expect(html).toContain(`data-part="${name}:root"`);
    expect(danglingIdRefs(html)).toEqual([]);
    expect(html).not.toMatch(/\sstyle=/);
  });

  /**
   * Its own case rather than a row in the table: a dialog has no `root` part to
   * assert (spec §8, divergence 1), and its surface only reaches the server markup
   * where the portal is stood down — the body cannot be written to from a string.
   *
   * The accessible name is the interesting half. `hasTitle` is read from the DOM,
   * and there is none here, so the server falls back to `aria-label` rather than
   * pointing `aria-labelledby` at an id it has not proved exists.
   */
  it("renders dialog, open, with a name and no dangling IDREF", () => {
    const html = renderToString(
      <DialogRoot defaultOpen label="Rename file">
        <DialogTrigger>Rename</DialogTrigger>
        <DialogPortal disabled>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent>
              <DialogTitle>Rename file</DialogTitle>
              <DialogDescription>Pick a new name.</DialogDescription>
              <DialogCloseTrigger>Close</DialogCloseTrigger>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>,
    );

    expect(html).toContain('data-scope="dialog"');
    expect(html).toContain('data-part="dialog:content"');
    expect(html).toContain('aria-label="Rename file"');
    expect(html).not.toContain("aria-labelledby");
    // `aria-controls` is posed only while open, and the surface it names is here.
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("renders scroll-area with its parts, no tab stop before a measure and no inline style", () => {
    const parts = renderToString(
      <ScrollAreaRoot id="log" label="Log" orientation="both">
        <ScrollAreaViewport>
          <ScrollAreaContent>Content</ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb orientation="vertical" />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar orientation="horizontal">
          <ScrollAreaThumb orientation="horizontal" />
        </ScrollAreaScrollbar>
        <ScrollAreaCorner />
      </ScrollAreaRoot>,
    );
    const composed = renderToString(
      <ScrollArea id="log" label="Log" orientation="both">
        Content
      </ScrollArea>,
    );

    for (const html of [parts, composed]) {
      expect(html).toContain('data-part="scroll-area:root"');
      expect(html).toContain('data-part="scroll-area:viewport"');
      expect(html).toContain('data-part="scroll-area:thumb"');
      expect(html).toContain('data-part="scroll-area:corner"');
      expect(html).not.toContain("tabindex");
      expect(html).not.toContain('role="region"');
      expect(danglingIdRefs(html)).toEqual([]);
      expect(html).not.toMatch(/\sstyle=/);
    }
  });

  it("renders splitter with a panel, a named handle and no inline style", () => {
    const parts = renderToString(
      <SplitterRoot label="Sidebar" unit="px" max={360} defaultSize={196}>
        <SplitterPanel>
          <SplitterHandle />
        </SplitterPanel>
      </SplitterRoot>,
    );
    const composed = renderToString(
      <Splitter label="Sidebar" unit="px" max={360} defaultSize={196} />,
    );

    for (const html of [parts, composed]) {
      expect(html).toContain('data-part="splitter:panel"');
      expect(html).toContain('data-part="splitter:handle"');
      expect(html).toContain('role="separator"');
      expect(html).toContain('aria-valuenow="196"');
      expect(danglingIdRefs(html)).toEqual([]);
      expect(html).not.toMatch(/\sstyle=/);
    }
  });

  /**
   * The drawer, and its own case for the reason the dialog has one: it renders no
   * element of its own but the grabber, so what has to be read is the *pair* of
   * identities landing on the dialog's elements, and the ids underneath them.
   *
   * **The id assertion is the load-bearing one.** `mergeProps` is later-wins for
   * values and the dialog contributes its `id` last, so a drawer deriving
   * `drawer:<scope>:content` would lose the attribute and then look its own surface
   * up by a string no element wears — `getContentEl` null, and the drag tracker,
   * the offset writer and the progress publisher all installed against nothing, in
   * silence. `DrawerRoot` seeds the dialog's part ids onto the decorator instead,
   * and what proves it here is that the grabber's `aria-controls` names an id the
   * markup really carries.
   *
   * The detent custom properties are not in the markup: the adapter writes core
   * styles through the CSSOM after mount, so the server HTML carries no `style=`.
   * Their values are read on the mounted node in `drawer.browser.test.tsx`.
   */
  it("renders drawer over a dialog, both identities on one element, with no inline style", () => {
    const html = renderToString(
      <DialogRoot defaultOpen label="Filters" presentation="sheet">
        <DialogTrigger>Filters</DialogTrigger>
        <DrawerRoot detents={[0.5, 1]} defaultDetent={0.5}>
          <DialogPortal disabled>
            <DialogBackdrop render={<DrawerBackdrop />} />
            <DialogPositioner render={<DrawerPositioner />}>
              <DialogContent render={<DrawerContent />}>
                <DialogTitle>Filters</DialogTitle>
                <DrawerGrabber aria-label="Resize sheet" />
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DrawerRoot>
      </DialogRoot>,
    );

    // One element, two identities: `mergeProps` treats these two attributes as
    // token lists, which is what keeps either sheet from erasing the other.
    expect(html).toContain('data-scope="drawer dialog"');
    expect(html).toContain('data-part="drawer:content dialog:content"');
    expect(html).toContain('data-part="drawer:backdrop dialog:backdrop"');
    expect(html).toContain('data-part="drawer:positioner dialog:positioner"');

    expect(html).not.toContain(" style=");
    expect(html).toContain('data-detent-position="partial"');
    expect(html).toContain('data-edge="bottom"');

    // The splitter, and the surface it says it controls has to be in the markup.
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * The alert-dialog's own case, for the one thing that could differ on a server:
   * its default initial focus is a DOM lookup, and a server has no DOM. Nothing
   * should try — `focusInitial` runs from an effect, and effects do not run in
   * `renderToString` — so what this asserts is that the markup arrives whole and
   * announces the right role without one.
   */
  /**
   * The popover's own case, and it carries one thing no other surface does: the
   * arrow. Every placement attribute it renders comes from `currentPlacement`,
   * which is seeded from the `placement` prop — so the server writes the side the
   * client will start on, instead of a default the first measurement contradicts.
   */
  it("renders popover, open, with the placement it was asked for", () => {
    const html = renderToString(
      <PopoverRoot defaultOpen placement="right-start" label="Share options">
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverPortal disabled>
          <PopoverPositioner>
            <PopoverContent>
              <PopoverDescription>Anyone with the link can view.</PopoverDescription>
              <PopoverCloseTrigger>Done</PopoverCloseTrigger>
            </PopoverContent>
            <PopoverArrow />
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>,
    );

    expect(html).toContain('data-scope="popover"');
    expect(html).toContain('data-part="popover:arrow-tip"');
    expect(html).toContain('data-side="right"');
    expect(html).toContain('data-align="start"');
    // Not modal, which is the definition — and named by its label, because no
    // title has been proved to exist.
    expect(html).not.toContain("aria-modal");
    expect(html).toContain('aria-label="Share options"');
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * The tooltip's own case, and what it proves is an absence: the surface it
   * renders has no arrow, no scrim and no way in, and the trigger it describes is
   * described only because the surface is open. A server that wrote the
   * `aria-describedby` of a closed tooltip would ship a dangling IDREF to every
   * page — which is what `danglingIdRefs` is here to refuse.
   */
  it("renders tooltip, open, describing its trigger and pointing where it was asked to", () => {
    const html = renderToString(
      <TooltipRoot defaultOpen placement="left-end">
        <TooltipTrigger>Rename</TooltipTrigger>
        <TooltipPortal disabled>
          <TooltipPositioner>
            <TooltipContent>Rename this file</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>,
    );

    expect(html).toContain('data-scope="tooltip"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('data-side="left"');
    expect(html).toContain('data-align="end"');
    expect(html).toContain("aria-describedby=");
    expect(html).not.toContain('data-part="tooltip:arrow"');
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("renders a closed tooltip with nothing pointing at a surface that is not there", () => {
    const html = renderToString(
      <TooltipRoot>
        <TooltipTrigger>Rename</TooltipTrigger>
        <TooltipPortal disabled>
          <TooltipPositioner>
            <TooltipContent>Rename this file</TooltipContent>
          </TooltipPositioner>
        </TooltipPortal>
      </TooltipRoot>,
    );

    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain('role="tooltip"');
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * The menu's own case, and it is the first surface that is also a *collection*
   * and a *tree*. Both are read from the DOM on the client, and a server has none:
   * what this asserts is that neither absence writes anything the markup cannot
   * back up — no checkmark gutter it has not seen, and no `aria-controls` on the
   * item that opens a submenu whose surface is still closed.
   *
   * `data-side` comes from `currentPlacement`, seeded from the placement a *root*
   * menu falls back to. A submenu falls back to `right-start` instead, and the
   * adapter is what tells the two apart — a menu opened from inside a dialog
   * carries that dialog's layer id and is not a submenu at all.
   */
  it("renders menu, open, with its items and a submenu that is not", () => {
    const html = renderToString(
      <MenuRoot defaultOpen>
        <MenuTrigger>
          Actions
          <MenuIndicator />
        </MenuTrigger>
        <MenuPortal disabled>
          <MenuPositioner>
            <MenuContent>
              <MenuItemGroup id="file">
                <MenuItemGroupLabel>File</MenuItemGroupLabel>
                <MenuItem value="open" shortcut="Meta+O">
                  <MenuItemSymbol />
                  <MenuItemText>Open</MenuItemText>
                  <MenuItemShortcut>Cmd O</MenuItemShortcut>
                </MenuItem>
                <MenuItem value="rename" description>
                  <MenuItemText>Rename</MenuItemText>
                  <MenuItemDescription>Give the file a new name</MenuItemDescription>
                </MenuItem>
              </MenuItemGroup>
              <MenuSeparator />
              <MenuOptionItem type="checkbox" value="hidden" checked>
                <MenuItemIndicator />
                <MenuItemText>Show hidden files</MenuItemText>
              </MenuOptionItem>
              <MenuItem value="delete" destructive>
                <MenuItemText>Delete</MenuItemText>
              </MenuItem>
              <MenuRoot>
                <MenuTriggerItem value="share">
                  <MenuItemText>Share</MenuItemText>
                </MenuTriggerItem>
                <MenuPortal disabled>
                  <MenuPositioner>
                    <MenuContent>
                      <MenuItem value="copy-link">
                        <MenuItemText>Copy link</MenuItemText>
                      </MenuItem>
                    </MenuContent>
                  </MenuPositioner>
                </MenuPortal>
              </MenuRoot>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>,
    );

    expect(html).toContain('data-scope="menu"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('data-side="bottom"');
    expect(html).toContain('data-align="start"');
    expect(html).toContain('role="menuitemcheckbox"');
    expect(html).toContain('data-part="menu:trigger-item"');
    expect(html).toContain("data-destructive");
    expect(html).toContain('aria-keyshortcuts="Meta+O"');
    // The gutter is the container's decision and it is read from the rendered
    // indicators, so the server declines to guess it.
    expect(html).not.toContain("data-has-selection");
    // Nothing of the closed submenu reached the markup — which is exactly why its
    // trigger item names no `aria-controls`.
    expect(html).not.toContain("copy-link");
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * The select's case is the menu's read through a value: the trigger has to
   * reflect the selection on a server that has no DOM collection to read labels
   * from — which is why `SelectValueText` is given explicit children, the
   * documented fallback for markup that arrives before any open. The closed
   * surface leaves nothing behind, form mirror included in the markup.
   */
  it("renders select, closed, with the trigger reflecting the value", () => {
    const html = renderToString(
      <SelectRoot defaultValue="name" label="Sort by">
        <SelectTrigger>
          <SelectValueText>Name</SelectValueText>
          <SelectIndicator />
        </SelectTrigger>
        <SelectHiddenSelect />
        <SelectPortal disabled>
          <SelectPositioner>
            <SelectContent>
              <SelectItem value="name">
                <SelectItemIndicator />
                <SelectItemText>Name</SelectItemText>
              </SelectItem>
              <SelectItem value="date">
                <SelectItemIndicator />
                <SelectItemText>Date</SelectItemText>
              </SelectItem>
            </SelectContent>
          </SelectPositioner>
        </SelectPortal>
      </SelectRoot>,
    );

    expect(html).toContain('data-scope="select"');
    expect(html).toContain('data-part="select:trigger"');
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * Its own case rather than a row in the table: what a server has to get right
   * here is the *composition*. The picker drives a `calendar` and a `date-field`
   * by props, so the interesting markup is the one where all three rendered — and
   * a portalled surface only reaches a string where the portal is stood down.
   *
   * `today` is passed, which is the documented way to make the render
   * deterministic: without it no cell carries `data-today` until the first client
   * environment sync, and a server in UTC would otherwise disagree with a reader
   * thirteen hours ahead.
   */
  it("renders date-picker, open, with its two children and no dangling IDREF", () => {
    const html = renderToString(
      <DatePickerRoot
        id="dp"
        defaultOpen
        label="Due date"
        locale="en-US"
        today={{ year: 2026, month: 4, day: 9 }}
        defaultValue={{ year: 2026, month: 4, day: 20 }}
      >
        <DatePickerLabel>Due date</DatePickerLabel>
        <DatePickerField>
          <DateFieldControl>
            <DateFieldSegments />
          </DateFieldControl>
          <DateFieldHiddenInput />
        </DatePickerField>
        <DatePickerTrigger />
        <DatePickerPortal disabled>
          <DatePickerPositioner>
            <DatePickerContent>
              <DatePickerCalendar firstDayOfWeek={1}>
                <CalendarMonth />
              </DatePickerCalendar>
            </DatePickerContent>
          </DatePickerPositioner>
        </DatePickerPortal>
      </DatePickerRoot>,
    );

    expect(html).toContain('data-scope="date-picker"');
    expect(html).toContain('data-part="date-picker:root"');
    expect(html).toContain('role="dialog"');
    // The two children rendered from the picker's props, not from their own.
    expect(html).toContain('data-part="date-field:segment"');
    expect(html).toContain('data-part="calendar:cell"');
    expect(html).toContain('data-value="2026-04-20"');
    // No title here, so the dialog is named by the trigger — never an IDREF at an
    // element nobody rendered.
    expect(html).toContain('aria-labelledby="date-picker:dp:trigger"');
    expect(html).toContain("data-today");
    expect(danglingIdRefs(html)).toEqual([]);
  });

  /**
   * The toast's own case, and the only component here whose markup is a view
   * onto state the page owns. The store is read during the render — no effect,
   * no document — which is what lets a server emit the region *already full*
   * instead of an empty one a hydration corrects.
   *
   * `portalled={false}` for the reason every other portal here is stood down:
   * the body cannot be written to from a string. The region is rendered whether
   * or not it holds anything, because it is a landmark, and one that comes and
   * goes is one a screen reader has to discover twice.
   */
  it("renders toast, its region and the record its store already holds", () => {
    const toaster = createToaster();
    toaster.create({
      title: "Link copied",
      description: "The link is on your clipboard.",
      action: { label: "Undo", onClick: () => {} },
    });

    const html = renderToString(
      <ToastGroup toaster={toaster} portalled={false}>
        {(record) => (
          <ToastRoot toast={record}>
            <ToastIndicator />
            <ToastTitle>{record.title}</ToastTitle>
            <ToastDescription>{record.description}</ToastDescription>
            <ToastActionTrigger>Undo</ToastActionTrigger>
            <ToastCloseTrigger>Close</ToastCloseTrigger>
          </ToastRoot>
        )}
      </ToastGroup>,
    );

    expect(html).toContain('data-scope="toast"');
    expect(html).toContain('data-part="toast:group"');
    expect(html).toContain('data-part="toast:root"');
    expect(html).toContain('role="region"');
    // `status` and not `alert`: the record is `info`, so the announcer speaks it
    // politely and the card says so.
    expect(html).toContain('role="status"');
    // The top layer is an effect — `showPopover` — and a server runs none.
    expect(html).not.toContain("popover");
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("renders alert-dialog, open, with role=alertdialog and both actions", () => {
    const html = renderToString(
      <AlertDialogRoot defaultOpen>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogPortal disabled>
          <AlertDialogBackdrop />
          <AlertDialogPositioner>
            <AlertDialogContent>
              <AlertDialogTitle>Delete this file?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogAction destructive>Delete</AlertDialogAction>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogActions>
            </AlertDialogContent>
          </AlertDialogPositioner>
        </AlertDialogPortal>
      </AlertDialogRoot>,
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('data-part="dialog:cancel-trigger"');
    expect(html).toContain('data-part="dialog:action-trigger"');
    expect(html).toContain("data-destructive");
    expect(danglingIdRefs(html)).toEqual([]);
  });

  it("renders a whole form, the shape a page actually ships", () => {
    const html = renderToString(
      <form>
        <FieldRoot required>
          <FieldLegend>Account</FieldLegend>
          <InputRoot name="email" type="email">
            <InputControl />
          </InputRoot>
          <InputRoot name="notes">
            <InputTextarea rows={3} />
          </InputRoot>
          <FieldHelperText>Optional.</FieldHelperText>
        </FieldRoot>
        <SeparatorRoot />
        <ButtonRoot type="submit">Sign up</ButtonRoot>
      </form>,
    );

    expect(danglingIdRefs(html)).toEqual([]);
    expect(html).toContain('type="email"');
    expect(html).toContain("<textarea");
    expect(html).toContain('type="submit"');
  });
});
