import { Slider } from "@standarui/react/slider";
import type { ReactNode } from "react";

export function SliderBasic(): ReactNode {
  return <Slider label="Volume" defaultValue={40} min={0} max={100} />;
}
