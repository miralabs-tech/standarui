export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[standarui] ${message}`);
  }
}

export function warn(condition: unknown, message: string): void {
  if (condition && typeof console !== "undefined") {
    console.warn(`[standarui] ${message}`);
  }
}
