import { Button } from "@standarui/react/button";
import { Popover } from "@standarui/react/popover";
import type { ReactNode } from "react";

export function PopoverBasic(): ReactNode {
  return (
    <Popover
      trigger={<Button>Details</Button>}
      title="Storage"
      description="You are using 4 GB of the 10 GB included in your plan."
    />
  );
}
