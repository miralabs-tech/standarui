export type FileStatus =
  | "unchanged"
  | "update"
  | "merge"
  | "local-only"
  | "added"
  | "removed"
  | "conflict";

export interface FileState {
  readonly base: string | undefined;
  readonly local: string | undefined;
  readonly target: string | undefined;
}

export type MergeProbe = (local: string, base: string, target: string) => boolean;

export function classifyFile(state: FileState, mergesCleanly: MergeProbe): FileStatus {
  const { base, local, target } = state;
  if (target === undefined) return "removed";
  if (base === undefined) {
    if (local === undefined) return "added";
    return local === target ? "unchanged" : "conflict";
  }
  if (local === undefined) return target === base ? "local-only" : "conflict";
  if (target === base) return local === base ? "unchanged" : "local-only";
  if (local === base) return "update";
  return mergesCleanly(local, base, target) ? "merge" : "conflict";
}

export function backupDirName(date: Date): string {
  return date.toISOString().replaceAll(":", "");
}
