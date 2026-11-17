import { Button } from "@standarui/react/button";
import { Dialog } from "@standarui/react/dialog";
import type { ReactNode } from "react";

export function DialogBasic(): ReactNode {
  return (
    <Dialog
      trigger={<Button>Open dialog</Button>}
      title="Export report"
      description="The report is prepared in the background and downloaded when it is ready."
      actions={[{ label: "Close", cancel: true }]}
    />
  );
}
