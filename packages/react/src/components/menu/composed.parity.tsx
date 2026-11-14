/**
 * The menu's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import { BOLT, OFF, type ParityCase, SAVE } from "../../composed.harness";
import { ButtonRoot } from "../button/button";
import { Menu } from "./composed";
import {
  MenuBackdrop,
  MenuContent,
  MenuContextTrigger,
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
} from "./menu";

export const parity: readonly ParityCase[] = [
  /**
   * The minimal menu: a trigger, a surface, two rows. No group, no separator, no
   * glyph and no checkmark — and the checkmark's absence is the assertion, because
   * an `item-indicator` on a plain `menuitem` would reserve the leading track for
   * every row of a menu that has nothing to check.
   */
  {
    name: "menu",
    composed: (
      <Menu
        id="actions"
        defaultOpen
        parts={OFF}
        trigger={<ButtonRoot />}
        items={[
          { value: "open", label: "Open" },
          { value: "rename", label: "Rename" },
        ]}
      />
    ),
    parts: (
      <MenuRoot id="actions" defaultOpen>
        <MenuTrigger render={<ButtonRoot />} />
        <MenuPortal disabled>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent>
              <MenuItem value="open" label="Open">
                <MenuItemText>Open</MenuItemText>
              </MenuItem>
              <MenuItem value="rename" label="Rename">
                <MenuItemText>Rename</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    ),
  },
  /**
   * Every entry kind at once, the recursive branch included. Three translations
   * are visible here and nowhere else: a group's `label` becomes the flag plus the
   * label part, a row's `description` becomes the flag plus the subtitle part, and
   * a `shortcut` is spent twice — announced on the row, drawn beside it.
   *
   * `keepMounted` is what puts the submenu's own surface in the markup at all: a
   * closed menu renders nothing, so without it this row would prove the trigger
   * item and stop there. The submenu carries an `id` for the same reason both
   * sides carry one — a nested `MenuRoot` mints its scope from `useId()` otherwise,
   * and the comparison would be normalising rather than reading.
   */
  {
    name: "menu",
    composed: (
      <Menu
        id="file"
        defaultOpen
        keepMounted
        parts={OFF}
        trigger={<ButtonRoot variant="gray" />}
        items={[
          {
            id: "group-file",
            label: "File",
            options: [
              { value: "open", label: "Open", icon: SAVE, shortcut: "Meta+O" },
              { value: "rename", label: "Rename", description: "Give the file a new name" },
            ],
          },
          { separator: true },
          { value: "wrap", label: "Wrap lines", type: "checkbox", checked: true },
          { value: "trash", label: "Move to Trash", destructive: true, disabled: true },
          {
            id: "share",
            value: "share",
            label: "Share",
            icon: BOLT,
            items: [{ value: "copy-link", label: "Copy link" }],
          },
        ]}
      />
    ),
    parts: (
      <MenuRoot id="file" defaultOpen keepMounted>
        <MenuTrigger render={<ButtonRoot variant="gray" />} />
        <MenuPortal disabled>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent>
              <MenuItemGroup id="group-file" label>
                <MenuItemGroupLabel>File</MenuItemGroupLabel>
                <MenuItem value="open" label="Open" shortcut="Meta+O">
                  <MenuItemSymbol>{SAVE}</MenuItemSymbol>
                  <MenuItemText>Open</MenuItemText>
                  <MenuItemShortcut>Meta+O</MenuItemShortcut>
                </MenuItem>
                <MenuItem value="rename" label="Rename" description>
                  <MenuItemText>Rename</MenuItemText>
                  <MenuItemDescription>Give the file a new name</MenuItemDescription>
                </MenuItem>
              </MenuItemGroup>
              <MenuSeparator />
              <MenuOptionItem value="wrap" label="Wrap lines" type="checkbox" checked>
                <MenuItemIndicator />
                <MenuItemText>Wrap lines</MenuItemText>
              </MenuOptionItem>
              <MenuItem value="trash" label="Move to Trash" destructive disabled>
                <MenuItemText>Move to Trash</MenuItemText>
              </MenuItem>
              <MenuRoot id="share" keepMounted>
                <MenuTriggerItem value="share" label="Share">
                  <MenuItemSymbol>{BOLT}</MenuItemSymbol>
                  <MenuItemText>Share</MenuItemText>
                </MenuTriggerItem>
                <MenuPortal disabled>
                  <MenuBackdrop />
                  <MenuPositioner>
                    <MenuContent>
                      <MenuItem value="copy-link" label="Copy link">
                        <MenuItemText>Copy link</MenuItemText>
                      </MenuItem>
                    </MenuContent>
                  </MenuPositioner>
                </MenuPortal>
              </MenuRoot>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    ),
  },
  /**
   * Precedence, and the collision is the one the façade owns: `cancelLabel`
   * travels to `MenuContent`, which is also what `parts.content` reaches — so the
   * two spellings meet on one prop and the parts side is written with the winner.
   * The sheet is what makes the Cancel row exist at all; `parts.item` reaches
   * every row at the same time, and the trigger is substituted.
   */
  {
    name: "menu",
    composed: (
      <Menu
        id="sheet"
        defaultOpen
        presentation="sheet"
        cancelLabel="Cancel"
        trigger={<ButtonRoot variant="gray" />}
        parts={{ ...OFF, content: { cancelLabel: "Fermer" }, item: { className: "row" } }}
        items={[
          { value: "open", label: "Open" },
          { value: "trash", label: "Move to Trash", destructive: true },
        ]}
      />
    ),
    parts: (
      <MenuRoot id="sheet" defaultOpen presentation="sheet">
        <MenuTrigger render={<ButtonRoot variant="gray" />} />
        <MenuPortal disabled>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent cancelLabel="Fermer">
              <MenuItem value="open" label="Open" className="row">
                <MenuItemText>Open</MenuItemText>
              </MenuItem>
              <MenuItem value="trash" label="Move to Trash" destructive className="row">
                <MenuItemText>Move to Trash</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    ),
  },
  /**
   * The other anchor: no button anywhere, a region that answers a right click, a
   * long press, Shift+F10 and the pad's `contextMenu` intent. A surface with no
   * trigger cannot be named by one, so it takes `label` — and the machine writes
   * no `aria-labelledby` at all rather than one pointing at a button nobody wrote.
   */
  {
    name: "menu",
    composed: (
      <Menu
        id="canvas"
        defaultOpen
        label="Canvas actions"
        parts={OFF}
        contextTrigger={<div className="canvas">Right-click here</div>}
        items={[{ value: "paste", label: "Paste" }]}
      />
    ),
    parts: (
      <MenuRoot id="canvas" defaultOpen label="Canvas actions">
        <MenuContextTrigger>
          <div className="canvas">Right-click here</div>
        </MenuContextTrigger>
        <MenuPortal disabled>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent>
              <MenuItem value="paste" label="Paste">
                <MenuItemText>Paste</MenuItemText>
              </MenuItem>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    ),
  },
  /**
   * `renderItem`, over a tree that stands the two shapes it must reach right next
   * to the three it must not (composed.tsx:270): a group's own row and a row the
   * recursion nests one level inside a submenu on one side, the group container,
   * the separator and the submenu's own trigger item on the other. The parts side
   * writes the badge on the two rows alone — if the composed layer reached one
   * shape further, the two forms would diverge to the character, which is what a
   * string comparison catches and a count of badges could still pass by accident.
   */
  {
    name: "menu",
    composed: (
      <Menu
        id="edit"
        defaultOpen
        keepMounted
        parts={OFF}
        trigger={<ButtonRoot />}
        renderItem={(row, defaults) => (
          <>
            {defaults}
            <span aria-hidden="true" data-badge={row.value} />
          </>
        )}
        items={[
          {
            id: "group-edit",
            label: "Edit",
            options: [
              { value: "wrap", label: "Wrap lines", type: "checkbox", checked: true },
              { value: "rename", label: "Rename" },
            ],
          },
          { separator: true },
          {
            id: "share",
            value: "share",
            label: "Share",
            items: [{ value: "copy-link", label: "Copy link" }],
          },
        ]}
      />
    ),
    parts: (
      <MenuRoot id="edit" defaultOpen keepMounted>
        <MenuTrigger render={<ButtonRoot />} />
        <MenuPortal disabled>
          <MenuBackdrop />
          <MenuPositioner>
            <MenuContent>
              <MenuItemGroup id="group-edit" label>
                <MenuItemGroupLabel>Edit</MenuItemGroupLabel>
                <MenuOptionItem value="wrap" label="Wrap lines" type="checkbox" checked>
                  <MenuItemIndicator />
                  <MenuItemText>Wrap lines</MenuItemText>
                  <span aria-hidden="true" data-badge="wrap" />
                </MenuOptionItem>
                <MenuItem value="rename" label="Rename">
                  <MenuItemText>Rename</MenuItemText>
                  <span aria-hidden="true" data-badge="rename" />
                </MenuItem>
              </MenuItemGroup>
              <MenuSeparator />
              <MenuRoot id="share" keepMounted>
                <MenuTriggerItem value="share" label="Share">
                  <MenuItemText>Share</MenuItemText>
                </MenuTriggerItem>
                <MenuPortal disabled>
                  <MenuBackdrop />
                  <MenuPositioner>
                    <MenuContent>
                      <MenuItem value="copy-link" label="Copy link">
                        <MenuItemText>Copy link</MenuItemText>
                        <span aria-hidden="true" data-badge="copy-link" />
                      </MenuItem>
                    </MenuContent>
                  </MenuPositioner>
                </MenuPortal>
              </MenuRoot>
            </MenuContent>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
    ),
  },
];
