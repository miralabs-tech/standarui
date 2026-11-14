/**
 * The checkbox-group's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 */

import type { ParityCase } from "../../composed.harness";
import {
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
} from "../checkbox/checkbox";
import { SeparatorRoot } from "../separator/separator";
import { CheckboxGroupLabel, CheckboxGroupRoot } from "./checkbox-group";
import { CheckboxGroup } from "./composed";

export const parity: readonly ParityCase[] = [
  {
    name: "checkbox-group",
    composed: (
      <CheckboxGroup
        id="alerts"
        options={[
          { id: "alerts-mail", value: "mail", label: "Mail" },
          { id: "alerts-sms", value: "sms", label: "Messages" },
        ]}
      />
    ),
    parts: (
      <CheckboxGroupRoot id="alerts">
        <CheckboxRoot id="alerts-mail" value="mail">
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>Mail</CheckboxLabel>
        </CheckboxRoot>
        <CheckboxRoot id="alerts-sms" value="sms">
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>Messages</CheckboxLabel>
        </CheckboxRoot>
      </CheckboxGroupRoot>
    ),
  },
  /**
   * Every non-trivial translation at once: `label` renders the group's own
   * caption, an entry with no `value` is the tri-state summary rather than an
   * item, a `separator` entry becomes a `SeparatorRoot` sitting between them, and
   * a disabled item passes straight through to its box.
   */
  {
    name: "checkbox-group",
    composed: (
      <CheckboxGroup
        id="notifications"
        label="Notifications"
        defaultValue={["mail"]}
        options={[
          { id: "notif-all", label: "All notifications" },
          { separator: true },
          { id: "notif-mail", value: "mail", label: "Mail" },
          { id: "notif-sms", value: "sms", label: "Messages" },
          {
            id: "notif-push",
            value: "push",
            label: "Push (unavailable on this device)",
            disabled: true,
          },
        ]}
      />
    ),
    parts: (
      <CheckboxGroupRoot id="notifications" defaultValue={["mail"]}>
        <CheckboxGroupLabel>Notifications</CheckboxGroupLabel>
        <CheckboxRoot id="notif-all">
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>All notifications</CheckboxLabel>
        </CheckboxRoot>
        <SeparatorRoot />
        <CheckboxRoot id="notif-mail" value="mail">
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>Mail</CheckboxLabel>
        </CheckboxRoot>
        <CheckboxRoot id="notif-sms" value="sms">
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>Messages</CheckboxLabel>
        </CheckboxRoot>
        <CheckboxRoot id="notif-push" value="push" disabled>
          <CheckboxHiddenInput />
          <CheckboxControl>
            <CheckboxIndicator />
          </CheckboxControl>
          <CheckboxLabel>Push (unavailable on this device)</CheckboxLabel>
        </CheckboxRoot>
      </CheckboxGroupRoot>
    ),
  },
];
