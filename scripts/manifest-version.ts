export function staleManifestMessage(
  manifestVersion: string | undefined,
  packageVersion: string,
): string | null {
  if (manifestVersion === packageVersion) return null;
  return `packages/react/api/manifest.json is at ${manifestVersion ?? "no version"} but packages/react is at ${packageVersion}: run \`bun run docs:api\` before packing`;
}

export function outdatedManifestMessage(
  committed: string | undefined,
  generated: string,
): string | null {
  if (committed === generated) return null;
  return "packages/react/api/manifest.json differs from what `bun run docs:api` generates from the source: run `bun run docs:api` before packing";
}
