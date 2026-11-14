/**
 * `<Input/>` — one root, one control (or, under `multiline`, one textarea), and
 * the reveal trigger the machine positions but never names.
 *
 * `revealLabel` is the exigence this layer exists to enforce: `type="password"`
 * has to make it required, because `getVisibilityTriggerProps`
 * (`input.connect.ts:124-151`) writes an id, a state and a click handler and no
 * `aria-label` at all — the machine only ever *hides* the button when the field
 * is not a password (`hidden: !isPassword`), it never names it. Skip the label
 * and the trigger ships as a button a screen reader announces as "button".
 *
 * The union below only reaches literal usage: `<Input type="password"/>` with no
 * `revealLabel` is a compile error, because `"password"` is the one literal
 * value either branch's `type` field can match on its own. `type={someString}`
 * is still plain `string` to the compiler, though, the same way a computed
 * `Dialog.title` slips past `Exclude<ReactNode, …>` — so a `type` read out of
 * state or a prop lands in the loose branch and typechecks with no
 * `revealLabel` at all. The dev-only `warn` below is what the type system
 * cannot be for that case, and it is also what catches a plain-JS caller with no
 * type checker in the loop.
 *
 * `InputComposedProps` has to stay an actual union for that compile-time check
 * to mean anything, and an `interface` cannot hold one — so the fields every
 * input shares live on `InputBaseComposedProps`, and only `type`/`revealLabel`
 * are decided by the pair below.
 */

import { isDev, warn } from "@standarui/core";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  InputControl,
  InputRoot,
  InputTextarea,
  InputVisibilityTrigger,
  type UseInputProps,
} from "./input";

export interface InputParts {
  readonly control?: PartProps<"input"> | undefined;
  readonly textarea?: PartProps<"textarea"> | undefined;
  readonly visibilityTrigger?: PartProps<"button"> | undefined;
}

export interface InputBaseComposedProps
  extends Omit<UseInputProps, "type">,
    Omit<PartProps<"div", UseInputProps>, "children"> {
  /** Renders `InputTextarea` in place of `InputControl`. */
  readonly multiline?: boolean | undefined;
  readonly parts?: InputParts | undefined;
}

/**
 * The pair no single `interface` can hold: `revealLabel` is absent everywhere
 * `type` is not the literal `"password"`, and required the one place it is.
 */
type InputRevealProps =
  | { readonly type?: string | undefined; readonly revealLabel?: undefined }
  | { readonly type: "password"; readonly revealLabel: string };

export type InputComposedProps = InputBaseComposedProps & InputRevealProps;

export function Input(props: InputComposedProps): ReactNode {
  const { multiline, revealLabel, parts, ...root } = props;
  const isPassword = root.type === "password";

  // The half the union cannot state: a `type` read from a variable is plain
  // `string`, so it lands in the loose branch and compiles with no
  // `revealLabel` at all — this is that case, caught at render instead.
  warn(
    isDev() && isPassword && (revealLabel === undefined || revealLabel === ""),
    'Input: `revealLabel` names the reveal trigger and is required under type="password" — `getVisibilityTriggerProps` writes no accessible name of its own. Pass the word, or the trigger ships as a button called "button".',
  );

  return (
    <InputRoot {...root}>
      {multiline === true ? (
        <InputTextarea {...parts?.textarea} />
      ) : (
        <InputControl {...parts?.control} />
      )}
      {isPassword ? (
        <InputVisibilityTrigger aria-label={revealLabel} {...parts?.visibilityTrigger} />
      ) : null}
    </InputRoot>
  );
}
