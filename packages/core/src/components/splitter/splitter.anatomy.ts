import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type SplitterPart = "panel" | "handle";

export const anatomy: Anatomy<SplitterPart> = createAnatomy("splitter").parts("panel", "handle");

export const parts: Record<SplitterPart, AnatomyPart> = anatomy.build();

export interface SplitterCssVars {
  // --- written ---
  /** Size of the panel, in the splitter's unit. */
  "--sui-splitter-size": "<length-percentage>";
}
