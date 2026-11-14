/**
 * Pure, DOM-free, replayable on a server.
 *
 * Two decisions live here rather than in the machine. Disabled means the href is
 * *stripped*, not prevented: a prevented click can be reached around (middle
 * click, the context menu), an absent href cannot — the `preventDefault` in
 * `onClick` is only the belt over that strip, for a router composition whose own
 * `href`/`to` the connect cannot remove. And the keyboard listens to Enter
 * alone, never Space: on a link Space must keep scrolling the page, and
 * intercepting it would be an APG bug, not a feature.
 */

import { isFocusVisibleModality } from "@standarx/nav";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./link.anatomy";
import { getRootId } from "./link.dom";
import type { LinkApi, LinkSchema } from "./link.types";

export function connect<T extends PropTypes>(
  service: Service<LinkSchema>,
  normalize: NormalizeProps<T>,
): LinkApi<T> {
  const { context, prop, state, send, scope } = service;

  const disabled = prop("disabled");
  const external = prop("external");
  const nativeLink = prop("nativeLink");
  const current = prop("current");
  const focusableWhenDisabled = prop("focusableWhenDisabled");
  const pressed = context.get("pressed");
  // The source is read once, when focus lands, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = state.matches("focused") ? context.get("focusSource") : null;
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);

  // One spelling for both attributes, so the sheet can select `[data-current]`
  // as well as `[data-current="page"]`.
  const currentAttr = current === false ? undefined : current === true ? "true" : current;

  // A native link leaves the tab order through the stripped href; only the
  // disabled-but-reachable case needs a tab index at all. A substituted element
  // has no native tab order to lose, so it is handed one — and taken out of it
  // by hand while disabled.
  const tabIndex = nativeLink
    ? disabled && focusableWhenDisabled
      ? 0
      : undefined
    : disabled && !focusableWhenDisabled
      ? -1
      : 0;

  return {
    disabled,
    external,
    current,
    pressed,
    focusSource,
    focusVisible,

    getRootProps: (): T["a"] =>
      normalize.a({
        ...parts.root.attrs,
        id: getRootId(scope),
        dir: prop("dir"),
        href: disabled ? undefined : prop("href"),
        target: prop("target") ?? (external ? "_blank" : undefined),
        rel: prop("rel") ?? (external ? "noopener noreferrer" : undefined),
        // An `<a>` without an href has no link role left, and a substituted
        // element never had one.
        role: nativeLink && !disabled ? undefined : "link",
        tabIndex,
        "aria-disabled": ariaAttr(disabled),
        "aria-current": currentAttr,
        "data-variant": prop("variant"),
        "data-underline": prop("underline"),
        "data-external": dataAttr(external),
        "data-current": currentAttr,
        "data-disabled": dataAttr(disabled),
        "data-pressed": dataAttr(pressed),
        "data-focus-visible": dataAttr(focusVisible),
        "data-focus-source": focusSource ?? undefined,
        onClick(event) {
          if (event.defaultPrevented) return;
          if (disabled) {
            event.preventDefault();
            return;
          }
          send({ type: "ROOT.CLICK", originalEvent: event });
        },
        onKeyDown(event) {
          if (event.defaultPrevented || event.repeat || event.key !== "Enter") return;
          if (disabled) {
            event.preventDefault();
            return;
          }
          send({ type: "ROOT.PRESS_START" });
          // Only a substituted root, where Enter produces no native click —
          // on a real `<a>` the browser's own click arrives as ROOT.CLICK.
          if (!nativeLink) send({ type: "ROOT.PRESS", originalEvent: event });
        },
        onKeyUp(event) {
          if (event.defaultPrevented || event.key !== "Enter") return;
          send({ type: "ROOT.PRESS_END" });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.FOCUS" });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ROOT.BLUR" });
        },
      }),

    getExternalIconProps: (): T["element"] =>
      normalize.element({
        ...parts.externalIcon.attrs,
        "aria-hidden": ariaAttr(true),
        hidden: !external,
        "data-disabled": dataAttr(disabled),
      }),

    getExternalLabelProps: (): T["element"] =>
      normalize.element({
        ...parts.externalLabel.attrs,
        hidden: !external,
      }),
  };
}
