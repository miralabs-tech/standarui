/**
 * Writing a `connect` getter's output onto a real element.
 *
 * `connect` speaks plain DOM — HTML attribute names, camelCase handlers, a style
 * object — and every adapter translates that dialect once, at its own boundary.
 * React's translation is a dictionary, because JSX has other names for the same
 * things. This one is the identity dialect, so what it owns instead is the
 * *writing*: which keys are attributes, which are live properties the parser only
 * reads once, and how a repaint leaves alone the DOM it already wrote.
 *
 * That last part is not tidiness. Three machines learn about their own parts
 * through `observeChildren` / `observeAttributes`, and a mutation record is
 * emitted for a write even when the value is identical — so a repaint that
 * changed nothing has to write nothing, or the observers see churn that never
 * happened.
 *
 * It lives in the core rather than in `@standarui/vanilla` because the browser
 * test harness needs the same writer, and the core cannot import an adapter.
 */

import {
  type AnyProps,
  createNormalizer,
  type NormalizeProps,
  type PropTypes,
} from "../machine/prop-types";
import { toKebabCase } from "../utils/string";

/** The identity dialect: what `connect` emits is already what the DOM takes. */
export interface DomPropTypes extends PropTypes {
  element: Record<string, unknown>;
  a: Record<string, unknown>;
  button: Record<string, unknown>;
  input: Record<string, unknown>;
  label: Record<string, unknown>;
  output: Record<string, unknown>;
  select: Record<string, unknown>;
  textarea: Record<string, unknown>;
  img: Record<string, unknown>;
  svg: Record<string, unknown>;
  circle: Record<string, unknown>;
  path: Record<string, unknown>;
}

export const domNormalizer: NormalizeProps<DomPropTypes> = createNormalizer<DomPropTypes>(
  (props) => props,
);

/** `onDoubleClick` is the one handler whose event is not its name lowercased. */
const EVENT_NAMES: Readonly<Record<string, string>> = { onDoubleClick: "dblclick" };

/**
 * Props whose attribute is spelled differently. A table rather than a lowercase
 * pass, and SVG is why: `viewBox` is case-sensitive and would stop resolving,
 * while `strokeWidth` needs a dash no HTML attribute takes.
 */
const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  autoCapitalize: "autocapitalize",
  autoComplete: "autocomplete",
  contentEditable: "contenteditable",
  defaultChecked: "checked",
  defaultValue: "value",
  inputMode: "inputmode",
  maxLength: "maxlength",
  minLength: "minlength",
  readOnly: "readonly",
  spellCheck: "spellcheck",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeWidth: "stroke-width",
  tabIndex: "tabindex",
};

/**
 * Attributes where `false` is a value and not an absence. Removing one is how
 * `draggable: false` quietly becomes `draggable="true"` again on a node whose
 * ancestor sets it.
 */
const ENUMERATED: ReadonlySet<string> = new Set([
  "contenteditable",
  "draggable",
  "focusable",
  "spellcheck",
  "translate",
]);

/**
 * Written as properties rather than attributes: the parser reads `value` and
 * `checked` once, to seed the field, and never again — so an attribute write on a
 * field somebody has already typed into changes nothing at all.
 */
const PROPERTIES: ReadonlySet<string> = new Set(["checked", "indeterminate", "value"]);

function isFormField(node: Element): boolean {
  const name = node.localName;
  return name === "input" || name === "textarea" || name === "select";
}

function writeProperty(node: Element, name: string, value: unknown): void {
  const field = node as unknown as Record<string, unknown>;
  const next =
    name === "value"
      ? value === undefined || value === null
        ? ""
        : String(value)
      : value === true;
  if (field[name] !== next) field[name] = next;
}

function writeStyle(node: Element, value: unknown, written: Set<string>): void {
  // A string is handed over whole; `connect` emits one only when it has no custom
  // properties to place, which is the case the object form exists for.
  if (typeof value === "string") {
    node.setAttribute("style", value);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const { style } = node as HTMLElement;
  if (style === undefined) return;
  for (const [property, declaration] of Object.entries(value)) {
    // Custom properties keep their dashes — they are how the core talks to the
    // styles layer, and kebab-casing one would rename it.
    const name = property.startsWith("--") ? property : toKebabCase(property);
    if (declaration === undefined || declaration === null) {
      style.removeProperty(name);
      continue;
    }
    const next = String(declaration);
    if (style.getPropertyValue(name) !== next) style.setProperty(name, next);
    written.add(name);
  }
}

function isHandlerKey(key: string): boolean {
  return key.startsWith("on") && key.length > 2 && key[2] === key[2]?.toUpperCase();
}

interface NodeState {
  /** The latest handler per event type; the installed listener reads it live. */
  readonly handlers: Map<string, EventListener>;
  /** One stable listener per event type, installed once and never re-added. */
  readonly installed: Map<string, EventListener>;
  attributes: Set<string>;
  styles: Set<string>;
}

export interface PropsWriter {
  /**
   * Applies one getter's output, removing whatever the previous pass wrote and
   * this one does not. What the consumer authored is never touched: only names
   * this writer has written are candidates for removal.
   */
  write(node: Element, props: AnyProps): void;
  /** Forgets a node and takes its listeners back off. */
  release(node: Element): void;
  destroy(): void;
}

export function createPropsWriter(): PropsWriter {
  const nodes = new Map<Element, NodeState>();

  const stateOf = (node: Element): NodeState => {
    let state = nodes.get(node);
    if (state === undefined) {
      state = {
        handlers: new Map(),
        installed: new Map(),
        attributes: new Set(),
        styles: new Set(),
      };
      nodes.set(node, state);
    }
    return state;
  };

  const setHandler = (node: Element, state: NodeState, key: string, value: unknown): void => {
    const type = EVENT_NAMES[key] ?? key.slice(2).toLowerCase();
    if (typeof value !== "function") {
      state.handlers.delete(type);
      return;
    }
    state.handlers.set(type, value as EventListener);
    if (state.installed.has(type)) return;
    // A stable dispatcher rather than the handler itself: `connect` allocates a
    // fresh closure on every read, so binding it directly would mean removing and
    // re-adding every listener on every repaint — and a listener re-added while
    // its own event is dispatching is a listener that runs twice.
    const listener: EventListener = (event: Event): void => {
      state.handlers.get(type)?.(event);
    };
    node.addEventListener(type, listener);
    state.installed.set(type, listener);
  };

  const release = (node: Element): void => {
    const state = nodes.get(node);
    if (state === undefined) return;
    for (const [type, listener] of state.installed) node.removeEventListener(type, listener);
    nodes.delete(node);
  };

  return {
    write(node: Element, props: AnyProps): void {
      const state = stateOf(node);
      const attributes = new Set<string>();
      const styles = new Set<string>();

      for (const [key, value] of Object.entries(props)) {
        if (key === "style") {
          writeStyle(node, value, styles);
          continue;
        }
        if (isHandlerKey(key)) {
          setHandler(node, state, key, value);
          continue;
        }

        const name = ATTRIBUTE_NAMES[key] ?? key;
        if (PROPERTIES.has(name) && isFormField(node)) {
          writeProperty(node, name, value);
          continue;
        }
        if (value === undefined || value === null) {
          node.removeAttribute(name);
          continue;
        }

        let serialised: string;
        if (typeof value === "boolean") {
          if (!value && !ENUMERATED.has(name)) {
            node.removeAttribute(name);
            continue;
          }
          serialised = ENUMERATED.has(name) ? String(value) : "";
        } else {
          serialised = String(value);
        }
        if (node.getAttribute(name) !== serialised) node.setAttribute(name, serialised);
        attributes.add(name);
      }

      for (const name of state.attributes) {
        if (!attributes.has(name)) node.removeAttribute(name);
      }
      const { style } = node as HTMLElement;
      if (style !== undefined) {
        for (const property of state.styles) {
          if (!styles.has(property)) style.removeProperty(property);
        }
      }
      state.attributes = attributes;
      state.styles = styles;
    },

    release,

    destroy(): void {
      for (const node of [...nodes.keys()]) release(node);
    },
  };
}
