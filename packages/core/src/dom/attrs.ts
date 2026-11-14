/**
 * State reaches the styles as data-attributes, never as class names — that is the
 * CSS ↔ core contract (architecture.md). `dataAttr` emits the empty string so the
 * attribute is present-or-absent, which is what `[data-disabled]` selects on;
 * `ariaAttr` emits a string so it serialises identically in every adapter and in
 * server-rendered HTML.
 */

export function dataAttr(condition: boolean | undefined): "" | undefined {
  return condition === true ? "" : undefined;
}

export function ariaAttr(condition: boolean | undefined): "true" | undefined {
  return condition === true ? "true" : undefined;
}

export function boolAttr(condition: boolean | undefined): "true" | "false" {
  return condition === true ? "true" : "false";
}

/** Sets an attribute and returns the restore, so an effect can hand back the DOM. */
export function setAttribute(node: Element, name: string, value: string): VoidFunction {
  const previous = node.getAttribute(name);
  node.setAttribute(name, value);
  return () => {
    if (previous === null) node.removeAttribute(name);
    else node.setAttribute(name, previous);
  };
}

export function setStyle(
  node: HTMLElement,
  style: Readonly<Record<string, string | undefined>>,
): VoidFunction {
  const previous = new Map<string, string>();
  for (const [property, value] of Object.entries(style)) {
    previous.set(property, node.style.getPropertyValue(property));
    if (value === undefined) node.style.removeProperty(property);
    else node.style.setProperty(property, value);
  }
  return () => {
    for (const [property, value] of previous) {
      if (value === "") node.style.removeProperty(property);
      else node.style.setProperty(property, value);
    }
  };
}
