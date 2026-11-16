import { Select } from "@standarui/react/select";
import type { ReactNode } from "react";

export function SelectBasic(): ReactNode {
  return (
    <Select
      label="Fruit"
      placeholder="Pick a fruit"
      options={[
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
        { value: "cherry", label: "Cherry" },
        { value: "grape", label: "Grape" },
      ]}
    />
  );
}
