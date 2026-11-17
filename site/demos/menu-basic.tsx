import { Button } from "@standarui/react/button";
import { Menu } from "@standarui/react/menu";
import type { ReactNode } from "react";

export function MenuBasic(): ReactNode {
  return (
    <Menu
      trigger={<Button>Actions</Button>}
      items={[
        { value: "rename", label: "Rename" },
        { value: "duplicate", label: "Duplicate" },
        { value: "archive", label: "Archive" },
        { value: "delete", label: "Delete" },
      ]}
    />
  );
}
