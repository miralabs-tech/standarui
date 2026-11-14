/**
 * The accordion's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id`. Each section's header, trigger, content and body derive
 * their ids from the root's, so an unpinned row would compare two `useId` counters
 * and fail on the one thing the two forms genuinely share.
 */

import type { ParityCase } from "../../composed.harness";
import {
  AccordionBody,
  AccordionContent,
  AccordionHeader,
  AccordionIndicator,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from "./accordion";
import { Accordion } from "./composed";

export const parity: readonly ParityCase[] = [
  /** The minimal form: two sections, one open from the first render. */
  {
    name: "accordion",
    composed: (
      <Accordion
        id="settings"
        defaultValue={["general"]}
        items={[
          { value: "general", label: "General", content: "Appearance and language." },
          { value: "billing", label: "Billing", content: "The card on file." },
        ]}
      />
    ),
    parts: (
      <AccordionRoot id="settings" defaultValue={["general"]}>
        <AccordionItem value="general">
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator />
              General
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Appearance and language.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="billing">
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator />
              Billing
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>The card on file.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
    ),
  },
  /**
   * `multiple` with two sections open at once, and a disabled one — the entry's
   * `disabled` is spent on the item, and the machine carries it down to the header,
   * trigger and indicator through the item context rather than from here.
   */
  {
    name: "accordion",
    composed: (
      <Accordion
        id="workspace"
        multiple
        defaultValue={["general", "team"]}
        items={[
          { value: "general", label: "General", content: "Appearance and language." },
          { value: "team", label: "Team", content: "Who is in the workspace." },
          { value: "audit", label: "Audit log", content: "Enterprise only.", disabled: true },
        ]}
      />
    ),
    parts: (
      <AccordionRoot id="workspace" multiple defaultValue={["general", "team"]}>
        <AccordionItem value="general">
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator />
              General
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Appearance and language.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="team">
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator />
              Team
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Who is in the workspace.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="audit" disabled>
          <AccordionHeader>
            <AccordionTrigger>
              <AccordionIndicator />
              Audit log
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <AccordionBody>Enterprise only.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
    ),
  },
  /**
   * `icon` beside the label, and `parts` applied **last** — including the heading
   * level, which is the key this component expects to be reached for most often
   * and the one it deliberately does not restate as a prop of its own.
   */
  {
    name: "accordion",
    composed: (
      <Accordion
        id="faq"
        parts={{
          // biome-ignore lint/a11y/useHeadingContent: the substituted element is empty on purpose — `useRender` fills it with the header's children, which is the trigger and its text. The rule reads the literal and cannot see that.
          header: { render: <h2 /> },
          item: { className: "section" },
          trigger: { className: "row" },
          indicator: { "aria-hidden": "false" },
          content: { className: "panel" },
          body: { className: "prose" },
        }}
        items={[
          {
            value: "shipping",
            label: "Shipping",
            icon: <span aria-hidden>▣</span>,
            content: "Two working days.",
          },
        ]}
      />
    ),
    parts: (
      <AccordionRoot id="faq">
        <AccordionItem value="shipping" className="section">
          <AccordionHeader
            // biome-ignore lint/a11y/useHeadingContent: same as the composed side — the header's children are what fill it.
            render={<h2 />}
          >
            <AccordionTrigger className="row">
              <AccordionIndicator aria-hidden="false" />
              <span aria-hidden>▣</span>
              Shipping
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionContent className="panel">
            <AccordionBody className="prose">Two working days.</AccordionBody>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
    ),
  },
];
