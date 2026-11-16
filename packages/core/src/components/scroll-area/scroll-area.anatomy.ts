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

export interface ScrollAreaCssVars {
  // --- written ---
  /** Length of a scrollbar thumb. */
  "--sui-scroll-area-thumb-size": "<length>";
  /** Offset of a scrollbar thumb along its track. */
  "--sui-scroll-area-thumb-offset": "<length>";
}
