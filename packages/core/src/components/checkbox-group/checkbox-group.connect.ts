import { ariaAttr, dataAttr } from "../../dom/attrs";
import type { NormalizeProps, PropTypes } from "../../machine/prop-types";
import type { Service } from "../../machine/types";
import { parts } from "./checkbox-group.anatomy";
import { getGroupName, getLabelId, getRootId } from "./checkbox-group.dom";
import type { CheckboxGroupApi, CheckboxGroupSchema } from "./checkbox-group.types";

export function connect<T extends PropTypes>(
  service: Service<CheckboxGroupSchema>,
  normalize: NormalizeProps<T>,
): CheckboxGroupApi<T> {
  const { context, prop, computed, send, scope } = service;

  const value = context.get("value");
  const disabled = prop("disabled");
  const readOnly = prop("readOnly");
  const invalid = prop("invalid");
  const required = prop("required");
  const orientation = prop("orientation");

  return {
    value,
    name: getGroupName(scope, prop("name")),
    disabled,
    readOnly,
    invalid,
    form: prop("form"),
    parentChecked: computed("parentChecked"),
    parentDisabled: computed("parentDisabled"),

    isChecked: (entry: string): boolean => value.includes(entry),

    setValue(next: readonly string[]): void {
      send({ type: "VALUE.SET", value: next });
    },
    toggleValue(entry: string): void {
      send({ type: "ITEM.TOGGLE", value: entry });
    },
    toggleAll(checked: boolean): void {
      send({ type: "PARENT.TOGGLE", checked });
    },

    getRootProps: (): T["element"] =>
      normalize.element({
        ...parts.root.attrs,
        id: getRootId(scope),
        role: "group",
        dir: prop("dir"),
        // Only when it exists: a dangling IDREF names the group nothing at all,
        // which is the defect the Phase 4 audit found on `progress`.
        "aria-labelledby": context.get("hasLabel") ? getLabelId(scope) : undefined,
        "aria-describedby": prop("describedBy"),
        "aria-invalid": ariaAttr(invalid),
        "aria-disabled": ariaAttr(disabled),
        // `aria-required` is deliberately absent. It is not an allowed attribute
        // on `role="group"` (axe flags it), and the native spelling is worse: a
        // `required` checkbox means *this box* must be checked, so putting it on
        // the items would demand all of them instead of at least one. The rule
        // belongs to the consumer's validation; the group only says it exists.
        "data-required": dataAttr(required),
        "data-orientation": orientation,
        "data-disabled": dataAttr(disabled),
        "data-readonly": dataAttr(readOnly),
        "data-invalid": dataAttr(invalid),
        style: { "--sui-item-count": String(Math.max(context.get("itemCount"), 1)) },
      }),

    getLabelProps: (): T["element"] =>
      normalize.element({
        ...parts.label.attrs,
        id: getLabelId(scope),
        "data-disabled": dataAttr(disabled),
        "data-invalid": dataAttr(invalid),
      }),
  };
}
