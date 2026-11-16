export interface ManifestPart {
  readonly key: string;
  readonly part: string;
}

export type Flow = "out" | "both";

export interface SheetNames {
  readonly tokens: readonly string[];
  readonly reads: readonly string[];
  readonly hooks: readonly string[];
  readonly channels: readonly string[];
}

export interface ManifestComponent {
  readonly scope: string | null;
  readonly parts: readonly ManifestPart[];
  readonly tokens?: readonly string[];
  readonly reads?: readonly string[];
  readonly hooks?: readonly string[];
  readonly channels?: readonly string[];
  readonly imports: readonly string[];
  readonly composed: boolean;
  readonly api: string | null;
  readonly props: Readonly<Record<string, readonly string[]>>;
  readonly aliases: Readonly<Record<string, string>>;
  readonly flows: Readonly<Record<string, Flow>>;
}

export interface ComponentManifest {
  readonly schema: 1;
  readonly version: string;
  readonly tokens?: readonly string[];
  readonly sheets?: Readonly<Record<string, SheetNames>>;
  readonly components: Readonly<Record<string, ManifestComponent>>;
  readonly shared?: Readonly<Record<string, ManifestShared>>;
}

export interface ManifestShared {
  readonly reads?: readonly string[];
  readonly channels?: readonly string[];
}

export type RenameKind = "part" | "token" | "hook" | "prop" | "component";

export interface Rename {
  readonly since: string;
  readonly kind: RenameKind;
  readonly component?: string;
  readonly table?: string;
  readonly from: string;
  readonly to: string;
}

export interface NameChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
}

export type Category = "global" | "token" | "read" | "hook" | "channel";

export interface Reclassified {
  readonly name: string;
  readonly from: Category;
  readonly to: Category;
}

export type Direction = "in" | Flow;

export interface DefinitionChange {
  readonly from: string | null;
  readonly to: string | null;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface TableChanges extends NameChanges {
  readonly table: "added" | "removed" | null;
  readonly direction: Direction;
  readonly addedRequired: readonly string[];
  readonly optional: readonly string[];
  readonly required: readonly string[];
  readonly definition: DefinitionChange | null;
}

export interface SheetChanges {
  readonly tokens: NameChanges;
  readonly reads: NameChanges;
  readonly hooks: NameChanges;
  readonly channels: NameChanges;
  readonly reclassified: readonly Reclassified[];
}

export interface ComponentChanges extends SheetChanges {
  readonly parts: NameChanges;
  readonly props: Readonly<Record<string, TableChanges>>;
  readonly composed: { readonly from: boolean; readonly to: boolean } | null;
  readonly renamedFrom: string | null;
  readonly shadowed: readonly string[];
}

export interface ManifestDiff {
  readonly breaking: boolean;
  readonly components: NameChanges;
  readonly tokens: NameChanges;
  readonly reclassified: readonly Reclassified[];
  readonly sheets: NameChanges;
  readonly sheetChanged: Readonly<Record<string, SheetChanges>>;
  readonly changed: Readonly<Record<string, ComponentChanges>>;
}

type Key = "tokens" | "reads" | "hooks" | "channels";

type Own = Exclude<Category, "global">;

const KEYS: readonly (readonly [Key, Own])[] = [
  ["tokens", "token"],
  ["reads", "read"],
  ["hooks", "hook"],
  ["channels", "channel"],
];

const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  global: "token global",
  token: "token",
  read: "lecture",
  hook: "hook",
  channel: "canal",
};

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const listOf = (values: readonly string[] | undefined): readonly string[] => values ?? [];
const bare = (name: string): string => (name.endsWith("?") ? name.slice(0, -1) : name);

function isEmpty(changes: NameChanges): boolean {
  return changes.added.length === 0 && changes.removed.length === 0 && changes.renamed.length === 0;
}

function byFrom(a: { from: string }, b: { from: string }): number {
  return a.from < b.from ? -1 : a.from > b.from ? 1 : 0;
}

function withChains<T extends { from: string; to: string }>(entries: readonly T[]): T[] {
  const next = new Map(entries.map((entry) => [entry.from, entry.to]));
  const resolved: T[] = [];
  for (const entry of entries) {
    let to = entry.to;
    const seen = new Set([entry.from]);
    while (next.has(to) && !seen.has(to)) {
      seen.add(to);
      to = next.get(to) as string;
    }
    if (to !== entry.to) resolved.push({ ...entry, to });
  }
  return [...resolved, ...entries];
}

function compare(
  before: readonly string[],
  after: readonly string[],
  declared: readonly { from: string; to: string }[],
): NameChanges {
  const was = new Set(before);
  const is = new Set(after);
  const removed = new Set(before.filter((name) => !is.has(name)));
  const added = new Set(after.filter((name) => !was.has(name)));
  const renamed: { from: string; to: string }[] = [];
  for (const entry of withChains(declared)) {
    if (removed.has(entry.from) && added.has(entry.to)) {
      removed.delete(entry.from);
      added.delete(entry.to);
      renamed.push({ from: entry.from, to: entry.to });
    }
  }
  renamed.sort(byFrom);
  return { added: sorted(added), removed: sorted(removed), renamed };
}

function compareParts(
  before: readonly string[],
  after: readonly string[],
  moves: readonly Rename[],
  sourceSurvives: (part: string) => boolean,
): NameChanges {
  const was = new Set(before);
  const is = new Set(after);
  const removed = new Set(before.filter((name) => !is.has(name)));
  const added = new Set(after.filter((name) => !was.has(name)));
  const renamed: { from: string; to: string }[] = [];
  for (const entry of moves) {
    if (removed.delete(entry.from)) {
      renamed.push({ from: entry.from, to: entry.to });
      added.delete(entry.to);
    } else if (added.has(entry.to)) {
      added.delete(entry.to);
      if (!sourceSurvives(entry.from)) renamed.push({ from: entry.from, to: entry.to });
    }
  }
  renamed.sort(byFrom);
  return { added: sorted(added), removed: sorted(removed), renamed };
}

function splitUnion(text: string): string[] {
  const members: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (quote !== "") {
      current += char;
      if (char === "\\") {
        current += text[index + 1] ?? "";
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("([{<".includes(char)) depth += 1;
    else if (")]}".includes(char) || (char === ">" && text[index - 1] !== "=")) depth -= 1;
    if (char === "|" && depth === 0) {
      members.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  members.push(current.trim());
  return [...new Set(members.filter((member) => member !== ""))];
}

function directionOf(
  table: string,
  wasFlows: Readonly<Record<string, Flow>> | undefined,
  isFlows: Readonly<Record<string, Flow>> | undefined,
  wasPresent: boolean,
  isPresent: boolean,
): Direction {
  const side = (flows: Readonly<Record<string, Flow>> | undefined): Direction =>
    flows?.[table] ?? (table.endsWith("Details") ? "out" : "in");
  if (!wasPresent) return side(isFlows);
  if (!isPresent) return side(wasFlows);
  const was = side(wasFlows);
  const is = side(isFlows);
  return was === is ? was : "both";
}

function compareTable(
  before: readonly string[] | undefined,
  after: readonly string[] | undefined,
  wasDefinition: string | undefined,
  isDefinition: string | undefined,
  declared: readonly Rename[],
  direction: Direction,
): TableChanges {
  const wasRows = listOf(before);
  const isRows = listOf(after);
  const names = compare(
    wasRows.map(bare),
    isRows.map(bare),
    declared.map((entry) => ({ ...entry, from: bare(entry.from), to: bare(entry.to) })),
  );
  const wasOptional = new Set(wasRows.filter((row) => row.endsWith("?")).map(bare));
  const isOptional = new Set(isRows.filter((row) => row.endsWith("?")).map(bare));
  const kept = wasRows.map(bare).filter((name) => isRows.some((row) => bare(row) === name));
  let definition: DefinitionChange | null = null;
  if (wasDefinition !== isDefinition) {
    const wasMembers = splitUnion(wasDefinition ?? "");
    const isMembers = splitUnion(isDefinition ?? "");
    definition = {
      from: wasDefinition ?? null,
      to: isDefinition ?? null,
      added: isMembers.filter((member) => !wasMembers.includes(member)),
      removed: wasMembers.filter((member) => !isMembers.includes(member)),
    };
  }
  return {
    ...names,
    table: before === undefined ? "added" : after === undefined ? "removed" : null,
    direction,
    addedRequired: before === undefined ? [] : names.added.filter((name) => !isOptional.has(name)),
    optional: sorted(kept.filter((name) => !wasOptional.has(name) && isOptional.has(name))),
    required: sorted(kept.filter((name) => wasOptional.has(name) && !isOptional.has(name))),
    definition,
  };
}

function isEmptyTable(changes: TableChanges): boolean {
  return (
    isEmpty(changes) &&
    changes.table === null &&
    changes.optional.length === 0 &&
    changes.required.length === 0 &&
    changes.definition === null
  );
}

interface Names {
  readonly tokens?: readonly string[];
  readonly reads?: readonly string[];
  readonly hooks?: readonly string[];
  readonly channels?: readonly string[];
}

function categoryIn(names: Names, name: string): Own | null {
  for (const [key, category] of KEYS) {
    if (listOf(names[key]).includes(name)) return category;
  }
  return null;
}

function compareNames(
  before: Names,
  after: Names,
  renames: Readonly<Record<Key, readonly Rename[]>>,
): Pick<SheetChanges, Key | "reclassified"> {
  const found = new Map<string, Reclassified>();
  const changes = {} as Record<Key, NameChanges>;
  for (const [key, category] of KEYS) {
    const raw = compare(listOf(before[key]), listOf(after[key]), renames[key]);
    const removed: string[] = [];
    for (const name of raw.removed) {
      const to = categoryIn(after, name);
      if (to === null) removed.push(name);
      else found.set(name, { name, from: category, to });
    }
    const added: string[] = [];
    for (const name of raw.added) {
      const from = categoryIn(before, name);
      if (from === null) added.push(name);
      else if (!found.has(name)) found.set(name, { name, from, to: category });
    }
    changes[key] = { added, removed, renamed: raw.renamed };
  }
  return {
    ...changes,
    reclassified: [...found.values()].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    ),
  };
}

function compareComponent(
  names: readonly string[],
  before: ManifestComponent,
  after: ManifestComponent,
  renames: readonly Rename[],
  renamedFrom: string | null,
  partMoves: readonly Rename[],
  sourceSurvives: (part: string) => boolean,
  globals: ReadonlySet<string>,
): ComponentChanges {
  const own = (kind: RenameKind): Rename[] =>
    renames.filter(
      (entry) =>
        entry.kind === kind && entry.component !== undefined && names.includes(entry.component),
    );
  const parts = compareParts(
    before.parts.map((entry) => entry.part),
    after.parts.map((entry) => entry.part),
    partMoves,
    sourceSurvives,
  );
  const named = compareNames(before, after, {
    tokens: own("token"),
    reads: renames.filter((entry) => entry.kind === "token"),
    hooks: own("hook"),
    channels: [],
  });
  // A global the component starts to declare shadows the consumer's value on
  // `:root` inside its scope: the lever stops reaching it.
  const wasTokens = new Set(listOf(before.tokens));
  const shadowed = listOf(after.tokens).filter((name) => globals.has(name) && !wasTokens.has(name));
  const isShadowed = new Set(shadowed);
  const props: Record<string, TableChanges> = {};
  const was = before.props as ManifestComponent["props"] | undefined;
  const is = after.props as ManifestComponent["props"] | undefined;
  const wasAliases = before.aliases as ManifestComponent["aliases"] | undefined;
  const isAliases = after.aliases as ManifestComponent["aliases"] | undefined;
  const wasFlows = before.flows as ManifestComponent["flows"] | undefined;
  const isFlows = after.flows as ManifestComponent["flows"] | undefined;
  if (was !== undefined && is !== undefined) {
    for (const table of sorted(new Set([...Object.keys(was), ...Object.keys(is)]))) {
      const changes = compareTable(
        was[table],
        is[table],
        wasAliases?.[table],
        isAliases?.[table],
        own("prop").filter((entry) => entry.table === table),
        directionOf(table, wasFlows, isFlows, was[table] !== undefined, is[table] !== undefined),
      );
      if (!isEmptyTable(changes)) props[table] = changes;
    }
  }
  return {
    parts,
    ...named,
    tokens: {
      ...named.tokens,
      added: named.tokens.added.filter((name) => !isShadowed.has(name)),
    },
    reclassified: named.reclassified.filter(
      (entry) => !(entry.to === "token" && isShadowed.has(entry.name)),
    ),
    props,
    composed:
      before.composed === after.composed ? null : { from: before.composed, to: after.composed },
    renamedFrom,
    shadowed,
  };
}

function hasChanges(changes: ComponentChanges): boolean {
  return (
    changes.shadowed.length > 0 ||
    !isEmpty(changes.parts) ||
    hasNameChanges(changes) ||
    Object.keys(changes.props).length > 0 ||
    changes.composed !== null ||
    changes.renamedFrom !== null
  );
}

function hasNameChanges(changes: SheetChanges): boolean {
  return (
    !isEmpty(changes.tokens) ||
    !isEmpty(changes.reads) ||
    !isEmpty(changes.hooks) ||
    !isEmpty(changes.channels) ||
    changes.reclassified.length > 0
  );
}

function breaks(changes: NameChanges): boolean {
  return changes.removed.length > 0 || changes.renamed.length > 0;
}

function sheetBreaks(changes: SheetChanges): boolean {
  return (
    breaks(changes.tokens) ||
    breaks(changes.reads) ||
    breaks(changes.hooks) ||
    changes.reclassified.some((entry) => entry.to === "channel")
  );
}

const GLOBAL_DESTINATIONS: readonly Own[] = ["token", "hook", "read", "channel"];

function tableBreaks(changes: TableChanges): boolean {
  if (breaks(changes)) return true;
  const { direction, definition } = changes;
  const asInput = direction !== "out";
  const asOutput = direction !== "in";
  if (asInput && (changes.required.length > 0 || changes.addedRequired.length > 0)) return true;
  if (asOutput && changes.optional.length > 0) return true;
  if (definition === null) return false;
  if (asInput && definition.removed.length > 0) return true;
  if (asOutput && changes.table !== "added" && definition.added.length > 0) return true;
  return direction === "out" && changes.table === "removed" && definition.removed.length > 0;
}

export function sheetsOf(
  manifest: ComponentManifest,
): Readonly<Record<string, SheetNames>> | undefined {
  return manifest.sheets as ComponentManifest["sheets"] | undefined;
}

export function diffManifests(
  before: ComponentManifest,
  after: ComponentManifest,
  renames: readonly Rename[],
): ManifestDiff {
  const components = compare(
    Object.keys(before.components),
    Object.keys(after.components),
    renames.filter((entry) => entry.kind === "component"),
  );
  const globalRaw = compare(
    listOf(before.tokens),
    listOf(after.tokens),
    renames.filter((entry) => entry.kind === "token" && entry.component === undefined),
  );
  const afterSheets = sheetsOf(after);
  const holders: Names[] = [
    ...Object.values(after.components),
    ...Object.values(afterSheets ?? {}),
  ];
  const reclassified: Reclassified[] = [];
  const globalRemoved: string[] = [];
  for (const name of globalRaw.removed) {
    const found = new Set(holders.map((holder) => categoryIn(holder, name)));
    const to = GLOBAL_DESTINATIONS.find((category) => found.has(category));
    if (to === undefined) globalRemoved.push(name);
    else reclassified.push({ name, from: "global", to });
  }
  const tokens: NameChanges = {
    added: globalRaw.added,
    removed: globalRemoved,
    renamed: globalRaw.renamed,
  };
  const origin = new Map(components.renamed.map((entry) => [entry.to, entry.from]));
  const owner = new Map<string, string>();
  for (const [name, entry] of Object.entries(before.components)) {
    for (const part of entry.parts) owner.set(part.part, name);
  }
  const wasParts = new Set(owner.keys());
  const isParts = new Set(
    Object.values(after.components).flatMap((entry) => entry.parts.map((part) => part.part)),
  );
  const partMoves = withChains(renames.filter((entry) => entry.kind === "part")).filter(
    (entry) =>
      wasParts.has(entry.from) &&
      !isParts.has(entry.from) &&
      isParts.has(entry.to) &&
      !wasParts.has(entry.to),
  );
  const survivors = new Set(
    Object.keys(after.components)
      .map((name) => origin.get(name) ?? name)
      .filter((name) => before.components[name] !== undefined),
  );
  const sourceSurvives = (part: string): boolean => {
    const holder = owner.get(part);
    return holder !== undefined && survivors.has(holder);
  };
  const afterGlobals = new Set(listOf(after.tokens));
  const changed: Record<string, ComponentChanges> = {};
  for (const name of sorted(Object.keys(after.components))) {
    const previous = origin.get(name) ?? name;
    const was = before.components[previous];
    const is = after.components[name];
    if (was === undefined || is === undefined) continue;
    const changes = compareComponent(
      previous === name ? [name] : [previous, name],
      was,
      is,
      renames,
      previous === name ? null : previous,
      partMoves,
      sourceSurvives,
      afterGlobals,
    );
    if (hasChanges(changes)) changed[name] = changes;
  }
  const beforeSheets = sheetsOf(before);
  const sheets: NameChanges =
    beforeSheets === undefined || afterSheets === undefined
      ? { added: [], removed: [], renamed: [] }
      : compare(Object.keys(beforeSheets), Object.keys(afterSheets), []);
  const sheetChanged: Record<string, SheetChanges> = {};
  if (beforeSheets !== undefined && afterSheets !== undefined) {
    for (const name of sorted(Object.keys(afterSheets))) {
      const was = beforeSheets[name];
      const is = afterSheets[name];
      if (was === undefined || is === undefined) continue;
      const own = (kind: RenameKind): Rename[] =>
        renames.filter((entry) => entry.kind === kind && entry.component === name);
      const changes = compareNames(was, is, {
        tokens: own("token"),
        reads: renames.filter((entry) => entry.kind === "token"),
        hooks: own("hook"),
        channels: [],
      });
      if (hasNameChanges(changes)) sheetChanged[name] = changes;
    }
  }
  const breaking =
    breaks(components) ||
    breaks(tokens) ||
    reclassified.some((entry) => entry.to !== "hook") ||
    breaks(sheets) ||
    Object.values(sheetChanged).some((entry) => sheetBreaks(entry)) ||
    Object.values(changed).some(
      (entry) =>
        entry.shadowed.length > 0 ||
        breaks(entry.parts) ||
        sheetBreaks(entry) ||
        Object.values(entry.props).some((table) => tableBreaks(table)),
    );
  return {
    breaking,
    components,
    tokens,
    reclassified: reclassified.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    sheets,
    sheetChanged,
    changed,
  };
}

function pick<T>(record: Readonly<Record<string, T>>, keep: (name: string) => boolean) {
  return Object.fromEntries(Object.entries(record).filter(([name]) => keep(name)));
}

export function restrictDiff(diff: ManifestDiff, installed: ReadonlySet<string>): ManifestDiff {
  const keep = (name: string): boolean => installed.has(name);
  const names = (changes: NameChanges): NameChanges => ({
    added: changes.added.filter(keep),
    removed: changes.removed.filter(keep),
    renamed: changes.renamed.filter((entry) => keep(entry.from) || keep(entry.to)),
  });
  const components = names(diff.components);
  const sheets = names(diff.sheets);
  const sheetChanged = pick(diff.sheetChanged, keep);
  const changed = pick(diff.changed, keep);
  const none: NameChanges = { added: [], removed: [], renamed: [] };
  const breaking =
    breaks(components) ||
    breaks(sheets) ||
    Object.values(sheetChanged).some((entry) => sheetBreaks(entry)) ||
    Object.values(changed).some(
      (entry) =>
        entry.shadowed.length > 0 ||
        breaks(entry.parts) ||
        sheetBreaks(entry) ||
        Object.values(entry.props).some((table) => tableBreaks(table)),
    );
  return {
    breaking,
    components,
    tokens: none,
    reclassified: [],
    sheets,
    sheetChanged,
    changed,
  };
}

function bullets(
  lines: string[],
  noun: string,
  feminine: boolean,
  changes: NameChanges,
  where = "",
): void {
  const e = feminine ? "e" : "";
  for (const name of changes.added) lines.push(`- ${noun} ajouté${e}${where} : \`${name}\``);
  for (const name of changes.removed) lines.push(`- ${noun} retiré${e}${where} : \`${name}\``);
  for (const entry of changes.renamed) {
    lines.push(`- ${noun} renommé${e}${where} : \`${entry.from}\` → \`${entry.to}\``);
  }
}

function nameBullets(lines: string[], changes: SheetChanges): void {
  bullets(lines, "token", false, changes.tokens);
  bullets(lines, "lecture", true, changes.reads);
  bullets(lines, "hook", false, changes.hooks);
  bullets(lines, "canal", false, changes.channels);
  reclassifiedBullets(lines, changes.reclassified);
}

function reclassifiedBullets(lines: string[], list: readonly Reclassified[]): void {
  for (const entry of list) {
    lines.push(
      `- reclassé : \`${entry.name}\` (${CATEGORY_LABEL[entry.from]} → ${CATEGORY_LABEL[entry.to]})`,
    );
  }
}

function tableBullets(lines: string[], table: string, changes: TableChanges): void {
  const where = ` dans \`${table}\``;
  if (changes.table === "added") lines.push(`- table ajoutée : \`${table}\``);
  if (changes.table === "removed") lines.push(`- table retirée : \`${table}\``);
  bullets(lines, "prop", true, changes, where);
  for (const name of changes.addedRequired) {
    lines.push(`- prop obligatoire ajoutée${where} : \`${name}\``);
  }
  for (const name of changes.optional) {
    lines.push(`- prop devenue optionnelle${where} : \`${name}\``);
  }
  for (const name of changes.required) {
    lines.push(`- prop devenue obligatoire${where} : \`${name}\``);
  }
  const definition = changes.definition;
  if (definition === null) return;
  if (definition.from !== null && definition.to !== null) {
    lines.push(`- définition changée${where} : \`${definition.from}\` → \`${definition.to}\``);
  }
  for (const member of definition.added) lines.push(`- membre ajouté${where} : \`${member}\``);
  for (const member of definition.removed) lines.push(`- membre retiré${where} : \`${member}\``);
}

export function renderDiff(diff: ManifestDiff): string {
  const names = sorted(
    new Set([...diff.components.added, ...diff.components.removed, ...Object.keys(diff.changed)]),
  );
  const sheetNames = sorted(
    new Set([...diff.sheets.added, ...diff.sheets.removed, ...Object.keys(diff.sheetChanged)]),
  );
  const globalChanged = !isEmpty(diff.tokens) || diff.reclassified.length > 0;
  if (names.length === 0 && sheetNames.length === 0 && !globalChanged) return "Aucun changement.\n";
  const lines: string[] = [];
  if (diff.breaking) lines.push("**Rupture**", "");
  if (globalChanged) {
    lines.push("## Tokens globaux", "");
    bullets(lines, "token", false, diff.tokens);
    reclassifiedBullets(lines, diff.reclassified);
    lines.push("");
  }
  for (const name of sheetNames) {
    lines.push(`## Feuille ${name}`, "");
    if (diff.sheets.added.includes(name)) lines.push("- feuille ajoutée");
    if (diff.sheets.removed.includes(name)) lines.push("- feuille retirée");
    const changes = diff.sheetChanged[name];
    if (changes !== undefined) nameBullets(lines, changes);
    lines.push("");
  }
  for (const name of names) {
    lines.push(`## ${name}`, "");
    if (diff.components.added.includes(name)) lines.push("- composant ajouté");
    if (diff.components.removed.includes(name)) lines.push("- composant retiré");
    const changes = diff.changed[name];
    if (changes !== undefined) {
      if (changes.renamedFrom !== null) {
        lines.push(`- composant renommé : \`${changes.renamedFrom}\` → \`${name}\``);
      }
      bullets(lines, "part", true, changes.parts);
      for (const token of changes.shadowed) {
        lines.push(
          `- token global redéclaré : \`${token}\` (sa valeur sur \`:root\` n'atteint plus le composant)`,
        );
      }
      nameBullets(lines, changes);
      for (const [table, tableChanges] of Object.entries(changes.props)) {
        tableBullets(lines, table, tableChanges);
      }
      if (changes.composed !== null) {
        lines.push(`- composé changé : \`${changes.composed.from}\` → \`${changes.composed.to}\``);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
