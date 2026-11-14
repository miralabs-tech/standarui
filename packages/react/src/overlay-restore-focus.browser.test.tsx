/**
 * R61: an overlay opened from a trigger, the trigger disabled while it is open,
 * then closed by a real Escape. The trigger takes no focus, so the focus the
 * content held goes down to `body` when it unmounts, unless `restoreFocus` falls
 * back on the next tab stop. Select, menu, and the non-modal dialog and popover
 * each restore the focus by their own path; the date picker's is in its own file.
 */

import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DialogCloseTrigger,
  DialogContent,
  DialogPortal,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog/dialog";
import {
  MenuContent,
  MenuItem,
  MenuItemText,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "./components/menu/menu";
import {
  PopoverCloseTrigger,
  PopoverContent,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "./components/popover/popover";
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectPositioner,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./components/select/select";
import { fire, mount, queryPart, realKey, settle, unmountAll, waitFor } from "./render-harness";

afterEach(() => unmountAll());

function Around(props: { readonly children: ReactNode }): ReactNode {
  return (
    <>
      <button type="button">Before</button>
      {props.children}
      <button type="button">After</button>
    </>
  );
}

const scenes: Record<string, { readonly scene: ReactNode; readonly focusIn?: boolean }> = {
  select: {
    scene: (
      <Around>
        <SelectRoot label="Fruit" keepMounted={false}>
          <SelectTrigger>
            <SelectValueText placeholder="Pick a fruit" />
          </SelectTrigger>
          <SelectPortal>
            <SelectPositioner>
              <SelectContent>
                <SelectItem value="apple">
                  <SelectItemText>apple</SelectItemText>
                </SelectItem>
              </SelectContent>
            </SelectPositioner>
          </SelectPortal>
        </SelectRoot>
      </Around>
    ),
  },
  menu: {
    scene: (
      <Around>
        <MenuRoot>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuPortal>
            <MenuPositioner>
              <MenuContent>
                <MenuItem value="duplicate">
                  <MenuItemText>Duplicate</MenuItemText>
                </MenuItem>
              </MenuContent>
            </MenuPositioner>
          </MenuPortal>
        </MenuRoot>
      </Around>
    ),
  },
  "non-modal dialog": {
    focusIn: true,
    scene: (
      <Around>
        <DialogRoot modal={false}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogPortal>
            <DialogPositioner>
              <DialogContent>
                <DialogTitle>Title</DialogTitle>
                <DialogCloseTrigger aria-label="Close">Done</DialogCloseTrigger>
              </DialogContent>
            </DialogPositioner>
          </DialogPortal>
        </DialogRoot>
      </Around>
    ),
  },
  "non-modal popover": {
    scene: (
      <Around>
        <PopoverRoot>
          <PopoverTrigger>Share</PopoverTrigger>
          <PopoverPortal>
            <PopoverPositioner>
              <PopoverContent>
                <PopoverCloseTrigger aria-label="Close">Done</PopoverCloseTrigger>
              </PopoverContent>
            </PopoverPositioner>
          </PopoverPortal>
        </PopoverRoot>
      </Around>
    ),
  },
};

describe("overlays closed after their trigger was disabled while open", () => {
  for (const [name, { scene, focusIn }] of Object.entries(scenes)) {
    it(`hands the focus of the ${name} to the next tab stop`, async () => {
      mount(scene);
      await settle();
      const trigger = queryPart<HTMLButtonElement>(document.body, "trigger");
      if (trigger === null) throw new Error("no trigger");
      fire(() => trigger.focus());
      fire(() => trigger.click());
      await settle();
      await waitFor(() => expect(queryPart(document.body, "content")).not.toBeNull());
      if (focusIn === true) {
        const inside = queryPart(document.body, "content")?.querySelector("button");
        fire(() => inside?.focus());
      }
      await waitFor(() =>
        expect(queryPart(document.body, "content")?.contains(document.activeElement)).toBe(true),
      );

      fire(() => trigger.setAttribute("disabled", ""));
      expect(trigger.disabled).toBe(true);

      await realKey("{Escape}");
      await waitFor(() => expect(queryPart(document.body, "content")).toBeNull());
      await settle();
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.textContent).toBe("After");
    });
  }
});
