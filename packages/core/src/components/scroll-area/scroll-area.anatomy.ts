import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type ScrollAreaPart = "root" | "viewport" | "content" | "scrollbar" | "thumb" | "corner";

export const anatomy: Anatomy<ScrollAreaPart> = createAnatomy("scroll-area").parts(
  "root",
  "viewport",
  "content",
  "scrollbar",
  "thumb",
  "corner",
);

export const parts: Record<ScrollAreaPart, AnatomyPart> = anatomy.build();
