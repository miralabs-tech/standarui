import { Button } from "@standarui/react/button";
import { Tooltip } from "@standarui/react/tooltip";
import type { ReactNode } from "react";

export function TooltipBasic(): ReactNode {
  return <Tooltip trigger={<Button>Save</Button>}>Save your changes</Tooltip>;
}
