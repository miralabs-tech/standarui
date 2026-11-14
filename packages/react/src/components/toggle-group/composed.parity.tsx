/**
 * The toggle group's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import { ToggleGroup } from "./composed";
import {
  ToggleGroupFrame,
  ToggleGroupIndicator,
  ToggleGroupItem,
  ToggleGroupLabel,
  ToggleGroupRoot,
  ToggleGroupScrollbar,
  ToggleGroupThumb,
} from "./toggle-group";

export const parity: readonly ParityCase[] = [
  {
    name: "toggle-group",
    composed: (
      <ToggleGroup
        id="align"
        aria-label="Alignment"
        options={[
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ]}
      />
    ),
    parts: (
      <ToggleGroupFrame id="align">
        <ToggleGroupRoot aria-label="Alignment">
          <ToggleGroupIndicator />
          <ToggleGroupItem value="left" label="Left">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="right" label="Right">
            Right
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar>
          <ToggleGroupThumb />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>
    ),
  },
  /**
   * The non-trivial translations at once: a visible `ToggleGroupLabel` (placed
   * only because `label` is given), `multiple` selection, a `defaultValue`, and a
   * disabled item — which stays reachable neither by Tab nor by the arrow keys,
   * exactly as `disabled` behaves on any other composite (`DisabledItem` in the
   * stories).
   */
  {
    name: "toggle-group",
    composed: (
      <ToggleGroup
        id="style"
        label="Text style"
        multiple
        defaultValue={["bold"]}
        options={[
          { value: "bold", label: "Bold" },
          { value: "italic", label: "Italic", disabled: true },
        ]}
      />
    ),
    parts: (
      <ToggleGroupFrame id="style" multiple defaultValue={["bold"]}>
        <ToggleGroupRoot>
          <ToggleGroupLabel>Text style</ToggleGroupLabel>
          <ToggleGroupIndicator />
          <ToggleGroupItem value="bold" label="Bold">
            Bold
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" label="Italic" disabled>
            Italic
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar>
          <ToggleGroupThumb />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>
    ),
  },
  /**
   * The rule the other rows state and none of them exercises: `parts` is applied
   * **last**, so it wins over what the machine itself would have written. Two
   * collisions at once — `parts.indicator` flips the machine's own
   * `aria-hidden="true"` to `"false"`, and `parts.item` reaches every segment at
   * once — and the parts side is written with the value that has to win.
   */
  {
    name: "toggle-group",
    composed: (
      <ToggleGroup
        id="align"
        aria-label="Alignment"
        parts={{ indicator: { "aria-hidden": "false" }, item: { className: "seg" } }}
        options={[
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ]}
      />
    ),
    parts: (
      <ToggleGroupFrame id="align">
        <ToggleGroupRoot aria-label="Alignment">
          <ToggleGroupIndicator aria-hidden="false" />
          <ToggleGroupItem value="left" label="Left" className="seg">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="right" label="Right" className="seg">
            Right
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar>
          <ToggleGroupThumb />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>
    ),
  },
  /**
   * The outer box and the bar answer to `parts` too, and the group's own
   * `className` stays on the root while the layout goes to the frame: both written
   * with the values that have to win, and `aria-hidden` on the bar flipped to prove
   * the consumer's entry is applied last.
   */
  {
    name: "toggle-group",
    composed: (
      <ToggleGroup
        id="align"
        aria-label="Alignment"
        className="group"
        parts={{
          frame: { className: "frame" },
          scrollbar: { "aria-hidden": "false", className: "bar" },
          thumb: { className: "thumb" },
        }}
        options={[
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ]}
      />
    ),
    parts: (
      <ToggleGroupFrame id="align" className="frame">
        <ToggleGroupRoot aria-label="Alignment" className="group">
          <ToggleGroupIndicator />
          <ToggleGroupItem value="left" label="Left">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="right" label="Right">
            Right
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <ToggleGroupScrollbar aria-hidden="false" className="bar">
          <ToggleGroupThumb className="thumb" />
        </ToggleGroupScrollbar>
      </ToggleGroupFrame>
    ),
  },
];
