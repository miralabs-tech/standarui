import { visuallyHiddenStyle } from "../../a11y/visually-hidden";
import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { isFocusVisibleModality } from "../../nav";
import { parts } from "./radio-group.anatomy";
import { getItemId, getItemInputId, getLabelId, getRootId } from "./radio-group.dom";
import type { RadioGroupApi, RadioGroupSchema, RadioItemProps } from "./radio-group.types";

export function connect<T extends PropTypes>(
  service: Service<RadioGroupSchema>,
  normalize: NormalizeProps<T>,
): RadioGroupApi<T> {
  const { context, prop, send, scope } = service;

  const value = context.get("value");
  const groupDisabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  const orientation = prop("orientation");
  const focusedValue = context.get("focusedValue");
  // Read once, when focus lands on an item, and held: the modality of `now`
  // flips to pointer after 300ms of mouse movement whether or not the focus
  // moved, and a ring that blinks out under the user's hands was the result.
  const focusSource = context.get("focusSource");
  const indicatorOffset = context.get("indicatorOffset");
  const indicatorSize = context.get("indicatorSize");
  const focusVisible = focusSource !== null && isFocusVisibleModality(focusSource);
  // Unique by construction: two groups sharing a name are one group to the
  // browser, and the arrows would walk from one into the other.
  const name = prop("name") ?? getRootId(scope);
  // The focused radio, else the checked one, else the first enabled one (the
  // machine's header says why). `undefined` until the items are known: a
  // prerendered group keeps the browser's own order instead of leaving the tab
  // order altogether. A disabled group is decided here rather than from the DOM,
  // which may not have caught up with the prop yet.
  const enabledItems = context.get("enabledItems");
  const tabStop =
    enabledItems === null
      ? undefined
      : groupDisabled
        ? null
        : focusedValue !== null && enabledItems.includes(focusedValue)
          ? focusedValue
          : value !== null && enabledItems.includes(value)
            ? value
            : (enabledItems[0] ?? null);

  const isSelected = (item: string): boolean => value === item;

  const itemState = (itemProps: RadioItemProps) => {
    const selected = isSelected(itemProps.value);
    const disabled = groupDisabled || itemProps.disabled === true;
    const focused = focusedValue === itemProps.value;
    return {
      selected,
      disabled,
      attrs: {
        "data-state": selected ? "checked" : "unchecked",
        "data-disabled": dataAttr(disabled),
        "data-readonly": dataAttr(readOnly),
        "data-invalid": dataAttr(invalid),
        "data-focus-visible": dataAttr(focused && focusVisible),
        // On the focused item only: the group has one focus, and an attribute
        // claiming otherwise on every radio is not a description of anything.
        "data-focus-source": focused ? (focusSource ?? undefined) : undefined,
        "data-orientation": orientation,
      },
    };
  };

  return {
    value,
    disabled: groupDisabled,
    isSelected,

    setValue(next: string | null): void {
      if (next !== null) send({ type: "ITEM.SELECT", value: next });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        role: "radiogroup",
        dir: prop("dir"),
        // Only when it exists: the APG radio group pattern requires the container
        // to be named by `aria-labelledby` *or* `aria-label`, and a dangling
        // IDREF gives it neither.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        "aria-orientation": orientation,
        "aria-describedby": prop("describedBy"),
        "aria-invalid": ariaAttr(invalid),
        "aria-required": ariaAttr(prop("required")),
        // HTML has no read-only radio and ARIA 1.2 allows `aria-readonly` on
        // `radiogroup` alone, never on `radio`: the guard is in the machine and
        // the promise to assistive technology is made here, once for the group.
        "aria-readonly": ariaAttr(readOnly),
        "data-orientation": orientation,
        "data-disabled": dataAttr(groupDisabled),
        // Alongside `data-disabled`, and for the same reason: read-only is a
        // property of the whole group — the items each carry it, but only the
        // container can be styled as one.
        "data-readonly": dataAttr(readOnly),
        // On the root because the root is the indicator's containing block: the
        // offset is measured against that box, and an `inset` resolves against
        // the same one, so the two cannot disagree.
        style: {
          "--sui-indicator-offset": indicatorOffset === null ? undefined : `${indicatorOffset}px`,
          "--sui-indicator-size": indicatorSize === null ? undefined : `${indicatorSize}px`,
        },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({ ...parts.label.attrs, id: getLabelId(scope) }),

    getIndicatorProps: (): T["element"] =>
      normalize.element({
        ...parts.indicator.attrs,
        "aria-hidden": ariaAttr(true),
        "data-orientation": orientation,
        "data-empty": dataAttr(indicatorOffset === null),
        // The highlight must not play a spring because the window moved, a font
        // finished loading, or the page has only just been painted.
        "data-immediate": dataAttr(!context.get("indicatorAnimated")),
      }),

    getItemProps: (itemProps: RadioItemProps): T["label"] => {
      const { attrs } = itemState(itemProps);
      return normalize.label({
        ...parts.item.attrs,
        ...attrs,
        id: getItemId(scope, itemProps.value),
        // The item list the machine keys its remeasure on is read from these.
        "data-value": itemProps.value,
        style: { userSelect: "none" },
      });
    },

    getItemControlProps: (itemProps: RadioItemProps): T["element"] => {
      const { attrs } = itemState(itemProps);
      return normalize.element({
        ...parts.itemControl.attrs,
        ...attrs,
        "aria-hidden": ariaAttr(true),
      });
    },

    getItemTextProps: (itemProps: RadioItemProps): T["element"] => {
      const { attrs } = itemState(itemProps);
      return normalize.element({ ...parts.itemText.attrs, ...attrs });
    },

    getItemHiddenInputProps: (itemProps: RadioItemProps): T["input"] => {
      const { selected, disabled } = itemState(itemProps);
      return normalize.input({
        ...parts.itemHiddenInput.attrs,
        id: getItemInputId(scope, itemProps.value),
        type: "radio",
        // Visually hidden, never removed: the browser's arrow-to-select lives here,
        // and so does the tab stop the group writes.
        style: visuallyHiddenStyle,
        name,
        value: itemProps.value,
        form: prop("form"),
        checked: selected,
        disabled,
        tabIndex: tabStop === undefined ? undefined : itemProps.value === tabStop ? 0 : -1,
        required: prop("required"),
        "aria-invalid": ariaAttr(invalid),
        onChange(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.SELECT", value: itemProps.value });
        },
        onFocus(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.FOCUS", value: itemProps.value });
        },
        onBlur(event) {
          if (event.defaultPrevented) return;
          send({ type: "ITEM.BLUR" });
        },
      });
    },
  };
}
