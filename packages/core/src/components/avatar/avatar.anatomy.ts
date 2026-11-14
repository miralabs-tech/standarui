import { type Anatomy, type AnatomyPart, createAnatomy } from "../../machine/anatomy";

export type AvatarPart = "root" | "image" | "fallback";

export const anatomy: Anatomy<AvatarPart> = createAnatomy("avatar").parts(
  "root",
  "image",
  "fallback",
);

export const parts: Record<AvatarPart, AnatomyPart> = anatomy.build();
