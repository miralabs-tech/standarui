import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type LinkPart = "root" | "externalIcon" | "externalLabel";

export const anatomy: Anatomy<LinkPart> = createAnatomy("link").parts(
  "root",
  "externalIcon",
  "externalLabel",
);

export const parts: Record<LinkPart, AnatomyPart> = anatomy.build();
