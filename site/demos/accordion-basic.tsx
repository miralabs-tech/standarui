import { Accordion } from "@standarui/react/accordion";
import type { ReactNode } from "react";

export function AccordionBasic(): ReactNode {
  return (
    <Accordion
      defaultValue={["shipping"]}
      items={[
        {
          value: "shipping",
          label: "Shipping",
          content: "Orders leave the warehouse within two working days.",
        },
        {
          value: "returns",
          label: "Returns",
          content: "Unused items can be sent back within thirty days.",
        },
        {
          value: "warranty",
          label: "Warranty",
          content: "Every product is covered for two years.",
        },
      ]}
    />
  );
}
