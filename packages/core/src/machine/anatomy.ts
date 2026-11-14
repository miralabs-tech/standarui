import { toKebabCase } from "../utils/string";

/**
 * The anatomy is the single source of truth for a component's parts, shared by
 * `connect`, the SCSS layer, the docs and the tests (research/core.md §1.3).
 * Part keys are camelCase in code and kebab-case on the element, so the styles
 * read `[data-part~="menu:item-trigger"]`.
 *
 * Both attributes are token *lists*, in the shape of `class`: composing two parts
 * onto one element — `<PopoverTrigger render={<ButtonRoot/>}>` — gives that
 * element both identities rather than the outer one erasing the inner. `data-part`
 * carries the scope with it (`"popover:trigger button:root"`) precisely so that a
 * list cannot invent a pair nobody rendered: with the scope in a separate list,
 * that element would also answer to `popover` × `root`, and the day somebody
 * styles that pair the breakage is silent. The token *is* the pair, so `~=` is
 * exact.
 */

export interface PartAttributes {
  /** The component's own name; a list when parts are composed. */
  readonly "data-scope": string;
  /** Scope-qualified — `"dialog:close-trigger"`, never a bare `"close-trigger"`. */
  readonly "data-part": string;
}

export interface AnatomyPart {
  readonly attrs: PartAttributes;
  readonly selector: string;
}

export interface Anatomy<T extends string> {
  readonly name: string;
  parts<P extends string>(...names: P[]): Anatomy<P>;
  extendWith<P extends string>(...names: P[]): Anatomy<T | P>;
  rename(name: string): Anatomy<T>;
  keys(): T[];
  build(): Record<T, AnatomyPart>;
}

export function createAnatomy<T extends string = never>(
  name: string,
  parts: readonly T[] = [],
): Anatomy<T> {
  return {
    name,
    parts: <P extends string>(...names: P[]): Anatomy<P> => createAnatomy<P>(name, names),
    extendWith: <P extends string>(...names: P[]): Anatomy<T | P> =>
      createAnatomy<T | P>(name, [...parts, ...names]),
    rename: (next: string): Anatomy<T> => createAnatomy<T>(next, parts),
    keys: (): T[] => [...parts],
    build: (): Record<T, AnatomyPart> => {
      const result = {} as Record<T, AnatomyPart>;
      for (const part of parts) {
        const attrs: PartAttributes = {
          "data-scope": name,
          "data-part": `${name}:${toKebabCase(part)}`,
        };
        result[part] = { attrs, selector: `[data-part~="${attrs["data-part"]}"]` };
      }
      return result;
    },
  };
}
