/**
 * The listbox's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`, and every group pins its own: the group's key is what both
 * its `aria-labelledby` and its label part's `id` are derived from, so an unpinned
 * group would compare two `useId` counters — and would also be the one case where
 * a dangling IDREF could hide, since axe grades a dead `aria-labelledby`
 * `incomplete` rather than a violation.
 */

import type { ParityCase } from "../../composed.harness";
import { Listbox } from "./composed";
import {
  ListboxContent,
  ListboxItem,
  ListboxItemGroup,
  ListboxItemGroupLabel,
  ListboxItemIndicator,
  ListboxItemText,
  ListboxLabel,
  ListboxRoot,
} from "./listbox";

export const parity: readonly ParityCase[] = [
  /**
   * The flat list. `label` is spent twice on each row — drawn in the text part and
   * handed to the item for the typeahead — which is the one duplication this layer
   * makes on purpose.
   */
  {
    name: "listbox",
    composed: (
      <Listbox
        id="fruit"
        label="Fruit"
        defaultValue={["banana"]}
        options={[
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana" },
          { value: "cherry", label: "Cherry", disabled: true },
        ]}
      />
    ),
    parts: (
      <ListboxRoot id="fruit" defaultValue={["banana"]}>
        <ListboxLabel>Fruit</ListboxLabel>
        <ListboxContent>
          <ListboxItem value="apple" label="Apple">
            <ListboxItemText>Apple</ListboxItemText>
            <ListboxItemIndicator />
          </ListboxItem>
          <ListboxItem value="banana" label="Banana">
            <ListboxItemText>Banana</ListboxItemText>
            <ListboxItemIndicator />
          </ListboxItem>
          <ListboxItem value="cherry" label="Cherry" disabled>
            <ListboxItemText>Cherry</ListboxItemText>
            <ListboxItemIndicator />
          </ListboxItem>
        </ListboxContent>
      </ListboxRoot>
    ),
  },
  /**
   * A group, and the translation that makes it: the entry carries the text, the
   * part carries the boolean, and the label part is what the `aria-labelledby`
   * resolves to. Multiple selection, because that is where a group earns its keep.
   */
  {
    name: "listbox",
    composed: (
      <Listbox
        id="files"
        label="Changed files"
        selectionMode="multiple"
        defaultValue={["readme", "styles"]}
        options={[
          {
            id: "project",
            label: "Project",
            options: [
              { value: "readme", label: "README.md" },
              { value: "styles", label: "styles.css" },
            ],
          },
        ]}
      />
    ),
    parts: (
      <ListboxRoot id="files" selectionMode="multiple" defaultValue={["readme", "styles"]}>
        <ListboxLabel>Changed files</ListboxLabel>
        <ListboxContent>
          <ListboxItemGroup id="project" label>
            <ListboxItemGroupLabel>Project</ListboxItemGroupLabel>
            <ListboxItem value="readme" label="README.md">
              <ListboxItemText>README.md</ListboxItemText>
              <ListboxItemIndicator />
            </ListboxItem>
            <ListboxItem value="styles" label="styles.css">
              <ListboxItemText>styles.css</ListboxItemText>
              <ListboxItemIndicator />
            </ListboxItem>
          </ListboxItemGroup>
        </ListboxContent>
      </ListboxRoot>
    ),
  },
  /**
   * `renderOption` wrapping the defaults rather than replacing them, `icon` on the
   * leading track, no `label` at all — the part is then not rendered, because an
   * empty one names nothing — and `parts` applied last on every row.
   */
  {
    name: "listbox",
    composed: (
      <Listbox
        id="hatched"
        parts={{ content: { className: "list" }, item: { className: "row" } }}
        renderOption={(option, defaults) => <span data-label={option.label}>{defaults}</span>}
        options={[{ value: "apple", label: "Apple", icon: <span aria-hidden>◍</span> }]}
      />
    ),
    parts: (
      <ListboxRoot id="hatched">
        <ListboxContent className="list">
          <ListboxItem value="apple" label="Apple" className="row">
            <span data-label="Apple">
              <span aria-hidden>◍</span>
              <ListboxItemText>Apple</ListboxItemText>
              <ListboxItemIndicator />
            </span>
          </ListboxItem>
        </ListboxContent>
      </ListboxRoot>
    ),
  },
];
