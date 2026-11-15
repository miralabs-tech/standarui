/**
 * The clipboard's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`: the machine mints one for the root, the input, the label
 * and the trigger, and two forms of the same clipboard would otherwise differ on
 * every one of them.
 *
 * `copyLabel` is on the root in both forms and never on the trigger, which is the
 * point of putting it in the table: it reaches the button through
 * `getTriggerProps`, so the composed form must not be caught adding an
 * `aria-label` of its own beside it.
 */

import type { ParityCase } from "../../composed.harness";
import {
  ClipboardControl,
  ClipboardIndicator,
  ClipboardInput,
  ClipboardLabel,
  ClipboardRoot,
  ClipboardTrigger,
} from "./clipboard";
import { Clipboard } from "./composed";

export const parity: readonly ParityCase[] = [
  {
    name: "clipboard",
    composed: <Clipboard id="token" copyLabel="Copy the token" defaultValue="sui-4f3a" />,
    parts: (
      <ClipboardRoot id="token" copyLabel="Copy the token" defaultValue="sui-4f3a">
        <ClipboardControl>
          <ClipboardInput />
          <ClipboardTrigger>
            <ClipboardIndicator />
            <ClipboardIndicator copied />
          </ClipboardTrigger>
        </ClipboardControl>
      </ClipboardRoot>
    ),
  },
  /**
   * `label` placed. It is the one part this layer decides rather than always
   * rendering, and the label carries a `for` the machine points at the input —
   * so this row is also what proves the pair is wired, not merely present.
   */
  {
    name: "clipboard",
    composed: <Clipboard id="script" copyLabel="Copy the install command" label="Install script" />,
    parts: (
      <ClipboardRoot id="script" copyLabel="Copy the install command">
        <ClipboardLabel>Install script</ClipboardLabel>
        <ClipboardControl>
          <ClipboardInput />
          <ClipboardTrigger>
            <ClipboardIndicator />
            <ClipboardIndicator copied />
          </ClipboardTrigger>
        </ClipboardControl>
      </ClipboardRoot>
    ),
  },
  /**
   * `disabled` is a machine prop and must not land on the root as a bare
   * attribute; the composed form spreads its rest onto `ClipboardRoot`, so
   * `MACHINE_PROPS` is what decides. This row proves the spread did not change
   * that — and it carries the disabled trigger, which the sheet dims rather than
   * hides.
   */
  {
    name: "clipboard",
    composed: <Clipboard id="frozen" copyLabel="Copy" defaultValue="held" disabled />,
    parts: (
      <ClipboardRoot id="frozen" copyLabel="Copy" defaultValue="held" disabled>
        <ClipboardControl>
          <ClipboardInput />
          <ClipboardTrigger>
            <ClipboardIndicator />
            <ClipboardIndicator copied />
          </ClipboardTrigger>
        </ClipboardControl>
      </ClipboardRoot>
    ),
  },
  /**
   * `parts` is applied last, so it wins over what the layer placed — and
   * `parts.indicator` reaches BOTH glyphs, which is the one entry here that is
   * not one-to-one with an element.
   */
  {
    name: "clipboard",
    composed: (
      <Clipboard
        id="styled"
        copyLabel="Copy"
        label="Token"
        parts={{
          label: { className: "lbl" },
          control: { className: "row" },
          input: { className: "field" },
          trigger: { className: "btn" },
          indicator: { className: "glyph" },
        }}
      />
    ),
    parts: (
      <ClipboardRoot id="styled" copyLabel="Copy">
        <ClipboardLabel className="lbl">Token</ClipboardLabel>
        <ClipboardControl className="row">
          <ClipboardInput className="field" />
          <ClipboardTrigger className="btn">
            <ClipboardIndicator className="glyph" />
            <ClipboardIndicator copied className="glyph" />
          </ClipboardTrigger>
        </ClipboardControl>
      </ClipboardRoot>
    ),
  },
];
