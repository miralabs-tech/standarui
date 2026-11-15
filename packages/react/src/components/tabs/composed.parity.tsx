/**
 * The tab list's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `defaultValue`. A tab list settles its selection in an effect and
 * `renderToString` runs none, so an unpinned row would render no selected panel —
 * and the loop's `danglingIdRefs` read would then be green for the wrong reason,
 * on markup where no trigger writes `aria-controls` at all.
 */

import type { ParityCase } from "../../composed.harness";
import { Tabs } from "./composed";
import {
  TabsCloseTrigger,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsScrollbar,
  TabsThumb,
  TabsTrigger,
} from "./tabs";

export const parity: readonly ParityCase[] = [
  /** The minimal form: two entries, and the two loops they each land in. */
  {
    name: "tabs",
    composed: (
      <Tabs
        id="doc"
        defaultValue="overview"
        items={[
          { value: "overview", label: "Overview", content: "What this document is." },
          { value: "activity", label: "Activity", content: "Who touched it last." },
        ]}
      />
    ),
    parts: (
      <TabsRoot id="doc" defaultValue="overview">
        <TabsList>
          <TabsIndicator />
          <TabsTrigger value="overview" label="Overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity" label="Activity">
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsScrollbar>
          <TabsThumb />
        </TabsScrollbar>
        <TabsContent value="overview">What this document is.</TabsContent>
        <TabsContent value="activity">Who touched it last.</TabsContent>
      </TabsRoot>
    ),
  },
  /**
   * `closable`, and the interleaving it produces: a close button is a **sibling**
   * of its tab, so the list reads trigger, close, trigger, close — never a pair
   * wrapped in anything. A disabled entry disables both of its controls, which is
   * the one place an entry's `disabled` is spent twice.
   */
  {
    name: "tabs",
    composed: (
      <Tabs
        id="editor"
        defaultValue="main"
        closable
        items={[
          { value: "main", label: "main.ts", content: "The entry point." },
          { value: "readme", label: "README.md", content: "# Title" },
          { value: "lock", label: "bun.lock", content: "…", disabled: true },
        ]}
      />
    ),
    parts: (
      <TabsRoot id="editor" defaultValue="main" closable>
        <TabsList>
          <TabsIndicator />
          <TabsTrigger value="main" label="main.ts">
            main.ts
          </TabsTrigger>
          <TabsCloseTrigger value="main" />
          <TabsTrigger value="readme" label="README.md">
            README.md
          </TabsTrigger>
          <TabsCloseTrigger value="readme" />
          <TabsTrigger value="lock" label="bun.lock" disabled>
            bun.lock
          </TabsTrigger>
          <TabsCloseTrigger value="lock" disabled />
        </TabsList>
        <TabsScrollbar>
          <TabsThumb />
        </TabsScrollbar>
        <TabsContent value="main">The entry point.</TabsContent>
        <TabsContent value="readme"># Title</TabsContent>
        <TabsContent value="lock">…</TabsContent>
      </TabsRoot>
    ),
  },
  /**
   * The rule the other rows state and neither exercises: `parts` is applied
   * **last**, so it wins over what the machine itself would have written. All five
   * keys at once — `parts.indicator` flips the machine's own `aria-hidden="true"`
   * to `"false"`, and `trigger`, `closeTrigger` and `content` each reach every
   * element of their collection rather than the first. The parts side is written
   * with the values that have to win.
   */
  {
    name: "tabs",
    composed: (
      <Tabs
        id="doc"
        defaultValue="overview"
        closable
        parts={{
          list: { "aria-label": "Document sections" },
          indicator: { "aria-hidden": "false" },
          scrollbar: { className: "bar", "aria-hidden": "false" },
          thumb: { className: "thumb" },
          trigger: { className: "tab" },
          closeTrigger: { className: "tab-close" },
          content: { className: "panel" },
        }}
        items={[
          { value: "overview", label: "Overview", content: "What this document is." },
          { value: "activity", label: "Activity", content: "Who touched it last." },
        ]}
      />
    ),
    parts: (
      <TabsRoot id="doc" defaultValue="overview" closable>
        <TabsList aria-label="Document sections">
          <TabsIndicator aria-hidden="false" />
          <TabsTrigger value="overview" label="Overview" className="tab">
            Overview
          </TabsTrigger>
          <TabsCloseTrigger value="overview" className="tab-close" />
          <TabsTrigger value="activity" label="Activity" className="tab">
            Activity
          </TabsTrigger>
          <TabsCloseTrigger value="activity" className="tab-close" />
        </TabsList>
        <TabsScrollbar className="bar" aria-hidden="false">
          <TabsThumb className="thumb" />
        </TabsScrollbar>
        <TabsContent value="overview" className="panel">
          What this document is.
        </TabsContent>
        <TabsContent value="activity" className="panel">
          Who touched it last.
        </TabsContent>
      </TabsRoot>
    ),
  },
];
