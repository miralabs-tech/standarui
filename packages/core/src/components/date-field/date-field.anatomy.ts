import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * Six parts. `control` is the box — a `role="group"` that carries the accessible
 * name, because the segments inside it are spinbuttons and each one names its own
 * unit. The two triggers are the stepper, out of the tab order and hidden from a reader: the keyboard steps
 * through the segment itself, exactly as `number-input` decided.
 *
 * `hiddenInput` is never `type="date"`. A real date input brings the browser's own
 * calendar UI with it, which is the whole thing this component exists to replace.
 */
export type DateFieldPart =
  | "root"
  | "control"
  | "segment"
  | "incrementTrigger"
  | "decrementTrigger"
  | "hiddenInput";

export const anatomy: Anatomy<DateFieldPart> = createAnatomy("date-field").parts(
  "root",
  "control",
  "segment",
  "incrementTrigger",
  "decrementTrigger",
  "hiddenInput",
);

export const parts: Record<DateFieldPart, AnatomyPart> = anatomy.build();
