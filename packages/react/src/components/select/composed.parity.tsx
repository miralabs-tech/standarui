/**
 * The select's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { BOLT, OFF, type ParityCase, SUN } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { FieldLabel, FieldRoot } from "../field/field";
import { Select } from "./composed";
import {
  SelectBackdrop,
  SelectCancelTrigger,
  SelectContent,
  SelectHiddenSelect,
  SelectIndicator,
  SelectItem,
  SelectItemGroup,
  SelectItemGroupLabel,
  SelectItemIndicator,
  SelectItemSymbol,
  SelectItemText,
  SelectPortal,
  SelectPositioner,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValueText,
} from "./select";

export const parity: readonly ParityCase[] = [
  {
    name: "select",
    composed: (
      <Select
        id="sort"
        label="Sort by"
        parts={OFF}
        options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
        ]}
      />
    ),
    parts: (
      <SelectRoot id="sort" label="Sort by">
        <SelectTrigger>
          <SelectValueText />
          <SelectIndicator />
        </SelectTrigger>
        <SelectHiddenSelect />
        <SelectPortal disabled>
          <SelectBackdrop />
          <SelectPositioner>
            <SelectContent>
              <SelectItem value="name" label="Name">
                <SelectItemIndicator />
                <SelectItemText>Name</SelectItemText>
              </SelectItem>
              <SelectItem value="date" label="Date">
                <SelectItemIndicator />
                <SelectItemText>Date</SelectItemText>
              </SelectItem>
            </SelectContent>
          </SelectPositioner>
        </SelectPortal>
      </SelectRoot>
    ),
  },
  {
    name: "select",
    composed: (
      <Select
        id="condition"
        label="Condition"
        placeholder="Choose a condition"
        defaultValue="clear"
        presentation="sheet"
        cancelLabel="Cancel"
        parts={OFF}
        options={[
          { value: "storm", label: "Storm", disabled: true, icon: BOLT },
          { separator: true },
          {
            id: "staples",
            label: "Staples",
            options: [
              { value: "none", label: "None" },
              { value: "automatic", label: "Automatic" },
            ],
          },
          {
            id: "conditions",
            label: "Conditions",
            options: [
              { value: "clear", label: "Clear", icon: SUN },
              { value: "cloudy", label: "Cloudy" },
            ],
          },
        ]}
      />
    ),
    parts: (
      <SelectRoot id="condition" label="Condition" defaultValue="clear" presentation="sheet">
        <SelectTrigger>
          <SelectValueText placeholder="Choose a condition" />
          <SelectIndicator />
        </SelectTrigger>
        <SelectHiddenSelect />
        <SelectPortal disabled>
          <SelectBackdrop />
          <SelectPositioner>
            <SelectContent>
              <SelectItem value="storm" label="Storm" disabled>
                <SelectItemIndicator />
                <SelectItemSymbol>{BOLT}</SelectItemSymbol>
                <SelectItemText>Storm</SelectItemText>
              </SelectItem>
              <SelectSeparator />
              <SelectItemGroup id="staples" label>
                <SelectItemGroupLabel>Staples</SelectItemGroupLabel>
                <SelectItem value="none" label="None">
                  <SelectItemIndicator />
                  <SelectItemText>None</SelectItemText>
                </SelectItem>
                <SelectItem value="automatic" label="Automatic">
                  <SelectItemIndicator />
                  <SelectItemText>Automatic</SelectItemText>
                </SelectItem>
              </SelectItemGroup>
              <SelectItemGroup id="conditions" label>
                <SelectItemGroupLabel>Conditions</SelectItemGroupLabel>
                <SelectItem value="clear" label="Clear">
                  <SelectItemIndicator />
                  <SelectItemSymbol>{SUN}</SelectItemSymbol>
                  <SelectItemText>Clear</SelectItemText>
                </SelectItem>
                <SelectItem value="cloudy" label="Cloudy">
                  <SelectItemIndicator />
                  <SelectItemText>Cloudy</SelectItemText>
                </SelectItem>
              </SelectItemGroup>
            </SelectContent>
            <SelectCancelTrigger>Cancel</SelectCancelTrigger>
          </SelectPositioner>
        </SelectPortal>
      </SelectRoot>
    ),
  },
  /**
   * The nesting nobody had put in a table: a select with **no `label` of its
   * own**, named by the field above it. `SelectRoot` hands the field's control id
   * to the trigger (`select.tsx:96-98`), so `label[for]` resolves natively and no
   * `aria-labelledby` is written at all — which is exactly why the composed form
   * has to place the trigger where the parts form does, and why this row is worth
   * a character comparison rather than a screenshot.
   */
  {
    name: "select",
    composed: (
      <FieldRoot id="weather">
        <FieldLabel>Condition</FieldLabel>
        <Select
          id="condition"
          parts={OFF}
          options={[
            { value: "clear", label: "Clear" },
            { value: "cloudy", label: "Cloudy" },
          ]}
        />
      </FieldRoot>
    ),
    parts: (
      <FieldRoot id="weather">
        <FieldLabel>Condition</FieldLabel>
        <SelectRoot id="condition">
          <SelectTrigger>
            <SelectValueText />
            <SelectIndicator />
          </SelectTrigger>
          <SelectHiddenSelect />
          <SelectPortal disabled>
            <SelectBackdrop />
            <SelectPositioner>
              <SelectContent>
                <SelectItem value="clear" label="Clear">
                  <SelectItemIndicator />
                  <SelectItemText>Clear</SelectItemText>
                </SelectItem>
                <SelectItem value="cloudy" label="Cloudy">
                  <SelectItemIndicator />
                  <SelectItemText>Cloudy</SelectItemText>
                </SelectItem>
              </SelectContent>
            </SelectPositioner>
          </SelectPortal>
        </SelectRoot>
      </FieldRoot>
    ),
  },
  /**
   * The rule the other rows state and none of them exercises: `parts` is applied
   * **last**, so it wins over what the layer defaults. Three collisions at once —
   * a substituted `trigger`, a `parts.valueText.placeholder` against the
   * `placeholder` prop, and a `parts.item` reaching every row — and the parts side
   * is written with the value that has to win.
   */
  {
    name: "select",
    composed: (
      <Select
        id="sort"
        label="Sort by"
        placeholder="Choose a column"
        trigger={<ButtonRoot variant="gray" />}
        parts={{ ...OFF, valueText: { placeholder: "Autre" }, item: { className: "x" } }}
        options={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
        ]}
      />
    ),
    parts: (
      <SelectRoot id="sort" label="Sort by">
        <SelectTrigger render={<ButtonRoot variant="gray" />}>
          <SelectValueText placeholder="Autre" />
          <SelectIndicator />
        </SelectTrigger>
        <SelectHiddenSelect />
        <SelectPortal disabled>
          <SelectBackdrop />
          <SelectPositioner>
            <SelectContent>
              <SelectItem value="name" label="Name" className="x">
                <SelectItemIndicator />
                <SelectItemText>Name</SelectItemText>
              </SelectItem>
              <SelectItem value="date" label="Date" className="x">
                <SelectItemIndicator />
                <SelectItemText>Date</SelectItemText>
              </SelectItem>
            </SelectContent>
          </SelectPositioner>
        </SelectPortal>
      </SelectRoot>
    ),
  },
];
