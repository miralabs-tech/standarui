// Size budgets from CDC §5.1, enforced on the built output.
//
// Written rather than delegated to size-limit: the budgets are not "how big is
// this file", they are "how much does a consumer pay". The engine is a fixed cost
// amortised across every component, so a component is measured with the shared
// layers marked external — otherwise every component would be charged for the
// engine again and the 3 kB line would be meaningless. size-limit would need a
// synthetic entry per line anyway, and this needed no new dependency.
//
// Gzip sizes are Bun's default level, which reads a little heavier than
// `gzip -9` — cite one or the other, never mix.

import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Declared locally rather than through `@types/bun`: that package ships its own
// node typings, which collide with the `types: ["node"]` this tsconfig already
// uses. Only the two calls below are needed.
declare const Bun: {
  build(options: {
    entrypoints: string[];
    target?: "browser" | "node" | "bun";
    minify?: boolean;
    splitting?: boolean;
    external?: string[] | undefined;
  }): Promise<{
    success: boolean;
    logs: unknown[];
    outputs: { text(): Promise<string> }[];
  }>;
  gzipSync(data: Uint8Array): Uint8Array;
};

const rootDir = path.resolve(import.meta.dirname, "..");

interface Budget {
  readonly name: string;
  /** Files whose exports are bundled together, relative to the package dist. */
  readonly entries: readonly string[];
  /**
   * min+gzip ceiling in bytes. `null` is "measured, not yet ceilinged": the line
   * is bundled and reported like any other, and the run **fails**, printing the
   * measurement — a ceiling is written after the number exists, never before
   * (CDC §5.1, 2026-09-05), and a default would be a guess this file ratifies by
   * being green.
   */
  readonly limit: number | null;
  /**
   * Where this line's ceiling is written, named in the failure a `null` limit
   * prints. Only the composed layer has a table of its own; every other line is
   * ceilinged inline, right here, and the message used to send a maintainer to
   * `COMPOSED_LIMITS` whatever kind of line had gone uncelinged — which would be
   * the wrong file for all but one of them.
   */
  readonly ceiling?: string;
  /** Import specifiers left out of the bundle — the amortised layers. */
  readonly external?: readonly string[];
  /** Workspace package, from the repo root. Defaults to the core. */
  readonly dist?: string;
  readonly note?: string;
}

function distOf(budget: Budget): string {
  return path.join(rootDir, budget.dist ?? "packages/core/dist");
}

const KB = 1024;

/**
 * The input engines are a dependency since decision 57, and a dependency is never
 * part of what a line weighs: it is one instance per document, installed once and
 * amortised over every consumer, exactly like the engine layers a component line
 * marks external. Appended to every build below rather than to each line, so a
 * line cannot forget it and quietly charge a component for the intent bus.
 */
const NAV_EXTERNAL: readonly string[] = ["@standarx/nav", "@standarx/nav/*"];

const budgets: readonly Budget[] = [
  {
    name: "engine (machine + dom)",
    entries: [
      "machine/service.js",
      "machine/scope.js",
      "machine/create-machine.js",
      "machine/anatomy.js",
      "machine/ids.js",
      "machine/slot.js",
      "dom/attrs.js",
      "dom/event.js",
      "dom/query.js",
      "dom/raf.js",
    ],
    limit: 4 * KB,
    note: "fixed cost, amortised across every component",
  },
  {
    name: "reactivity (reference adapter)",
    entries: ["reactivity.js"],
    limit: 2 * KB,
    // Not the vanilla adapter's store, which this note claimed until that adapter
    // was written: it flushes its trackers before it notifies, and an adapter that
    // mounts a surface on open needs the opposite order. This is the harness's.
    note: "the framework-free reference adapter — what the core's own DOM tests run on",
  },
  {
    // No CDC line covers this one; it gets a ceiling anyway, because an unbudgeted
    // module is how a budget rots — and this was the largest unbudgeted export in
    // the workspace. The risk is less the bytes than the API surface: the root is
    // the engine plus every shared primitive, including Phase 6-8 infrastructure
    // (layer-stack, focus-trap, typeahead, grid-collection…) that no shipped
    // component consumes yet. Tree-shaking is honest — `import { dataAttr }`
    // bundles to 54 B — so nobody pays this whole line; growth here is new public
    // surface that a 0.1.0 freezes.
    //
    // 16 → 17 on 2026-09-11, and the measurement is the argument. The line stood at
    // **15.79 kB, 99 % of it**, before this change touched anything: the pressure is
    // older than the module that crossed it. `interaction/drag-axis` adds 0.47 kB
    // here against 0.75 on its own line — `addDomEvent` and `resolveDir` are already
    // in this bundle, so the barrel pays only what is new.
    //
    // Not raised to the 16.5 that would just fit: `drawer` adds three lines to the
    // dialog's contract next, and `carousel` and `splitter` follow in the same
    // phase. 16.5 buys one PR and costs a second amendment inside one phase, which
    // is the churn a dated ceiling exists to avoid.
    //
    // Splitting rather than raising is not available and it is worth saying why
    // rather than leaving it implied: this line *is* the unsplit surface. The split
    // already happened, component by component, and every one of those subpaths has
    // its own line. What is left here is the shared primitives, and a consumer
    // reaches them by name — nobody downloads this bundle.
    name: "core root export",
    entries: ["index.js"],
    limit: 17 * KB, // measured 16.26 with drag-axis, 15.79 without
    note: "the whole shared surface as one payload — no consumer pays it all",
  },
  {
    name: "positioner",
    entries: ["positioner/track-position.js", "positioner/compute-position.js"],
    limit: 3 * KB,
    external: ["../dom/*"],
  },
  {
    // A component line marks *all* shared layers external, which is right for the
    // amortised ones — and silently free for a module with exactly one consumer.
    // Amortised over one component is not amortised: measured with only the
    // engine external, the button really costs its own line plus this one
    // (3.40 kB, not 1.54). Budgeted separately so the cost stops being invisible;
    // the day a second component presses, the amortisation becomes real.
    name: "press interaction",
    entries: ["interaction/press.js"],
    limit: 1 * KB,
    external: ["../*"],
    note: "one consumer today (button) — budgeted so it cannot hide",
  },
  {
    // The same reasoning as `press` one module over: a component line marks every
    // shared layer external, so a primitive with a single consumer would cost
    // nothing anywhere. It gets its own line the day it is written rather than the
    // day a second consumer appears.
    //
    // No consumer at all yet, which is deliberate: `drawer` is the first and
    // `carousel` and `splitter` (Phase 7) are why it is not written inside it.
    //
    // Measured 0.97 kB, and 1 is the round quarter above it — the same margin the
    // neighbours carry, each ceiling being the quarter-kB above its own reading
    // rather than a class-wide default. The drawer spec
    // of 2026-09-10 proposed this same 1 kB by reading `press`'s line rather than
    // any measurement; it happens to land in the right place, which is luck and not
    // method, and the number here is the measured one.
    name: "drag axis",
    entries: ["interaction/drag-axis.js"],
    // Measured 1.01 on 2026-11-11 (R108: axis and dir read per gesture); the quarter above.
    limit: 1.25 * KB,
    external: ["../*"],
    note: "the tracking half of a gesture — no settle, no WAAPI",
  },
  {
    // Opt-in subpath, the library's second WAAPI module after `@standarx/nav`'s
    // `focus-ring`, and for the same trade: a consumer who never drags a surface
    // should not download an animation engine's worth of call sites. `motion.md:312`
    // names this export by its address, so the line is here rather than folded
    // into the drawer's.
    //
    // Measured 0.50 kB against the 1.5 the drawer spec proposed — three times the
    // real cost, predicted before anything existed to weigh. Worth recording
    // because the argument for the ceiling was sound and the number was still
    // wrong: "no physics at runtime" turns out to mean three property reads and an
    // `animate()` call, and nothing else. 0.75 is the round quarter above it.
    name: "gesture settle",
    entries: ["gesture/settle.js"],
    limit: 0.75 * KB, // measured 0.50
    external: ["../*"],
    note: "opt-in @standarui/core/gesture — three precalculated recipes, no physics",
  },
  {
    // Same situation as press: toggle-group is the only consumer, so no table row
    // was charged for it (toggle-group really costs 3.79 kB, not 2.37). Every
    // future composite (tabs, menu, listbox) will amortise this line for real —
    // and `tabs` is the first of them, landed 2026-09-01. It also brought
    // `getRemovalIndex` in here rather than keeping it: "where the focus goes when
    // the item under it is removed" is APG-generic arithmetic about a collection,
    // which is exactly what this module is for, and `menu` and `toast` want the
    // same answer.
    // 2026-11-09: `focus/tabbable.js` left this line — the tab order is read from
    // `@standarx/nav` 0.4.0 (`getTabbables`), which is external here.
    name: "roving focus",
    entries: ["focus/roving-focus.js"],
    limit: 2 * KB,
    external: ["../*"],
    note: "amortised over toggle-group and tabs",
  },
  {
    // Same situation as press and roving-focus: slider is the only consumer, so
    // `external: ["../../*"]` on its own line would have made this free. It is
    // budgeted the day it moved out of `components/slider`, not the day a second
    // consumer arrives — that is the whole point of the 2026-08-28 rule.
    // range-slider is the second consumer, and scrubbers the third. Measured
    // 0.84 kB, and note what the split really cost: the slider fell 5.11 → 4.64
    // while this appeared at 0.84, so a lone consumer pays 0.37 kB *more* than
    // before — two gzip payloads, two dictionaries. Bought for the reuse, not for
    // the size, and the day range-slider lands it is repaid twice over.
    name: "range arithmetic",
    entries: ["utils/range.js"],
    limit: 1 * KB,
    external: ["../*"],
    note: "one consumer today (slider) — budgeted so it cannot hide",
  },
  {
    // Three consumers on day one — calendar, date-field and date-picker — which
    // makes it the only one of the shared splits not to start alone, and the
    // `utils/range` warning above (+0.37 kB for a lone consumer, two gzip
    // dictionaries) does not apply. Split for the reuse, and this line exists so
    // the split cannot hide: with `../../*` external on three component lines, the
    // date arithmetic would otherwise be measured nowhere.
    name: "plain date arithmetic",
    entries: ["utils/plain-date.js"],
    limit: 1.25 * KB, // measured 1.00 (1028 B)
    external: ["../*"],
    note: "the value type and its arithmetic — three consumers from the first day",
  },
  {
    // Separate from the arithmetic because `date-field` needs a formatter without
    // a grid, and because the costs are opposite: the arithmetic is free and an
    // `Intl.DateTimeFormat` is the allocation this module caches.
    //
    // `*/plain-date.js` is load-bearing, and the pattern is the one this file
    // already learned on the composed layer: a wildcard **anchored on the file
    // name**. This module imports `./plain-date.js`, which carries its own line
    // above; without externalising it that module is inlined here and the two
    // lines double-count it — measured 682 B with, 855 B without.
    //
    // Not `./*`, which was tried and measured on 2026-09-05: `*` crosses `/`, so
    // it matches the synthetic entry's own `./utils/date-format.js` and collapses
    // the bundle to a re-export stub — **57 B, and green**. That is the
    // `react shared contexts` failure of 2026-08-31 exactly: a line that weighs
    // nothing reads as proof. The pattern was correct on the source tree, where
    // the entry *is* the module and `./*` could only match its sibling; it is
    // wrong on `dist`, which is what this file measures.
    name: "date formatting (Intl)",
    entries: ["utils/date-format.js"],
    limit: 0.75 * KB, // measured 0.67 (682 B)
    external: ["../*", "*/plain-date.js"],
    note: "the Intl layer alone — plain-date is external and budgeted above",
  },
  {
    // The `press` and `range` situation again: one consumer today, so a component
    // line marking `../../*` external would make this free. Budgeted the day it
    // moved out of `components/color-picker`, not the day a second consumer
    // arrives — the 2026-08-28 rule.
    name: "color arithmetic",
    entries: ["utils/color.js"],
    limit: 2 * KB, // measured 1.86 (1905 B), was 1897 B before R22 kept the hue's 360
    external: ["../*"],
    note: "one consumer today (color-picker) — budgeted so it cannot hide",
  },
  {
    // The debt the menu's line named and could not pay: the module had no
    // consumer, so there was nothing to measure it against. `color-picker` is the
    // first (2026-09-05) and `calendar` the second, both through
    // `getGridKeyAction` — which is also where the RTL mirror lives, so neither
    // component redoes it.
    name: "grid collection",
    entries: ["collection/grid-collection.js"],
    limit: 0.75 * KB, // measured 0.66 (672 B)
    external: ["../*"],
    note: "two consumers from the first day (color-picker, calendar)",
  },
  {
    // J7b, 2026-11-11: the cumulative index behind `getVirtualRange` and the
    // `useVirtualizer` hook. Pure arithmetic, no DOM: sums recomputed from the lowest
    // row that changed, the window found by bisection.
    name: "virtual index",
    entries: ["collection/virtual-index.js"],
    limit: 1 * KB, // measured 0.80 on 2026-11-11 (J7b, finite guard)
    external: ["../*"],
    note: "one consumer (react/use-virtualizer) — budgeted so it cannot hide",
  },
  {
    // Fourth time, same shape as press, roving-focus and range: the module has
    // shipped since Phase 2 with no component importing it, so it was measured
    // nowhere — `../*` external on the tooltip's own line would have kept it
    // free. The tooltip is its first consumer and only under `longPress`, which
    // is off by default; `context-menu` and the touch `menu` are the two that
    // will amortise this for real.
    name: "long press",
    entries: ["interaction/long-press.js"],
    limit: 1 * KB,
    external: ["../*"],
    note: "one opt-in consumer today (tooltip) — budgeted so it cannot hide",
  },
  {
    name: "toggle",
    entries: ["components/toggle/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "button",
    entries: ["components/button/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // 2026-11-08: the inline overflow (the scroll edge effect on the root, the
    // measured pill in every sizing, and focus moves that scroll the segment into
    // view) measured 3.03 kB; raised to 3.25 — J6a inline scroll, ADR 0001.
    // 2026-11-14: the frame, the scrollbar and the thumb (three parts, three getters
    // and the `trackScrollbar` effect) measured 3.26 kB (3 340 B); raised to 3.5 — R138.
    name: "toggle-group",
    entries: ["components/toggle-group/index.js"],
    limit: 3.5 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // Fifth time, same shape as press, roving-focus, range and long-press: split
    // out of `components/tabs` on 2026-09-01 rather than left inside a line that
    // marks `../../*` external and would therefore have measured it nowhere.
    //
    // Shared on purpose, not merely moved: `toggle-group` measures through it in
    // every sizing and falls back to layout boxes of its own so that a pressed,
    // scaled segment does not skew the number. The day a caller needs the
    // rect-based geometry — the `tab-bar` presentation of Phase 7 is the next one —
    // it needs this.
    name: "indicator geometry",
    entries: ["utils/indicator-rect.js"],
    limit: KB,
    external: ["../*"],
    note: "three consumers today (tabs, radio-group, toggle-group) — budgeted so it cannot hide",
  },
  {
    // Sixth and seventh, split out of `components/menu` on the day it landed and
    // for the same reason as the five above: a line that marks `../../*` external
    // would otherwise measure them nowhere.
    //
    // Shared on purpose. A DOM-backed collection is what every transient composite
    // needs — `select`, `listbox`, `combobox`, `tree` and `menubar` all read their
    // items from the document rather than from a registry the consumer maintains —
    // and the container filter is the half a bare `querySelectorAll` cannot do
    // once one collection nests inside another.
    name: "dom collection",
    entries: ["collection/dom-collection.js"],
    limit: KB,
    external: ["../*"],
    note: "two consumers now (menu, select) — budgeted so it cannot hide",
  },
  {
    // The pointer-intent geometry: the rule that keeps a submenu open while the
    // pointer cuts diagonally towards it. Four numbers and no DOM, so it is
    // testable on its own — and `navigation-menu`, `select` and `combobox` all
    // cascade the same way.
    name: "safe triangle",
    entries: ["interaction/safe-triangle.js"],
    limit: KB,
    external: ["../*"],
    note: "one consumer today (menu) — budgeted so it cannot hide",
  },
  {
    // Eighth application of the 2026-08-28 rule, and this one was split for the
    // budget as much as for the reuse: `menu` was at 98 % of its own line and the
    // CDC §5.1 clause of 2026-09-02 says the next reading goes down or the class is
    // re-argued. Moving the scroll affordance out is what pays that clause — and it
    // only counts because the module lands here, where it is measured, rather than
    // inside a line that marks `../../*` external and would have made it free.
    //
    // Shared on purpose rather than merely moved: `data-scroll` is the one fact a
    // sheet cannot work out for itself, and every scroller the library has left to
    // write needs it — `select`, `listbox`, `combobox` and `toast` all cap
    // themselves against the viewport the same way `menu` does.
    // 2026-11-14: `turnWheelInline` exported for the thumb of the inline scrollbar
    // measured 1.00 kB (1 027 B, over 1 024); raised to 1.25 — R138.
    name: "scroll edges",
    entries: ["interaction/scroll-edges.js"],
    limit: 1.25 * KB,
    external: ["../*"],
    note: "two consumers now (menu, select) — budgeted so it cannot hide",
  },
  {
    // Measured 0.31 kB (321 B) on 2026-11-14 (R138); 0.5 is the quarter above.
    name: "scroll thumb",
    entries: ["interaction/scroll-thumb.js"],
    limit: 0.5 * KB,
    external: ["../*"],
    note: "the thumb arithmetic of scroll-area and of the inline scrollbar — R138",
  },
  {
    // Measured 0.86 kB (881 B) on 2026-11-14 (R138), with `drag-axis`, `scroll-edges`
    // and `scroll-thumb` external because each has a line of its own; bundled with
    // them it weighs 2 074 B. 1 is the quarter above.
    name: "inline scrollbar",
    entries: ["interaction/inline-scrollbar.js"],
    limit: KB,
    external: ["../*", "./drag-axis*", "./scroll-edges*", "./scroll-thumb*"],
    note: "the drawn bar of toggle-group and tabs — R138",
  },
  {
    // Ninth application of the 2026-08-28 rule, and the reason is the one every
    // line above it gives: `components/accordion` marks `../../*` external, so a
    // module left inside it would be measured nowhere at all. One consumer today
    // — `collapsible` measures in its own machine — and `tree-view` (Phase 7)
    // will be the second.
    name: "collapse choreography",
    entries: ["interaction/collapse.js"],
    limit: KB,
    external: ["../*"],
    note: "one consumer today (accordion) — budgeted so it cannot hide",
  },
  {
    // RATIFIED by the CDC §5.1 amendment of 2026-09-01, which adds a "composant
    // composite à panneaux" class at 4 kB and names `tabs` in it. The CDC named
    // `tabs` in the 3 kB "composant simple" row before it was written; measured
    // 3.57 kB the day it landed and 3.73 kB once the audits' three defects were
    // fixed (the tab stop on a controlled `null`, Space on keyup, the indicator's
    // resize observers re-armed) — and the ladder out was walked before the
    // ceiling was touched.
    //
    // The split was played first and does not reach. The indicator geometry did
    // move to `utils/indicator-rect` (the 2026-08-28 rule — a shared layer with a
    // single consumer carries its own line, above): 3.73 → 3.57 kB, worth 0.16 on
    // the day it was measured.
    // The spec's next two escapes were then measured by *deleting* them: with
    // neither the closable path nor the intent capture, `tabs` is 8.96 kB min /
    // 3.23 kB gzip — still over 3, and short of two reference-app parity acceptance
    // criteria (CDC §4.5). Cutting leaves the component incomplete *and* over
    // budget, which is the slider's finding of 2026-08-30, word for word.
    //
    // Why 3 kB was never reachable, measured rather than argued: machine 6.75 kB
    // min, connect 3.63, dom 1.14, anatomy 0.18 — against 3.43 / 2.34 for
    // `toggle-group`, the nearest composite, whose whole line is 5.72 / 2.27. The
    // factor of two on the machine is not fat: `tabs` drives **two collections**,
    // its triggers and its panels, where every component in the simple class
    // drives one, and it carries four subsystems none of them has (measured
    // indicator, lazy mount plus the panel's tabbability probe, the closable path,
    // the LB/RB intent capture).
    // 2026-11-14: the scrollbar and thumb parts and the `trackScrollbar` effect measured
    // 4.12 kB (4 216 B); raised to 4.25, an amendment of the 4 kB class ceiling — R138,
    // decision 81.
    name: "tabs",
    entries: ["components/tabs/index.js"],
    limit: 4.25 * KB,
    external: ["../../*"],
    note: "CDC §5.1 « composite à panneaux » — see the 2026-09-01 amendment",
  },
  {
    name: "field",
    entries: ["components/field/index.js"],
    limit: 2 * KB,
    external: ["../../*"],
    note: "the a11y hub every form control wires into",
  },
  {
    name: "input",
    entries: ["components/input/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "text, multi-line and password from one machine",
  },
  {
    name: "radio-group",
    entries: ["components/radio-group/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "progress",
    entries: ["components/progress/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "checkbox",
    entries: ["components/checkbox/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "checkbox-group",
    entries: ["components/checkbox-group/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "the array value and the tri-state summary — the boxes are checkboxes",
  },
  {
    name: "switch",
    entries: ["components/switch/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // RATIFIED by the CDC §5.1 amendment of 2026-08-30, which adds a "composant à
    // valeur continue" class at 5 kB and names the slider in it. Measured 4.64 kB
    // the day it was ratified; a lone consumer really pays 5.48 kB, this line plus
    // `range arithmetic`, and that total is recorded in the amendment.
    //
    // Why 3 kB was never reachable, measured rather than argued: the machine is
    // 54 % of the component and the switch's is 2.6× smaller, because a slider
    // carries two subsystems nothing else has yet — the pointer path (capture,
    // drag threshold, click swallowing, per-move rect reads) and engage mode.
    // Unlike an overlay it amortises almost nothing: dialog fits 2.89 kB because
    // focus-trap, dismissable, layer-stack, scroll-lock and aria-hidden are all
    // shared and external. Cutting the three features the spec nominated
    // (`thumbAlignment: "center"`, `getValueText`, the non-array `marks` shapes)
    // buys ~0.13 kB — it would leave the component incomplete *and* over budget.
    name: "slider",
    entries: ["components/slider/index.js"],
    limit: 5 * KB,
    external: ["../../*"],
    note: "CDC §5.1 « composant à valeur continue » — see the 2026-08-30 amendment",
  },
  {
    // Measured 3.92 kB gzipped on 2026-11-10, after the review fixes (the first cut
    // fitted 3.75); 4 is the quarter above. Measured 4.05 on 2026-11-11 (R108: a
    // remounted handle is rebound); 4.25 is the quarter above.
    name: "splitter",
    entries: ["components/splitter/index.js"],
    limit: 4.25 * KB,
    external: ["../../*"],
    note: "component only — the engine and the drag axis are external",
  },
  {
    // Measured 3.37 kB gzipped on 2026-11-11 (J7a); 3.5 is the quarter above.
    // 2026-11-11: the review fixes (the focus held by the viewport, the scroll sent once
    // per frame, the bar as the drag surface, the hide delay restarted on leave) measured
    // 3.70 kB; raised to 3.75. The second review (the window blur, the lingering state)
    // measured 3.79 kB; raised to 4. R115 and R116 (bars rebound, first tab stop,
    // class and style observed) measured 4.03 kB; raised to 4.25.
    name: "scroll-area",
    entries: ["components/scroll-area/index.js"],
    limit: 4.25 * KB,
    external: ["../../*"],
    note: "component only — the engine, the drag axis and the observers are external",
  },
  {
    name: "dialog",
    entries: ["components/dialog/index.js"],
    // CDC §5.1 allows an overlay 6 kB. The line is set at 4 because everything
    // heavy — focus-trap, dismissable, layer-stack, scroll-lock, aria-hidden,
    // environment — lives in the root and is shared with popover, menu and
    // tooltip. Past 4 kB something that should have stayed shared got inlined.
    limit: 4 * KB,
    external: ["../../*"],
    note: "overlay — the primitives are shared, only the wiring is here",
  },
  {
    // **Not an overlay line, and the class matters more than the number.** The
    // drawer carries none of the five subsystems that define the overlay class —
    // no trap, no dismissable, no layer, no scroll lock, no aria-hidden. In the
    // CDC's own words it is a « composant à valeur continue » (≤ 5 kB, amendment of
    // 2026-08-30), whose argument names exactly what this pays for: "the pointer
    // path and the engage mode". That its track is discrete does not change the
    // shape of the cost.
    //
    // Set well under the class for the reason `dialog` is set under its own: the
    // two expensive halves — the gesture and the settle — are external and carry
    // their own lines. Past this, something that should have stayed shared was
    // inlined.
    //
    // Measured **4.68 kB**, against the **3 kB** the spec of 2026-09-10 proposed by
    // analogy with the dialog's line. The class holds — 4.68 is inside the 5 the
    // amendment allows — but the sub-ceiling was 36 % low, and it is worth saying
    // where the difference went rather than quietly writing a bigger number: the
    // detent arithmetic (resolve, clamp, dedupe, snap, nearest) is real code that
    // the dialog has no equivalent of, the release table is three branches with
    // their own thresholds, and `growSign` exists because the intents are physical.
    // None of it is fat and none of it is shared with anything yet.
    //
    // **4.75 → 5.00 on 2026-09-11, and the 0.08 kB bought two defects.** The first
    // browser test this component ever had found that the pointer drag could not
    // complete at all: `trackDragInput` was an effect of `idle`, `dragging` *and*
    // `engaged`, and the interpreter recycles every effect of a state it leaves
    // (`service.ts:263`), so the first move past the threshold destroyed the
    // listener holding the captured pointer. The gesture is now a context flag and
    // never leaves `idle`, which is the shape `slider` already had. The second is
    // `dragSign`: `drag-axis` reports travel along an axis and this machine reads
    // positive as "toward closed", and those only agree where the sheet is anchored
    // at the end of its axis — `top` and `start` grew when the finger pushed them
    // away. Both were invisible to a suite of 37 node cases, because neither is
    // reachable without a real pointer.
    //
    // The ceiling now sits *on* the class rather than under it, which is a
    // statement and not a rounding: the two expensive halves are still external,
    // and what filled the gap is the correctness the sub-ceiling was quietly
    // pricing out. The class itself (≤ 5 kB, "composant à valeur continue") is
    // untouched, so no amendment is owed for it — only for this line.
    name: "drawer",
    entries: ["components/drawer/index.js"],
    // measured 4.76, was 4.68 before the two fixes.
    // 2026-09-15: 4.55 — the `"content"` detent, its resize observer, its event and
    // its context slot came out (C29). No ceiling moved; a removal only lowers.
    limit: 5 * KB,
    external: ["../../*"],
    note: "a continuous-value component that happens to snap — pointer path and engage, both external",
  },
  {
    name: "popover",
    entries: ["components/popover/index.js"],
    // Same 4 kB as the dialog, and for the same reason: CDC §5.1 allows an
    // overlay 6, and everything heavy — focus-trap, dismissable, layer-stack,
    // scroll-lock, aria-hidden, environment — is shared and external. The one
    // thing this line carries that the dialog's does not is the positioner call,
    // and the positioner has a budget of its own right above.
    limit: 4 * KB,
    external: ["../../*"],
    note: "overlay — the primitives are shared, only the wiring is here",
  },
  {
    // The CDC's « composant à overlay **et** collection » class, ≤ 8 kB
    // (§5.1, amendment 2026-09-02). `menu` was named in the 6 kB overlay row
    // before it was written, the way `tabs` was named in the simple-component
    // row, and it does not fit: measured **7.74 kB** min+gzip — 7.41 at first
    // delivery, plus the 0.33 the six audit fixes and the symbol gutter cost, and
    // it is the corrected component that gets budgeted because it is the one that
    // ships. The line split
    // was written into the CDC first and this line follows it — a green ceiling
    // in CI *is* a ratification, and the `slider` amendment condemns making it
    // here. The clause stands on the measured number: the next reading either
    // goes down or the class is re-argued, and 8 is the class ceiling rather
    // than this component's, so `select` and `listbox` land on it too.
    //
    // The ladder was walked before the ceiling was touched, which is the order
    // `tabs` and `slider` set:
    //  - nothing shared was rewritten. roving-focus, typeahead, long-press,
    //    dismissable, layer-stack, proxy-tab-focus, aria-hidden, scroll-lock, the
    //    positioner and the environment are all external to this line already.
    //  - two more primitives were *split out* rather than kept private —
    //    `collection/dom-collection` and `interaction/safe-triangle`, budgeted
    //    above. That bought 0.31 kB, which is the honest size of the win.
    //  - the split the spec nominated (`trackSelectionFlash` and
    //    `trackPointerIntent` as opt-in modules) is worth ~0.9 kB by measurement
    //    and would land at 6.4 — still over, and it would cost the menu its
    //    hover-opened submenus. It buys an incomplete component *and* an
    //    over-budget one, which is exactly the arbitrage `slider` refused.
    //
    // What is left is the component itself, and the reason it is the largest
    // overlay in the library is structural rather than fat: `menu` is the first
    // component that is an overlay **and** a collection. It carries the popover's
    // whole surface wiring (dismissable, positioner, scroll lock, intent scope,
    // focus restore, sheet re-entry) *plus* a roving collection read from the DOM,
    // a typeahead, a two-way parent/child protocol with its own timers, and the
    // selection blink. Measured against the popover's 3.81 kB the delta is
    // 3.5 kB for those four subsystems.
    // **2026-09-02, second reading: 7.91 kB — up, not down, and the clause above
    // is not honoured.** It has to be said here rather than quietly, because the
    // saving that was supposed to pay it never existed. The audit costed the scroll
    // affordance as "split `interaction/scroll-edges` out and `menu` falls to
    // 7.96", on the premise that the module would be carved out of this line. It
    // never was in it: `../../*` is external here, so `interaction/*` was already
    // free, and a module that was never inside cannot be taken out. What this line
    // really paid for the affordance is the import, the effect and its name in two
    // unions — 0.03 kB, for the only indication a capped menu has that there is
    // more of it.
    //
    // Left at 8 rather than raised, and left green rather than made green: the
    // ladder's remaining rung is an accounting move (splitting `menu.keys` onto its
    // own line, ~0.13 kB) which would take the number down without a consumer
    // paying a byte less, and this file exists to refuse exactly that. The class is
    // owed a real re-argument before `select` and `listbox` land on it.
    //
    // 2026-11-01: raised to 8.25 for this line alone (decision 73). R61 routes the
    // focus restore through `restoreFocus`, so a trigger disabled while open hands
    // the focus to its neighbour rather than `body`; the call measured 8.01. The
    // class ceiling stays at 8 for `select` and `listbox`.
    name: "menu",
    entries: ["components/menu/index.js"],
    limit: 8.25 * KB, // measured 8.01
    external: ["../../*"],
    note: "overlay AND collection — the class ceiling, shared with select and listbox",
  },
  {
    name: "tooltip",
    entries: ["components/tooltip/index.js"],
    // A quarter under the dialog's and the popover's 4, and the gap is the
    // statement: a tooltip shares the same external primitives but uses fewer of
    // them — no focus trap, no tab proxy, no scroll lock, no aria-hidden, no
    // sheet, no arrow. What it adds instead is the delay and the page-wide
    // store, and both are small.
    //
    // The line was written at 2 kB before anything was built and the component
    // measured 2.41 — the guess was wrong, not the component. Raised to the
    // round number of the "component only" class rather than to 2.5, which would
    // have left 0.09 kB and broken on the first sentence added to a comment.
    limit: 3 * KB,
    external: ["../../*"],
    note: "overlay — no trap, no lock, no sheet; the delay and the store are the extra",
  },
  {
    name: "separator",
    entries: ["components/separator/index.js"],
    limit: 1 * KB,
    external: ["../../*"],
    note: "no machine at all — a prop getter and an anatomy",
  },
  {
    name: "badge",
    entries: ["components/badge/index.js"],
    limit: 1 * KB,
    external: ["../../*"],
    note: "no machine at all — a prop getter and an anatomy",
  },
  {
    name: "card",
    entries: ["components/card/index.js"],
    limit: 1 * KB,
    external: ["../../*"],
    note: "no machine — an anatomy and seven prop getters",
  },
  {
    name: "list",
    entries: ["components/list/index.js"],
    limit: 0.5 * KB, // measured 0.40
    external: ["../../*"],
    note: "no machine — an anatomy and eleven prop getters",
  },
  {
    name: "sidebar",
    entries: ["components/sidebar/index.js"],
    limit: 0.75 * KB, // measured 0.65
    external: ["../../*"],
    note: "no machine — an anatomy and sixteen prop getters",
  },
  {
    name: "pagination",
    entries: ["components/pagination/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // The menu's "overlay AND collection" class (CDC §5.1, 2026-09-02): the same
    // surface over the same dom-collection, with a trigger. Expected well under
    // the ceiling — no submenu tree, no safe-triangle, no long-press — plus the
    // form mirror no other overlay carries. If the measurement crosses 8, the
    // class gets re-argued as the menu's line promised; it does not get split.
    name: "select",
    entries: ["components/select/index.js"],
    limit: 8 * KB,
    external: ["../../*"],
    note: "overlay AND collection — the menu's class; the form mirror is the extra",
  },
  {
    name: "meter",
    entries: ["components/meter/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "empty-state",
    entries: ["components/empty-state/index.js"],
    limit: 1 * KB,
    external: ["../../*"],
    note: "no machine — the separator precedent, five getters instead of one",
  },
  {
    // A collection of headers, with no measured indicator, no intent capture and
    // no closable path: nearer `toggle-group` than `tabs`. The height
    // choreography is not on this line — `interaction/collapse` carries its own,
    // because `../../*` is external here and would have measured it nowhere.
    name: "accordion",
    entries: ["components/accordion/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // A toggle and a measurement: no positioner, no trap, no collection. The
    // measurement is the machine's own, so unlike `accordion` this line carries
    // no shared choreography module beside it.
    name: "collapsible",
    entries: ["components/collapsible/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "toolbar",
    entries: ["components/toolbar/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // The collection class without the overlay: no positioner, no presence, no
    // dismiss layer. Budgeted in the 8 kB class the CDC names it in, and it is
    // expected to sit far under — which is itself an argument the class has to
    // answer, the one `menu` promised when `select` and `listbox` landed.
    name: "listbox",
    entries: ["components/listbox/index.js"],
    limit: 8 * KB,
    external: ["../../*"],
    note: "collection without an overlay — the class ceiling, and far under it",
  },
  {
    // RATIFIED by the CDC §5.1 amendment of 2026-09-05, which adds a "surface
    // pilotée par une file" class at 6 kB and names `toast` in it. The 5 kB this
    // line carried was written before the store existed, and its own note gave the
    // game away: "overlay plus a page-wide store — the queue and the timers are
    // the extra". A note that lists what a component carries *on top of* its class
    // is describing a class, not a margin. Measured 5.38 kB, 108 % of the 5.
    //
    // Why 5 was never reachable, measured rather than argued: machine 3.00 kB
    // min+gzip, store 1.41, connect 1.14, dom 0.39, anatomy 0.17 — against
    // 2.79 / 1.02 / 0.47 / 0.18 for `popover`, the nearest overlay, whose whole
    // line is 3.87. The delta is 1.51 kB and the store is 1.41 of it: the queue
    // *is* the gap, and there is no fat beside it. What no other overlay carries
    // is the page-wide imperative store (`createToaster()` outlives the region and
    // has no trigger, where dialog, popover, menu and tooltip are all opened by an
    // element inside their own anatomy), the queue with a `max`, the per-toast
    // clock with an honest pause/resume, and the stacking arithmetic — this is the
    // only surface in the library that holds several of itself at once.
    //
    // The ladder was walked before the ceiling moved, in the order `slider`,
    // `tabs` and `menu` set, and it returns nothing. Everything shareable is
    // already external to this line — live-announcer, dom/event, dom/observers,
    // dom/query, roving-focus (`getRemovalIndex` included), tabbable,
    // scroll-edges, invariant. And there is no primitive left to split out: the
    // store is what a toaster *is* rather than a layer under it, and a
    // lone-consumer module would pay two gzip dictionaries for the same bytes —
    // the measured `utils/range` lesson of 2026-08-30, +0.37 kB.
    //
    // 6 is the round number immediately above 5.38 (as 5 was for `slider`'s 4.64,
    // 4 for `tabs`' 3.73, 8 for `menu`'s 7.74), and it is what the CDC's overlay
    // row already allowed: no ceiling in that table moves. `dialog`, `popover` and
    // `tooltip` keep their 4, 4 and 3 and get no margin from this.
    name: "toast",
    entries: ["components/toast/index.js"],
    limit: 6 * KB,
    external: ["../../*"],
    note: "CDC §5.1 « surface pilotée par une file » — see the 2026-09-05 amendment",
  },
  {
    name: "avatar",
    entries: ["components/avatar/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "breadcrumb",
    entries: ["components/breadcrumb/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "link",
    entries: ["components/link/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    name: "clipboard",
    entries: ["components/clipboard/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // The `input` machine plus a scope of its own: the clear trigger, the
    // magnifier and the hotkey, not a second field.
    name: "search-field",
    entries: ["components/search-field/index.js"],
    limit: 3 * KB,
    external: ["../../*"],
    note: "component only — the engine is external",
  },
  {
    // A class the CDC does not have a row for: a **two-dimensional collection with
    // no overlay**. Three views on one grid, the month computed rather than read
    // from the DOM, and none of the eight effects a surface installs. `data-grid`
    // and the virtual keyboard land on this same class later.
    //
    // `calendar.page.js` is a sibling module and is therefore *inside* this line,
    // which is the point — it is the component's own arithmetic, shared between
    // its machine and its connect, not a shared layer. `plain-date` and
    // `date-format` are `../../*` and carry their own lines above.
    name: "calendar",
    entries: ["components/calendar/index.js"],
    limit: 5.5 * KB, // measured 5.31 (5436 B)
    external: ["../../*"],
    note: "new class: two-dimensional collection, no overlay",
  },
  {
    // Read as "a value with no pointer path" this is the 3 kB simple-component
    // class. What it really carries is named rather than trimmed: a segment
    // builder over `Intl.DateTimeFormat.formatToParts`, per-unit bounds and wrap
    // arithmetic, a two-digit type-ahead buffer, and the time half — hour, minute,
    // second and day period — which is the whole of `time-field` on this machine
    // and not a second component later.
    //
    // Splitting `date-field.segments.ts` onto its own line was considered and
    // refused: it has exactly one consumer today, and this file has the measured
    // cost of that shape — `utils/range` charged +0.37 kB for a lone consumer.
    // Revisit when `date-picker` actually reads it.
    name: "date-field",
    entries: ["components/date-field/index.js"],
    // Was 5.25 (measured 5.14, 5265 B) until 2026-09-06, when two clauses stopped
    // being promises: a granularity that grows now asks the placeholder for the
    // clock units it has just gained (CDC §5.2), and `label` gives the segment
    // group a name it simply could not have outside a `field`. Measured 5.294
    // (5421 B) — the quarter above a measurement is the ratified rule.
    limit: 5.5 * KB, // measured 5.294 (5421 B)
    external: ["../../*"],
    note: "a value composed unit by unit, plus the whole of `time-field`",
  },
  {
    // The overlay class read down to the dialog's and the popover's 4 kB, for their
    // reason: everything heavy is shared and external. Its *collection* is the
    // calendar, which is external too — the picker's core imports neither of its
    // two children, it publishes `getCalendarProps()` and `getFieldProps()` and
    // the adapter spreads them.
    name: "date-picker",
    entries: ["components/date-picker/index.js"],
    // Was 4.25 (measured 4.24, 4343 B) until 2026-09-06, when `isModal` gathered
    // the four consequences of modality into one computed and the line landed on
    // 4.252 (4354 B) — two bytes over. The quarter above a measurement is the
    // ratified rule, and the alternative would be to shave code written to stop
    // being wrong (CDC §5.1, the same call as `dialog composed` 0.50 → 0.75).
    // Raised again on 2026-09-06: the picker now carries the two dev warnings its
    // siblings have always had — a trigger and a close-trigger that name nothing —
    // and their two message strings are unique in this bundle, so they gzip badly;
    // the reentry also learned to ask whether a focus move is a real one. Measured
    // 4.543 (4652 B).
    //
    // **That lever has been pulled** (2026-09-11). `hasAccessibleName` was verbatim
    // in `dialog`, `menu`, `popover` and this one; it now lives in
    // `a11y/accessible-name`, which `../../*` makes external to all four. This line
    // went 4.543 → 4.53 and `menu` 8.01 → 7.98 — the two that mattered, because
    // both were standing on their ceiling. There is no second lever of this shape
    // left in this neighbourhood: the next squeeze here is a feature or a raise.
    limit: 4.75 * KB, // measured 4.53, was 4.543 before the hoist
    external: ["../../*"],
    note: "overlay — its two children are driven by props, never imported",
  },
  {
    // The first component that is an overlay, a collection **and** a
    // two-dimensional control at once: a saturation/brightness area, up to four
    // channel sliders, a swatch grid and a format select. The escalation ladder
    // §12.2 pre-engaged is climbed to its third rung — `utils/color` and
    // `collection/grid-collection` have their own lines above, and the eyedropper
    // is the opt-in sub-path on the line below (2026-09-26, decision 34: split
    // rather than raise).
    name: "color-picker",
    entries: ["components/color-picker/index.js"],
    // Raised 11.50 → 11.75 on 2026-09-05: the channel-label guard went from a global
    // boolean to the **set** of channels a label was actually rendered for, which is
    // what stopped the hex field coming out with a dangling `aria-labelledby` and no
    // accessible name. 11728 → 11787 B, so 11.511 kB, and the ceiling is the quarter
    // above it.
    //
    // The measurement has moved twice since and this comment did not follow —
    // CDC §5.1 records 11 909 B and then 11 897 B (11.618). Adding `hasValueText`
    // takes it to 11.67, which leaves about 80 bytes. The ceiling is unchanged and
    // still respected; the number below is now the one `check:size` prints, and it
    // is to be re-read here whenever the CDC is amended rather than left to drift.
    // R23 and R24 (2026-09-23) — the inline panel's `group` role, the area's
    // `aria-readonly`, and `modal` ignored inline — took it to 11 971 B. R32
    // (2026-09-26) — a controlled hue of 360 held apart until the parent's string
    // is the one sent, handed back or already held — took it to 12 008 B. R33
    // (2026-09-26) — the end of a gesture reporting the colour the gesture wrote,
    // not the string the parent still held. Its first form alone measured
    // 12 044 B; the delivered form measures 12 030 B with six spellings that
    // emitted code for nothing removed, each worth 1 to 8 B when removed alone
    // from its own arm. Sharing the guards' duplicated `disabled`/`readOnly` test
    // cost 9 to 17 B more, not less. Moving the marker from the emitted change to
    // the attempted write cost 5 B on the second form: a write equal to the
    // parent's held colour is swallowed before it emits, and B reported the step
    // it had just cancelled. The clear at open and at every engage stays, which
    // covers a hold the surface closed on only once the picker opens or engages
    // again; the one on a form reset (4 B) did not fit, so a write left without
    // a report — a refused reset, an accepted draft, a hold or press the surface
    // closed on — is reported by the next gesture that writes nothing (R38).
    // The third rung (2026-09-26): the screen picker left for its own sub-path,
    // and the machine keeps two one-line delegations and a guard on the prop.
    // 12 030 → 11 819 B, 211 B back, with the ceiling left where it was.
    // R34, R35 and R38 (2026-10-11), read at 11 854 B on main: an accepted draft
    // reports, the screen pick names the colour it wrote, and the marker is cleared
    // by a reset, by a Cancel with nothing to restore and by the surface closing.
    // 11 854 → 11 894 B, one rebuild per arm.
    // R37 (2026-11-01): a report equal to the held colour hands back the parent's
    // own string instead of a formatted one, provided that string parses (one the
    // picker cannot read, or a stale one, is not a colour held) and the report is
    // the cell's own colour, which carries the hue a grey or a black cannot spell.
    // Raised 11.75 → 12.00: 12 023 B on main, 12 046 B for the bare equality guard,
    // 12 047 B with the parse check; one rebuild per arm. A shorter spelling of the
    // bare guard weighed the same.
    // R40 (2026-11-01): the `eyedropper` prop is read again when it changes, so a
    // module removed after the mount takes its part, its tab stop and a pick in
    // flight with it, and one that arrives is detected. 12 047 → 12 125 B under the
    // same ceiling; withdrawing the part alone (a guard on the prop in `connect`)
    // weighed 12 055 B and left a module added later unseen. The review of the PR
    // asked for one slot holding the current module's disposer (run on every change
    // and on stop), a write from a module that is no longer the prop dropped, and
    // the panel as the fallback for the focus: 12 125 → 12 223 B.
    limit: 12.0 * KB, // measured 11.94 (12 223 B) — 65 B of headroom
    external: ["../../*"],
    note: "overlay AND collection AND a two-dimensional control",
  },
  {
    // Opt-in subpath, the third rung of the `color-picker` ladder above and the
    // split decision 34 prescribes instead of a raised ceiling: a picker that is
    // never handed `eyedropper` downloads none of it. It imports nothing but types
    // from the core, so the external below has nothing to keep out — the whole
    // line is the detection, the pick and its abort.
    //
    // Measured 404 B (0.39 kB) on its own. Bundled with the picker it adds 237 B
    // (11 819 → 12 056 B), 26 B more than the 12 030 B the two weighed as one
    // module: the object, the two delegations and the guard are the price of the
    // door. 0.5 is the round quarter above it.
    name: "color-picker eyedropper (opt-in)",
    entries: ["components/color-picker/eyedropper.js"],
    limit: 0.5 * KB, // measured 0.39 (404 B)
    external: ["../../*"],
    note: "opt-in @standarui/core/color-picker/eyedropper — detect, pick, abort",
  },
];

interface Measurement {
  readonly budget: Budget;
  readonly minified: number;
  readonly gzipped: number;
}

const scratchFiles: string[] = [];

async function bundle(budget: Budget, source: string): Promise<Measurement> {
  const dist = distOf(budget);
  const missing = budget.entries.filter((entry) => !existsSync(path.join(dist, entry)));
  if (missing.length > 0) {
    throw new Error(
      `${budget.name}: missing built entry ${missing.join(", ")} — run \`bun run build\``,
    );
  }

  // A synthetic entry so several modules are measured as one payload. It sits at
  // the root of dist on purpose: written anywhere else, its own climb out of a
  // temp directory would itself match the `../../*` patterns meant for the shared
  // layers, and the component under measurement would vanish from its own bundle.
  // dist is gitignored, and the file is removed either way.
  const entryFile = path.join(dist, `__size-${budget.name.replace(/\W+/g, "-")}.js`);
  scratchFiles.push(entryFile);
  writeFileSync(entryFile, source);

  const built = await Bun.build({
    entrypoints: [entryFile],
    target: "browser",
    minify: true,
    splitting: false,
    external: [...NAV_EXTERNAL, ...(budget.external ?? [])],
  });
  if (!built.success) {
    throw new AggregateError(built.logs, `${budget.name}: bundling failed`);
  }

  let minified = 0;
  const chunks: Uint8Array[] = [];
  for (const output of built.outputs) {
    const code = await output.text();
    minified += code.length;
    chunks.push(Buffer.from(code));
  }
  return { budget, minified, gzipped: Bun.gzipSync(Buffer.concat(chunks)).length };
}

function measure(budget: Budget): Promise<Measurement> {
  return bundle(budget, budget.entries.map((entry) => `export * from "./${entry}";`).join("\n"));
}

/**
 * The one aggregate this file allows, and it is the CDC's own. §5.1 declares a
 * *« Date picker (plafond absolu) ≤ 15 kB »* over a whole family, and until today
 * nothing checked it: the loop measures each budget in isolation, which is right
 * for every other line and blind to this one.
 *
 * It does not contradict the refusal of aggregate lines below. That refusal is
 * about charging every consumer for every component; this measures **one
 * consumer's real payload** — someone who renders a date picker with its two
 * children — and it does it the only way that answers the question: **one
 * bundle**, not the sum of five.
 *
 * The distinction is worth 1.94 kB and it decides whether the CDC line holds. The
 * arithmetic sum of the five lines reads **16.36 kB** and would fail; the family
 * built as one payload reads **14.42 kB** and passes, because five separately
 * gzipped bundles carry five dictionaries and a consumer downloads one. The same
 * effect is documented on the composed lines above, in the other direction.
 *
 * `import * as` and a sink rather than `export * from`, and this is load-bearing:
 * `calendar`, `date-picker` and `plain-date` all export `toISO`, `fromISO`,
 * `fromParts` and `DateValue`, and an **ambiguous star export is excluded** by ES
 * semantics — so the re-export form drops those names, the code behind them
 * becomes unreachable, and the whole family measures **3.24 kB**. A green line
 * that weighs nothing reads as proof; this is the third time that failure mode is
 * written down in this file, so it is named here rather than discovered again.
 */
const families: readonly Budget[] = [
  {
    // Was 15 kB, the CDC §5.1 absolute ceiling, until 2026-11-01: R64 put the
    // chosen date into the trigger's accessible name and the family measured
    // 15 383 B, 23 B over. The owner amended the ceiling to 15.25 kB, the
    // quarter above (decision 72).
    name: "family: date",
    entries: [
      "components/calendar/index.js",
      "components/date-field/index.js",
      "components/date-picker/index.js",
      "utils/plain-date.js",
      "utils/date-format.js",
    ],
    limit: 15.25 * KB, // measured 15 383 B
    external: ["../../*"],
    note: "CDC §5.1 « Date picker (plafond absolu) » — the whole family as one payload",
  },
  {
    // The second aggregate, and it exists for a reason the date family did not
    // have: **the drawer's four lines are a montage**. A sheet with detents is a
    // dialog plus a decorator plus a gesture plus a settle, and someone reading
    // four ceilings that add to a number nobody measured would either panic or
    // shrug — the arithmetic sum of separately gzipped bundles overstates a single
    // payload, as the date family's 16.36 against 14.42 already showed.
    //
    // What a real consumer downloads to render one draggable sheet, in one bundle.
    // No CDC row declared a family ceiling here, so this is an amendment rather
    // than a box to tick, and the number below was read rather than chosen.
    //
    // Measured **8.21 kB**. The spec proposed a 10 kB amendment while saying the
    // real figure would land "well under 9.5" — right about the direction, and the
    // arithmetic sum of the four ceilings (4 + 4.75 + 1 + 0.75 = 10.5) overstates
    // this by 2.29 kB, which is the whole reason the line exists.
    //
    // **8.25 → 8.50 on 2026-09-11**, carrying the same 0.08 kB the `drawer` line
    // above explains — the family is that bundle plus the dialog, so the two move
    // together. The arithmetic sum of the four ceilings is now 10.75 and this reads
    // 8.26: the 2.49 kB gap is still the whole reason the line exists.
    name: "family: drawer",
    entries: [
      "components/dialog/index.js",
      "components/drawer/index.js",
      "interaction/drag-axis.js",
      "gesture/settle.js",
    ],
    // measured 8.26, was 8.21 before the two fixes.
    // 2026-09-15: 8.07, same removal as the `drawer` line above (C29).
    limit: 8.5 * KB,
    external: ["../../*"],
    note: "one draggable sheet as one payload — dialog, decorator, gesture, settle",
  },
];

function measureFamily(budget: Budget): Promise<Measurement> {
  const imports = budget.entries
    .map((entry, index) => `import * as m${index} from "./${entry}";`)
    .join("\n");
  const sink = budget.entries.map((_, index) => `m${index}`).join(", ");
  return bundle(budget, `${imports}\nexport const keep = [${sink}];\n`);
}

function format(bytes: number): string {
  return `${(bytes / KB).toFixed(2)} kB`;
}

const failures: string[] = [];

try {
  const results: Measurement[] = [];
  for (const budget of budgets) results.push(await measure(budget));
  for (const family of families) results.push(await measureFamily(family));

  const width = Math.max(...results.map((result) => result.budget.name.length));
  console.log(`${"export".padEnd(width)}        min  min+gzip    budget   used`);
  for (const { budget, minified, gzipped } of results) {
    const { limit } = budget;
    const share =
      limit === null ? "   —" : `${String(Math.round((gzipped / limit) * 100)).padStart(3)}%`;
    const status = limit === null ? "UNCEILINGED" : gzipped <= limit ? "ok" : "OVER";
    const ceiling = limit === null ? "—" : format(limit);
    console.log(
      `${budget.name.padEnd(width)}   ${format(minified).padStart(8)}  ${format(gzipped).padStart(8)}  ${ceiling.padStart(8)}  ${share}  ${status}` +
        (budget.note === undefined ? "" : `  — ${budget.note}`),
    );
    if (limit === null) {
      failures.push(
        `${budget.name}: measured ${format(gzipped)} min+gzip and no ceiling declared — ` +
          `read the number, then write it in ${budget.ceiling ?? "this file's budget table"} ` +
          "and in the CDC §5.1 amendment of the same change",
      );
    } else if (gzipped > limit) {
      failures.push(`${budget.name}: ${format(gzipped)} over a ${format(limit)} budget`);
    }
  }
} finally {
  for (const file of scratchFiles) rmSync(file, { force: true });
}

if (failures.length > 0) {
  console.error(`\nsize checks failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log("\nall size budgets respected");
