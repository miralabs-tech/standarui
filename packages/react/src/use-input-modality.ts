import { trackInputModality } from "@standarx/nav";
import { type RefObject, useEffect } from "react";

export function useInputModality(node: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const doc = node.current?.ownerDocument;
    if (doc === undefined) return;
    return trackInputModality(doc);
  }, [node]);
}
