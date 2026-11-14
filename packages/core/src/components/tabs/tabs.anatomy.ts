import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

/**
 * `closeTrigger` is a sixth part. It is here for reference-app parity (CDC §4.5): `tabs` replaces `EditorTabs`, a
 * bar of closable documents. The branch it opens is not outside the pattern —
 * APG Tabs already spells `Delete` as the keyboard route to closing a tab, so
 * the button is the pointer route to something the pattern owns.
 */
export type TabsPart =
  | "root"
  | "list"
  | "trigger"
  | "indicator"
  | "content"
  | "closeTrigger"
  | "scrollbar"
  | "thumb";

export const anatomy: Anatomy<TabsPart> = createAnatomy("tabs").parts(
  "root",
  "list",
  "trigger",
  "indicator",
  "content",
  "closeTrigger",
  "scrollbar",
  "thumb",
);

export const parts: Record<TabsPart, AnatomyPart> = anatomy.build();
