/**
 * The breadcrumb machine is the APG Disclosure pattern folded inside the APG
 * Breadcrumb pattern (spec D-BC-1): intermediate levels marked `collapsed` are
 * `hidden`, one ellipsis button reveals them **in place** — the `nav > ol > li`
 * structure and the reading order never change, and no `menu` semantics are
 * introduced for site navigation. The overflow-menu presentation is a
 * composition (`EllipsisTrigger render={<Menu.Trigger/>}`), never a dependency:
 * `menu` is the 8 kB overlay-and-collection class, and embedding it here would
 * bill a menu to everyone who only wanted a trail of links.
 *
 * One state, and the data lives in context — the toggle doctrine: states model
 * interaction modes, never data. What earns this component a machine at all
 * (against the `separator` bar) is the bindable, the derived `aria-controls`
 * pair, and one genuinely stateful move: the ellipsis button disappears under
 * the very focus that activated it, and the focus has to be walked somewhere on
 * purpose (D-BC-4/D-BC-5).
 *
 * The focus move is played by the `watch` on `expanded`, which relies on the
 * hard rule that an adapter updates the DOM *before* running its watchers:
 * `hidden` is already off the revealed items when the action goes looking for
 * the first link. Where the focus goes depends on the modality *at the moment of
 * activation*: keyboard/gamepad land on the first revealed link (a legitimate
 * ring), pointer/touch land on the list (`tabindex="-1"`, no ring styled) — a
 * programmatic `focus()` matches `:focus-visible` on all three engines, so
 * focusing the link on a click would paint a ring nobody asked for.
 */

import {
  focusElement,
  getInputModality,
  isFocusVisibleModality,
  trackInputModality,
} from "@standarx/nav";
import { createMachine } from "../../machine/create-machine";
import type { Machine } from "../../machine/types";
import {
  getEllipsisTriggerEl,
  getFirstCollapsedLinkEl,
  getListEl,
  isActiveElementInCollapsedRun,
} from "./breadcrumb.dom";
import type { BreadcrumbSchema } from "./breadcrumb.types";

export const machine: Machine<BreadcrumbSchema> = createMachine<BreadcrumbSchema>({
  props({ props }) {
    return { label: "Breadcrumb", ellipsisLabel: "Show hidden items", ...props };
  },

  context({ prop, bindable }) {
    return {
      expanded: bindable<boolean>(() => ({
        defaultValue: prop("defaultExpanded") ?? false,
        value: prop("expanded"),
        onChange: (expanded) => prop("onExpandedChange")?.({ expanded }),
        debugLabel: "breadcrumb expanded",
      })),
    };
  },

  refs() {
    return { pendingFocus: null };
  },

  // Pure — SSR renders the same markup the first client render agrees with.
  initialState() {
    return "idle";
  },

  // Like toggle: the tracker has to be running before the first event, or the
  // modality read at the moment of the reveal would be a stale default.
  effects: ["trackModality"],

  // Played post-render by the adapter (the DOM-before-watch hard rule), so
  // `hidden` is already applied/removed when the action resolves its elements.
  watch({ context, track, action }) {
    track(
      () => [context.get("expanded")],
      () => action(["focusAfterExpandedChange"]),
    );
  },

  on: {
    // Guarded: a second activation while already expanded is a no-op, not a
    // second emission.
    "ELLIPSIS.CLICK": { guard: "!isExpanded", actions: ["markPendingReveal", "expand"] },
    "EXPANDED.SET": { actions: ["setExpanded"] },
  },

  states: {
    idle: {},
  },

  implementations: {
    guards: {
      isExpanded: ({ context }) => context.get("expanded"),
    },

    actions: {
      expand({ context }) {
        context.set("expanded", true);
      },

      markPendingReveal({ refs }) {
        refs.set("pendingFocus", "reveal");
      },

      setExpanded({ context, event, refs, scope }) {
        if (event.type !== "EXPANDED.SET") return;
        // Read synchronously BEFORE the render: after it, the browser has
        // already ejected the focus of a hidden item to `body`, and "it was
        // ours" is unrecoverable (D-BC-5).
        if (!event.expanded && context.get("expanded") && isActiveElementInCollapsedRun(scope)) {
          refs.set("pendingFocus", "rescue");
        }
        context.set("expanded", event.expanded);
      },

      focusAfterExpandedChange({ refs, scope }) {
        const pending = refs.get("pendingFocus");
        // A programmatic change owes nobody a focus move — steal nothing.
        if (pending === null) return;
        refs.set("pendingFocus", null);
        const list = getListEl(scope);
        const target =
          pending === "reveal"
            ? isFocusVisibleModality(getInputModality(scope.getDoc()))
              ? (getFirstCollapsedLinkEl(scope) ?? list)
              : list
            : (getEllipsisTriggerEl(scope) ?? list);
        focusElement(target);
      },
    },

    effects: {
      // No listener: the modality is read once, at the moment of the reveal.
      // Holding the handle is the whole job.
      trackModality({ scope }) {
        return trackInputModality(scope.getDoc());
      },
    },
  },
});
