/**
 * `<DateField/>` — the whole field: the group, the locale's own strip of
 * segments, the stepper inside it, and the mirror that submits.
 *
 * Six parts in the anatomy and four keys in `parts`, which is not an omission.
 * `segment` is not one of them because `DateFieldSegments` is what places the
 * strip and takes no props of its own: the segments are the locale's, not the
 * consumer's — `formatToParts` decides how many there are, in what order, and
 * what punctuation falls between them — so there is no single segment for a
 * `parts.segment` to reach. A consumer who needs their own markup per unit reads
 * the segments from `useDateFieldContext` and writes the parts form; that is the
 * fork this layer is the other side of. `root` is not a key either, for the
 * reason it never is: the root's props *are* this component's props.
 *
 * The stepper is always placed. It sits inside the field, it is
 * out of the tab order and hidden from a reader (`date-field.anatomy.ts`), and it
 * draws itself under `:empty` (`_date-field.scss:196`) — so it costs a reader
 * nothing and it is what the reference design shows. A field without one is a parts-form
 * shape, the same way a `<Select>` without a portal is.
 *
 * The hidden input is always placed too, and is inert until it has a name:
 * `getHiddenInputProps` writes `name: prop("name")` and a nameless control is not
 * submitted. Placing it on the `name` prop would make the composed form's markup
 * depend on a value, which is exactly what the parity table exists to keep it
 * from doing.
 */

import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  DateFieldControl,
  DateFieldDecrementTrigger,
  DateFieldHiddenInput,
  DateFieldIncrementTrigger,
  DateFieldRoot,
  DateFieldSegments,
  type UseDateFieldProps,
} from "./date-field";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface DateFieldParts {
  readonly control?: PartProps<"div"> | undefined;
  readonly incrementTrigger?: PartProps<"button"> | undefined;
  readonly decrementTrigger?: PartProps<"button"> | undefined;
  readonly hiddenInput?: PartProps<"input"> | undefined;
}

export interface DateFieldComposedProps
  extends UseDateFieldProps,
    Omit<PartProps<"div", UseDateFieldProps>, "children"> {
  readonly parts?: DateFieldParts | undefined;
}

export function DateField(props: DateFieldComposedProps): ReactNode {
  const { parts, ...root } = props;

  return (
    <DateFieldRoot {...root}>
      <DateFieldControl {...parts?.control}>
        <DateFieldSegments />
        <DateFieldIncrementTrigger {...parts?.incrementTrigger} />
        <DateFieldDecrementTrigger {...parts?.decrementTrigger} />
      </DateFieldControl>
      <DateFieldHiddenInput {...parts?.hiddenInput} />
    </DateFieldRoot>
  );
}
