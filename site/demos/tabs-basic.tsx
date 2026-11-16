import { Tabs } from "@standarui/react/tabs";
import type { ReactNode } from "react";

export function TabsBasic(): ReactNode {
  return (
    <Tabs
      defaultValue="overview"
      items={[
        { value: "overview", label: "Overview", content: "A summary of the project." },
        { value: "activity", label: "Activity", content: "The latest changes, newest first." },
        { value: "settings", label: "Settings", content: "Name, visibility and members." },
      ]}
    />
  );
}
