export type CodeLayer = "core" | "react";

export type RegistryLayer = CodeLayer | "styles";

export type RegistryItemType = "registry:nav" | "registry:base" | "registry:component";

export interface RegistryFile {
  readonly layer: RegistryLayer;
  readonly path: string;
  readonly sha256: string;
  readonly content: string;
}

export interface RegistryItem {
  readonly $schema: string;
  readonly name: string;
  readonly type: RegistryItemType;
  readonly version: string;
  readonly description?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly registryDependencies: readonly string[];
  readonly files: readonly RegistryFile[];
}

export interface RegistrySpecifier {
  readonly layer: CodeLayer;
  readonly path: string;
}

export interface RegistryIndexEntry {
  readonly name: string;
  readonly type: RegistryItemType;
  readonly registryDependencies: readonly string[];
  readonly files: number;
}

export interface RegistryIndex {
  readonly $schema: string;
  readonly name: string;
  readonly version: string;
  readonly manifest: string;
  readonly renames: string;
  readonly specifiers: Readonly<Record<string, RegistrySpecifier>>;
  readonly items: readonly RegistryIndexEntry[];
}
