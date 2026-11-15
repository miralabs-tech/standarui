/**
 * The search field: the `search` landmark, the capsule inside it, the native
 * searchbox inside that, and the decorations that belong to the presentation —
 * the magnifier, the clear button, and the cancel button that stands *beside*
 * the capsule rather than in it.
 *
 * `SearchFieldRoot` is the row and `SearchFieldField` is the box. They were one
 * element until 2026-09-05; splitting them is what lets the cancel button be a
 * sibling of the capsule instead of a passenger inside it, which is the only
 * arrangement the touch layout draws. A tree without the capsule
 * still renders — and renders unstyled, which is the migration to watch for.
 *
 * Nothing here is a variant of `<InputRoot type="search">`: the machine is its
 * own, because Escape-clears, the clear gesture that hands the focus back and
 * the opt-in shortcut are behaviours a text field does not have. What the two do
 * share — the field box, the ring, the three shapes — is shared through the
 * tokens rather than through a common component, which is where sharing costs
 * nothing at runtime.
 *
 * The `field` inheritance is automatic: like every other control, the root reads
 * the field context for the ids and the states it must wear.
 */

import * as searchField from "@standarui/core/search-field";
import type { ReactNode } from "react";
import { createPart, type PartProps } from "../../create-part";
import { inheritFromField, useFieldContext } from "../../field-context";
import { normalizeProps, type ReactPropTypes } from "../../normalize-props";
import { createPartContext } from "../../part-context";
import { splitProps } from "../../split-props";
import { type MachineRuntimeProps, useMachine } from "../../use-machine";
import { useRender } from "../../use-render";

export type SearchFieldApi = searchField.SearchFieldApi<ReactPropTypes>;

const SearchFieldContext = createPartContext<SearchFieldApi>("SearchField");

export interface UseSearchFieldProps
  extends searchField.SearchFieldMachineProps,
    MachineRuntimeProps {}

export function useSearchField(props: UseSearchFieldProps): SearchFieldApi {
  return searchField.connect(useMachine(searchField.machine, props), normalizeProps);
}

/** The api of the field a subtree sits in — a consumer's own part reads it. */
export function useSearchFieldContext(): SearchFieldApi {
  return SearchFieldContext.usePart("SearchFieldContext");
}

const MACHINE_PROPS = [
  "id",
  "ids",
  "getRootNode",
  "dir",
  "value",
  "defaultValue",
  "shape",
  "placeholder",
  "disabled",
  "invalid",
  "readOnly",
  "required",
  "name",
  "form",
  "autoComplete",
  "inputMode",
  "maxLength",
  "describedBy",
  "label",
  "clearLabel",
  "cancelLabel",
  "clearOnEscape",
  "hotkey",
  "onValueChange",
  "onCancel",
] as const;

export interface SearchFieldRootProps
  extends UseSearchFieldProps,
    PartProps<"div", UseSearchFieldProps> {}

export function SearchFieldRoot(props: SearchFieldRootProps): ReactNode {
  const [machineProps, rest] = splitProps(props, MACHINE_PROPS);
  const { render, asChild, children, ...elementProps } = rest;
  const field = useFieldContext();

  const api = useSearchField({
    ...inheritFromField(machineProps, field),
    ids: { control: field?.controlProps.id, ...machineProps.ids },
  });

  return (
    <SearchFieldContext.Provider value={api}>
      {useRender({
        render,
        asChild,
        element: "div",
        props: api.getRootProps(),
        elementProps,
        children,
      })}
    </SearchFieldContext.Provider>
  );
}

/**
 * The capsule. Everything the field *looks* like is here — the box, the border,
 * the radius, the ring, the read-only wash — and the row above it holds nothing
 * but the layout and the landmark.
 */
export const SearchFieldField: (props: PartProps<"div">) => ReactNode = createPart(
  SearchFieldContext,
  {
    name: "SearchFieldField",
    element: "div",
    props: (api) => api.getFieldProps(),
  },
);

/** Decorative by contract: put an inline SVG in it, never a text glyph. */
export const SearchFieldIndicator: (props: PartProps<"span">) => ReactNode = createPart(
  SearchFieldContext,
  {
    name: "SearchFieldIndicator",
    element: "span",
    props: (api) => api.getIndicatorProps(),
  },
);

export const SearchFieldControl: (props: PartProps<"input">) => ReactNode = createPart(
  SearchFieldContext,
  {
    name: "SearchFieldControl",
    element: "input",
    props: (api) => api.getControlProps(),
  },
);

export const SearchFieldClearTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  SearchFieldContext,
  {
    name: "SearchFieldClearTrigger",
    element: "button",
    props: (api) => api.getClearTriggerProps(),
  },
);

/**
 * A sibling of the capsule, not a child of it — the whole reason the parts were
 * split. It is a real tab stop with a name of its own, so the sheet may draw its
 * glyph; leave it empty and it gets a ✕.
 */
export const SearchFieldCancelTrigger: (props: PartProps<"button">) => ReactNode = createPart(
  SearchFieldContext,
  {
    name: "SearchFieldCancelTrigger",
    element: "button",
    props: (api) => api.getCancelTriggerProps(),
  },
);
