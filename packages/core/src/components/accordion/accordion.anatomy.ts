import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * `body` is a seventh part that APG's anatomy does not name, and it is the same
 * kind of addition `tabs` makes with `closeTrigger`: structural, not aria.
 *
 * `content` is the box whose `height` animates, so it must carry no padding of
 * its own — a padded box cannot reach zero without its own text sliding out
 * through the bottom edge on the way down. `body` is where the padding lives,
 * which makes `content.scrollHeight` the number the animation needs. Radix
 * documents that split as something each consumer re-implements; here it is a
 * part, settled once.
 */
export type AccordionPart =
  | "root"
  | "item"
  | "header"
  | "trigger"
  | "indicator"
  | "content"
  | "body";

export const anatomy: Anatomy<AccordionPart> = createAnatomy("accordion").parts(
  "root",
  "item",
  "header",
  "trigger",
  "indicator",
  "content",
  "body",
);

export const parts: Record<AccordionPart, AnatomyPart> = anatomy.build();
