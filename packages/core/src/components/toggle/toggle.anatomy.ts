import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type TogglePart = "root" | "indicator";

export const anatomy: Anatomy<TogglePart> = createAnatomy("toggle").parts("root", "indicator");

export const parts: Record<TogglePart, AnatomyPart> = anatomy.build();
