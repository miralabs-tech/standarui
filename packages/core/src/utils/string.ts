export function toKebabCase(value: string): string {
  // Two passes, in this order: an acronym run ("XI") has to split from the
  // capitalized word it leads into before the lowercase-to-uppercase pass runs,
  // or the run's own internal boundary (upper-to-upper) is invisible to it.
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}
