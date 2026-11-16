/**
 * The props tables on the documentation site, read from the source that declares
 * them rather than from a second description of it.
 *
 * **Why source and not the emitted `.d.ts`.** They carry the same text:
 * `isolatedDeclarations` forbids inference, so every exported member is already
 * annotated by hand and the declaration emit is a mechanical restatement —
 * compared field by field on `button.types.ts`, the two differ only by the
 * `export` keyword, the `.js` extensions and blank lines. Reading source also
 * means the tables can be regenerated on a clean checkout with no `dist`
 * anywhere, which is the property the `typecheck` job holds.
 *
 * **Why oxc and not the TypeScript API.** `react-docgen-typescript` cannot run
 * while TS 7 is the root toolchain (`ts.sys` and `ts.createProgram` are
 * `undefined`), and it resolves `typescript` from the root `node_modules`, so a
 * local TS 6 in the app would not reach it. oxc is already in the build chain.
 *
 * **What this does not do: resolve types.** It reports what an interface
 * declares and the names it extends, never a flattened view of the two. Doing
 * otherwise means reimplementing type resolution, which is the very thing that
 * is unavailable — and the guess would be silent when it was wrong. The core's
 * `<X>MachineProps` are flat (every `extends` in `packages/core/src/components`
 * is on a `Resolved…` twin), so for them "what it declares" is the whole story;
 * a React `<X>ComposedProps` extends, and its table says so instead of pretending.
 *
 * **What it does do: define what it cites.** Not flattening is not an excuse for
 * printing a name and nothing else. A row reading `detent?: DrawerDetent` used to
 * be the end of the trail — the artifact named 158 capitalised tokens and defined
 * none of them, so narrowing `DrawerDetent` from `number` to `0 | 0.5 | 1`
 * changed the library's public API and left every committed file byte-identical.
 * A drift guard cannot catch what the artifact never wrote down.
 *
 * So every cited name is looked up, and the boundary is the component's own two
 * folders. That bound is not a budget, it is the shape of the thing: measured
 * against the committed tables, following citations with no bound at all reaches
 * 734 tables (`menu` alone goes from 2 to 38, eight hops deep) and stops being a
 * reference page; stopping at the folder reaches 285, and what falls outside is
 * 25 names — `ColorValue`, `Placement`, `Orientation`, `PartProps`,
 * `MachineRuntimeProps`, the `Composed*` family — which is not a remainder but
 * the library's shared vocabulary, owed one page rather than thirty-nine copies.
 * Those are reported by name, never dropped in silence.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";
import { toKebabCase } from "../packages/core/src/utils/string";

/** Where a member was declared, so a reader of the table can go and check it. */
export interface ApiSource {
  /** The file's base name — unambiguous within one component's own tables. */
  readonly file: string;
  /** 1-based, as an editor counts. */
  readonly line: number;
}

/** One row of a props table. `type` is the author's own text, sliced from source. */
export interface ApiMember {
  readonly name: string;
  readonly optional: boolean;
  readonly type: string;
  readonly doc: string | undefined;
  /** The banner this member sits under, where its author wrote one. */
  readonly group: string | undefined;
  readonly source: ApiSource;
}

export interface ApiInterface {
  readonly name: string;
  /** Written as declared — `Omit<PartProps<"div">, "children">` stays that shape. */
  readonly extendsNames: readonly string[];
  readonly members: readonly ApiMember[];
}

type Node = { readonly type: string; readonly start: number; readonly end: number } & Record<
  string,
  unknown
>;

type Comment = {
  readonly type: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
};

function asNode(value: unknown): Node | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const node = value as Record<string, unknown>;
  return typeof node.type === "string" ? (node as Node) : undefined;
}

/**
 * `// --- value -----------` → `value`. Anything else → `undefined`.
 *
 * One matcher rather than one per reader, because two readers of the same
 * convention are two things that can disagree: `docFor` has to step over a
 * banner and `groupFor` has to claim it, and a banner only one of them
 * recognised would be a member that silently lost its JSDoc.
 *
 * A label must hold a letter. Without that test a rule of plain dashes, which is
 * a divider and not a heading, would be read as a group named `---`.
 */
function bannerLabel(comment: Comment): string | undefined {
  if (comment.type !== "Line") return undefined;
  const text = /^\s*-{3,}\s*(.*?)\s*-{3,}\s*$/.exec(comment.value)?.[1];
  return text !== undefined && /[a-z]/i.test(text) ? text : undefined;
}

/**
 * The JSDoc immediately above a member, and nothing further away: a comment is
 * claimed only when everything between it and the member is whitespace. Without
 * that test the last comment in the file would be attached to every member that
 * has none of its own.
 *
 * A banner between the JSDoc and its member is stepped over rather than treated
 * as the nearest comment. It is the one shape that would make the two features
 * fight: the banner would be the last comment before the member, `docFor` would
 * refuse it for not being a block, and the member's documentation would vanish
 * from the site with nothing to say it had. Grouping must never cost a note.
 */
function docFor(source: string, comments: readonly Comment[], start: number): string | undefined {
  let candidate: Comment | undefined;
  // The banners standing between the candidate and the member, and only those:
  // the list is emptied whenever a later candidate is found, so what survives is
  // exactly what has to be cut out of the gap below.
  const between: Comment[] = [];
  for (const comment of comments) {
    if (comment.end > start) break;
    if (bannerLabel(comment) !== undefined) {
      between.push(comment);
      continue;
    }
    candidate = comment;
    between.length = 0;
  }
  if (candidate === undefined) return undefined;
  if (candidate.type !== "Block" || !candidate.value.startsWith("*")) return undefined;
  // Skipping the banner above is only half of it. The whitespace test reads the
  // *source* between the two, where the banner's own text still sits, so a
  // candidate reached by stepping over one would be thrown away here instead.
  // Cut back to front, so the earlier offsets stay valid.
  let gap = source.slice(candidate.end, start);
  for (let index = between.length - 1; index >= 0; index -= 1) {
    const banner = between[index] as Comment;
    gap = gap.slice(0, banner.start - candidate.end) + gap.slice(banner.end - candidate.end);
  }
  if (gap.trim() !== "") return undefined;
  const text = candidate.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*+/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? undefined : text;
}

/**
 * A member's banner — `// --- value ------------` — where its author wrote one.
 *
 * Six of the library's largest interfaces already divide their members this way,
 * and the generator used to drop it on the floor: a forty-nine row table reached
 * the site as forty-nine undifferentiated rows while the source it was read from
 * had said `value`, `surface`, `control`. Nothing is invented here. A table is
 * grouped exactly when its author grouped it, and the heading is their words.
 *
 * Bounded to the interface, and the bound is the whole safety of it: the same
 * convention divides *top-level declarations* too — `// --- prop-getter inputs`
 * sits above `SelectItemProps` in three of these files, outside any interface —
 * so a search that merely took the nearest banner above a member would stamp
 * that heading onto every member of seven types it says nothing about.
 *
 * The last banner and not the nearest thing that looks like one: a comment this
 * does not recognise leaves the group in force, so a member documented between
 * two banners stays in the run its author opened.
 */
function groupFor(
  comments: readonly Comment[],
  interfaceStart: number,
  memberStart: number,
): string | undefined {
  let label: string | undefined;
  for (const comment of comments) {
    if (comment.start <= interfaceStart) continue;
    if (comment.end > memberStart) break;
    label = bannerLabel(comment) ?? label;
  }
  return label;
}

/**
 * The 1-based line an offset falls on.
 *
 * Written here because oxc does not offer it: every node it returns carries byte
 * offsets and nothing else — no `loc`, no `line`, and no parser option that adds
 * one. Counting is cheap enough at this size (a component's types file, a few
 * dozen members); a precomputed table of line starts would only pay off on files
 * thousands of lines long.
 */
function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

/**
 * `| undefined` is dropped from an optional member's type. The repo writes it on
 * every one of them because `exactOptionalPropertyTypes` is on; repeating it in a
 * column beside a name already marked `?` is noise, not information.
 */
function typeTextOf(source: string, member: Node, optional: boolean): string {
  const annotation = asNode(member.typeAnnotation);
  const inner = annotation === undefined ? undefined : asNode(annotation.typeAnnotation);
  if (inner === undefined) return "unknown";
  const raw = source.slice(inner.start, inner.end).replace(/\s+/g, " ").trim();
  return optional ? raw.replace(/\s*\|\s*undefined$/, "") : raw;
}

/**
 * A method's signature with its name taken off — `(params: object): EffectCleanup`.
 *
 * Kept as written, `:` before the return type and all, and not rewritten to the
 * arrow form a property would use: the two differ in how their parameters are
 * checked (a method's are bivariant), and that difference is the reason an
 * interface is written in methods at all — decision 65 does it so a public type
 * need not name the machine's schema. A table that showed `=>` would state the
 * stricter contract.
 *
 * Sliced from the end of the key and not from the first `(`, because a type
 * parameter list comes before it; the optional marker, which sits between the
 * two, is already the row's `optional` and is cut from the text.
 */
function methodTypeOf(source: string, member: Node, key: Node): string {
  const returned = asNode(member.returnType);
  const end = returned === undefined ? member.end : returned.end;
  return source
    .slice(key.end, end)
    .replace(/^\s*\?/, "")
    .replace(/[;,]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** An exported `type X = …`, kept as the author's text — see `InputComposedProps`. */
export interface ApiTypeAlias {
  readonly name: string;
  readonly text: string;
}

type Declaration = { readonly node: Node; readonly name: string };

/**
 * Every exported declaration of one AST kind, in source order. Names are matched
 * by the caller rather than by this function, because the two interesting
 * questions are "is it called exactly this" and "does it end in this" — `toast`
 * declares `ToastGroupMachineProps`, and a table keyed on the folder name would
 * have missed it while reporting nothing at all.
 */
function declarations(
  source: string,
  fileName: string,
  kind: string,
): {
  readonly comments: readonly Comment[];
  readonly found: readonly Declaration[];
} {
  const parsed = parseSync(fileName, source);
  const found: Declaration[] = [];
  for (const statement of parsed.program.body) {
    const node = asNode(statement);
    if (node === undefined) continue;
    const declaration = node.type === "ExportNamedDeclaration" ? asNode(node.declaration) : node;
    if (declaration === undefined || declaration.type !== kind) continue;
    const id = asNode(declaration.id);
    if (typeof id?.name === "string") found.push({ node: declaration, name: id.name });
  }
  return { comments: parsed.comments as readonly Comment[], found };
}

function toInterface(
  source: string,
  comments: readonly Comment[],
  entry: Declaration,
  fileName: string,
): ApiInterface {
  const extendsNames: string[] = [];
  for (const heritage of (entry.node.extends as unknown[] | null) ?? []) {
    const node = asNode(heritage);
    if (node !== undefined) extendsNames.push(source.slice(node.start, node.end).trim());
  }

  const members: ApiMember[] = [];
  const body = asNode(entry.node.body);
  for (const child of (body?.body as unknown[] | undefined) ?? []) {
    const member = asNode(child);
    if (member === undefined) continue;
    const isMethod = member.type === "TSMethodSignature" && member.kind === "method";
    if (member.type !== "TSPropertySignature" && !isMethod) continue;
    const key = asNode(member.key);
    const keyName =
      typeof key?.name === "string"
        ? key.name
        : key?.type === "Literal" && typeof key.value === "string"
          ? key.value
          : undefined;
    if (key === undefined || keyName === undefined) continue;
    // A computed key's name is the expression inside the brackets, and the slice
    // below starts at the key's end: it would begin on the `]`.
    if (isMethod && member.computed === true) continue;
    const optional = member.optional === true;
    members.push({
      name: keyName,
      optional,
      type: isMethod ? methodTypeOf(source, member, key) : typeTextOf(source, member, optional),
      doc: docFor(source, comments, member.start),
      group: groupFor(comments, entry.node.start, member.start),
      // `member.start` and not the JSDoc's: the line wanted is the declaration's,
      // which is where a reader lands and what a diff moves.
      source: { file: path.basename(fileName), line: lineOf(source, member.start) },
    });
  }

  return { name: entry.name, extendsNames, members };
}

/**
 * The first exported interface whose name the predicate accepts. Returns
 * `undefined` rather than throwing when there is none: a component that declares
 * no such interface is a normal state, and the caller decides whether to report it.
 */
export function findInterface(
  source: string,
  fileName: string,
  matches: (name: string) => boolean,
): ApiInterface | undefined {
  const { comments, found } = declarations(source, fileName, "TSInterfaceDeclaration");
  const entry = found.find((candidate) => matches(candidate.name));
  return entry === undefined ? undefined : toInterface(source, comments, entry, fileName);
}

export function readInterface(
  source: string,
  fileName: string,
  interfaceName: string,
): ApiInterface | undefined {
  return findInterface(source, fileName, (name) => name === interfaceName);
}

/**
 * The first exported type alias the predicate accepts, with its right-hand side
 * as written. `InputComposedProps` is an intersection and not an interface, so
 * without this the one component whose type carries a real rule — `revealLabel`
 * is mandatory under `type="password"` — would document nothing.
 */
export function findTypeAlias(
  source: string,
  fileName: string,
  matches: (name: string) => boolean,
): ApiTypeAlias | undefined {
  const { comments, found } = declarations(source, fileName, "TSTypeAliasDeclaration");
  const entry = found.find((candidate) => matches(candidate.name));
  if (entry === undefined) return undefined;
  const annotation = asNode(entry.node.typeAnnotation);
  if (annotation === undefined) return undefined;
  // The leading bar of a union written one member per line is in the slice, and
  // it is punctuation rather than a member: rendered as a definition it reads
  // `= | MenuRow | MenuSubmenu`. Dropped here, where the right-hand side is
  // minted, so every reader of `text` gets the same one.
  const text = sliceType(source, comments, annotation).replace(/^\|\s*/, "");
  return { name: entry.name, text };
}

/**
 * A type's own text, with any comment written *inside* it cut out.
 *
 * A union spread over several lines tends to explain itself member by member, and
 * slicing by offset keeps that prose. Left in, it reaches the site as part of the
 * type — and worse, it reaches the citation scan below, where an ordinary English
 * word sitting next to a capital letter becomes a type name to go and resolve.
 * Cut back to front so the earlier offsets stay valid.
 */
function sliceType(source: string, comments: readonly Comment[], node: Node): string {
  const inside = comments
    .filter((comment) => comment.start >= node.start && comment.end <= node.end)
    .sort((a, b) => b.start - a.start);
  let text = source.slice(node.start, node.end);
  for (const comment of inside) {
    text = text.slice(0, comment.start - node.start) + text.slice(comment.end - node.start);
  }
  return text.replace(/\s+/g, " ").trim();
}

const root = path.resolve(import.meta.dirname, "..");
const coreComponents = path.join(root, "packages/core/src/components");
const reactComponents = path.join(root, "packages/react/src/components");

// ---------------------------------------------------------------------------
// Resolving a cited name
// ---------------------------------------------------------------------------

interface DeclarationSite {
  readonly kind: "interface" | "alias";
  readonly file: string;
}

/**
 * Every capitalised identifier in a type's text.
 *
 * Deliberately not filtered against a list of built-ins. `Omit`, `Partial` and
 * `ReactNode` need no entry here because the only question asked of a name is
 * whether this repository declares it: a hand-kept list of everything TypeScript
 * and React own would be a second thing to maintain, and the one it forgot would
 * be resolved instead of skipped.
 */
function citedNames(text: string): string[] {
  return [...text.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)].map((match) => match[0]);
}

let index: Map<string, DeclarationSite[]> | undefined;

/**
 * Where each exported type name is declared, across both packages. Built once —
 * `collect()` runs several times in one test file, and the walk is the expensive
 * part. Names collide on purpose (`SelectItem` is declared in the core and again
 * in the adapter), so the sites are kept as a list and the caller picks; a
 * first-wins map would resolve half of them to the wrong package in silence.
 */
function declarationSites(): Map<string, DeclarationSite[]> {
  if (index !== undefined) return index;
  const found = new Map<string, DeclarationSite[]>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      // Tests declare throwaway interfaces with ordinary names; indexing them
      // would let a fixture answer for the real thing.
      if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
      const source = readFileSync(file, "utf8");
      for (const kind of ["interface", "alias"] as const) {
        const node = kind === "interface" ? "TSInterfaceDeclaration" : "TSTypeAliasDeclaration";
        for (const declaration of declarations(source, file, node).found) {
          const sites = found.get(declaration.name) ?? [];
          sites.push({ kind, file });
          found.set(declaration.name, sites);
        }
      }
    }
  };
  walk(path.join(root, "packages/core/src"));
  walk(path.join(root, "packages/react/src"));
  index = found;
  return found;
}

/**
 * Whether this repository declares a type of that name anywhere.
 *
 * Exported so the drift guard can tell a name it owes a definition for from one
 * it does not — `DrawerDetent` from `ReactNode` — by asking the same index the
 * generator asked, instead of re-deriving the answer from what the generator
 * already decided. A guard that reads its subject's own bookkeeping agrees with
 * it by construction.
 */
export function isDeclaredInRepo(name: string): boolean {
  return declarationSites().has(name);
}

/** The two folders a component owns — the bound on what its page defines. */
function ownFolders(component: string): string[] {
  return [path.join(coreComponents, component), path.join(reactComponents, component)];
}

/**
 * One cited name, as far as this component's page is allowed to follow it.
 *
 * `"own"` is a type the component declares and its page therefore defines.
 * `"shared"` is declared elsewhere in the library — reported by name so the
 * vocabulary page owes it a section. `"foreign"` is everything the repository
 * does not declare at all, which is `ReactNode` and `Omit` and a generic's `E`,
 * and is not this generator's business.
 */
type Citation =
  | { readonly kind: "own"; readonly site: DeclarationSite }
  // Three members and not two with a widened `kind`: ruling out both values of a
  // `"shared" | "foreign"` member leaves the member itself standing, so the
  // caller's `site` was unreachable to the compiler even where it is certain.
  | { readonly kind: "shared" }
  | { readonly kind: "foreign" };

function classify(component: string, name: string): Citation {
  const sites = declarationSites().get(name);
  if (sites === undefined) return { kind: "foreign" };
  const folders = ownFolders(component);
  const own = sites.find((site) =>
    folders.some((folder) => site.file.startsWith(folder + path.sep)),
  );
  return own === undefined ? { kind: "shared" } : { kind: "own", site: own };
}

/**
 * The names a component's page is allowed to cite without defining them.
 *
 * Written down rather than merely reported. A run that prints a notice is a run
 * whose notice stops being read, and the failure this whole file exists to
 * prevent is an API surface growing where nobody looks. Adding a type here is
 * cheap and takes one line; what it cannot be is accidental.
 *
 * Two kinds sit in one list because a page treats them alike. Most are genuinely
 * shared — `PartProps` reaches 37 components, `Direction` and
 * `MachineRuntimeProps` 33 — and live in `utils`, `a11y`, `types.ts` or
 * `create-part.tsx`. The rest are one component reaching into another's folder
 * (`alert-dialog` is typed over `DialogComposedProps`, `checkbox-group` over
 * `CheckboxRootProps`), which is a real dependency and equally not the citing
 * page's to define.
 */
export const SHARED_VOCABULARY: readonly string[] = [
  "AlertDialogActionProps",
  "CheckboxRootProps",
  "ColorChannel",
  "ColorFormat",
  "ColorValue",
  "ComposedAction",
  "ComposedDecoration",
  "ComposedGroup",
  "ComposedSeparator",
  "ComposedTrigger",
  "DateFieldRootProps",
  "DateValue",
  "DialogComposedProps",
  "Direction",
  "DismissReason",
  "EffectCleanup",
  "FirstDayOfWeek",
  "MachineRuntimeProps",
  "Orientation",
  "PartProps",
  "Placement",
  "Politeness",
  "PortalProps",
  "RangeMarks",
  "Rect",
];

/** A cited type, as the table that defines it. */
function tableFor(name: string, site: DeclarationSite): ApiTable {
  const source = readFileSync(site.file, "utf8");
  if (site.kind === "interface") {
    const api = readInterface(source, site.file, name);
    // An interface the index found and the reader did not is not reachable:
    // both walk the same exported declarations.
    return api === undefined
      ? { name, extends: undefined, definition: undefined, rows: [] }
      : (toTables([api])[0] as ApiTable);
  }
  const alias = findTypeAlias(source, site.file, (candidate) => candidate === name);
  // A union has no members, so its definition is the whole of what the table has
  // to say — and it says it in its own field. Writing it into `extends` was what
  // made the renderer print `— extends "label" | "count"`: the site cannot tell an
  // alias from an interface that inherits every member, and 37 of those exist.
  return { name, extends: undefined, definition: alias?.text, rows: [] };
}

/**
 * The seed tables plus every name they reach inside the component's own folders,
 * breadth-first so a type lands after whatever first mentioned it.
 */
function expand(
  component: string,
  seed: readonly ApiTable[],
): { readonly tables: ApiTable[]; readonly shared: string[] } {
  const defined = new Map(seed.map((table) => [table.name, table]));
  const shared = new Set<string>();
  const queue = [...seed];
  for (let head = 0; head < queue.length; head += 1) {
    const table = queue[head] as ApiTable;
    // Both fields, and the second is not decoration: an alias reaches its
    // neighbours only through its definition, so a walk that reads `extends`
    // alone stops pulling in everything `SelectEntry` or `MenuRow` names — the
    // closure quietly shrinks and the types come out cited but never defined.
    const texts = [table.extends ?? "", table.definition ?? ""];
    for (const text of [...texts, ...table.rows.map((row) => row.type)]) {
      for (const name of citedNames(text)) {
        if (defined.has(name)) continue;
        const verdict = classify(component, name);
        if (verdict.kind === "foreign") continue;
        if (verdict.kind === "shared") {
          shared.add(name);
          continue;
        }
        const added = tableFor(name, verdict.site);
        defined.set(name, added);
        queue.push(added);
      }
    }
  }
  return { tables: [...defined.values()], shared: [...shared].sort() };
}

export interface ComponentApi {
  readonly component: string;
  readonly interfaces: readonly ApiInterface[];
  /**
   * The alias a component's composed layer is actually typed as, where it has
   * one. `<Input/>` takes `InputComposedProps`, an intersection over the
   * interface beside it, and for as long as this was collected without being
   * rendered the page documented `InputBaseComposedProps` — a real type, not the
   * one the component takes. Narrowing the alias changed nothing on disk.
   */
  readonly aliases: readonly ApiTypeAlias[];
  /** Everything written for this component: the seed tables and their closure, then the anatomy and the CSS variables. */
  readonly tables: readonly ApiTable[];
  /** Cited, declared elsewhere in the library, owed a shared-vocabulary section. */
  readonly shared: readonly string[];
  /** What was looked for and not found, so a miss is reported and never silent. */
  readonly missing: readonly string[];
  /** The `<X>Anatomy` table, which `tables` carries after the props. */
  readonly anatomy: ApiTable | undefined;
  /** The `<X>CssVars` table, which `tables` carries after the anatomy. */
  readonly cssVars: ApiTable | undefined;
}

/** `date-picker` → `DatePicker`, which is how every interface here is named. */
export function pascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * `<name>.types.ts` where there is a machine, `<name>.ts` where there is not:
 * `badge`, `card`, `empty-state` and `separator` are presentational and keep
 * their props beside their connect. Both are read, in that order.
 */
function sourceFiles(component: string): string[] {
  return [
    path.join(coreComponents, component, `${component}.types.ts`),
    path.join(coreComponents, component, `${component}.ts`),
  ].filter((file) => existsSync(file));
}

function directoriesIn(parent: string): string[] {
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * By suffix and not by the folder name: `toast` declares
 * `ToastGroupMachineProps`, and a name built from the folder would have silently
 * documented nothing. `Resolved…` is the machine's post-defaults view of the same
 * props, never a consumer's input.
 */
function isMachineProps(name: string): boolean {
  return name.endsWith("MachineProps") && !name.startsWith("Resolved");
}

function isComposedProps(name: string): boolean {
  return name.endsWith("ComposedProps");
}

function isCssVars(name: string): boolean {
  return name.endsWith("CssVars");
}

/** One part of an anatomy, where its key is written in the `.parts(...)` call. */
export interface AnatomyPartSite {
  readonly key: string;
  /** What the element carries in `data-part`, scope included. */
  readonly part: string;
  readonly source: ApiSource;
}

export interface AnatomySite {
  readonly scope: string;
  readonly parts: readonly AnatomyPartSite[];
}

/**
 * The file that declares a component's `anatomy`: `<name>.anatomy.ts`, or
 * `<name>.ts` for the presentational components that keep it beside their connect.
 */
export function anatomyFile(component: string): string | undefined {
  return [`${component}.anatomy.ts`, `${component}.ts`]
    .map((file) => path.join(coreComponents, component, file))
    .find(
      (full) => existsSync(full) && /^export const anatomy\b/m.test(readFileSync(full, "utf8")),
    );
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const node = asNode(value);
  if (node === undefined) return;
  visit(node);
  for (const child of Object.values(node)) {
    if (typeof child === "object" && child !== null) walk(child, visit);
  }
}

function stringLiteral(value: unknown): { readonly text: string; readonly start: number } | null {
  const node = asNode(value);
  return node?.type === "Literal" && typeof node.value === "string"
    ? { text: node.value, start: node.start }
    : null;
}

/**
 * The scope and the parts of `createAnatomy("<scope>").parts("a", "b")`, each with
 * the line its key is written on. Read from source for the line, which no import
 * of the module can give.
 */
export function readAnatomy(component: string): AnatomySite | undefined {
  const file = anatomyFile(component);
  if (file === undefined) return undefined;
  const source = readFileSync(file, "utf8");
  const parsed = parseSync(file, source);
  let found: AnatomySite | undefined;
  walk(parsed.program.body, (node) => {
    if (found !== undefined || node.type !== "CallExpression") return;
    const callee = asNode(node.callee);
    if (callee?.type !== "MemberExpression" || asNode(callee.property)?.name !== "parts") return;
    const created = asNode(callee.object);
    if (created?.type !== "CallExpression" || asNode(created.callee)?.name !== "createAnatomy") {
      return;
    }
    const scope = stringLiteral((created.arguments as unknown[])[0]);
    if (scope === null) return;
    const parts: AnatomyPartSite[] = [];
    for (const argument of node.arguments as unknown[]) {
      const key = stringLiteral(argument);
      if (key === null) continue;
      parts.push({
        key: key.text,
        part: `${scope.text}:${toKebabCase(key.text)}`,
        source: { file: path.basename(file), line: lineOf(source, key.start) },
      });
    }
    found = { scope: scope.text, parts };
  });
  return found;
}

function isSourceFile(name: string): boolean {
  return /\.tsx?$/.test(name) && !/\.(test|parity)\./.test(name);
}

function filesIn(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isSourceFile(entry.name))
    .map((entry) => path.join(folder, entry.name))
    .sort();
}

/**
 * The React component a part is rendered by, when the folder exports one under the
 * name the library gives them — `TooltipTrigger` for `tooltip` and `trigger`.
 */
function reactPartNames(component: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const file of filesIn(path.join(reactComponents, component))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g,
    )) {
      names.add(match[1] as string);
    }
  }
  return names;
}

function anatomyTable(component: string): ApiTable | undefined {
  const anatomy = readAnatomy(component);
  if (anatomy === undefined) return undefined;
  const exported = reactPartNames(component);
  const prefix = pascalCase(component);
  return {
    name: `${prefix}Anatomy`,
    extends: undefined,
    definition: undefined,
    rows: anatomy.parts.map((part) => {
      const candidate = `${prefix}${part.key.charAt(0).toUpperCase()}${part.key.slice(1)}`;
      return {
        name: part.key,
        type: `[data-part~="${part.part}"]`,
        notes: exported.has(candidate) ? candidate : "",
        source: `${part.source.file}:${part.source.line}`,
        group: undefined,
      };
    }),
  };
}

/** The component's `<X>CssVars` interface, core files first and then React's. */
function findCssVars(component: string): ApiInterface | undefined {
  const folders = [path.join(coreComponents, component), path.join(reactComponents, component)];
  for (const file of folders.flatMap(filesIn)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("CssVars")) continue;
    const found = findInterface(source, file, isCssVars);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function sharedReactCssVars(): ApiTable[] {
  const tables: ApiTable[] = [];
  for (const file of filesIn(path.join(root, "packages/react/src"))) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("CssVars")) continue;
    const found = findInterface(source, file, isCssVars);
    if (found !== undefined) tables.push(...toTables([found]));
  }
  return tables;
}

export function collect(): ComponentApi[] {
  // The union of both packages, not the core's list: `alert-dialog` is a React
  // composed layer over the dialog machine and has no core folder at all, so
  // walking core alone would drop the one component that exists only up here.
  const components = [
    ...new Set([...directoriesIn(coreComponents), ...directoriesIn(reactComponents)]),
  ].sort();

  const collected: ComponentApi[] = [];
  for (const component of components) {
    const interfaces: ApiInterface[] = [];
    const aliases: ApiTypeAlias[] = [];
    const missing: string[] = [];

    const files = sourceFiles(component);
    let machine: ApiInterface | undefined;
    for (const file of files) {
      machine = findInterface(readFileSync(file, "utf8"), file, isMachineProps);
      if (machine !== undefined) break;
    }
    // A miss is "the file is there and the interface is not". A component with no
    // core folder at all is `alert-dialog`, which is a React layer over another
    // machine — reporting it would train the reader to ignore this list.
    if (machine === undefined && files.length > 0) {
      missing.push(`${pascalCase(component)}MachineProps`);
    } else if (machine !== undefined) {
      interfaces.push(machine);
    }

    // Only the components with a composed layer declare one, so its absence is
    // read from the file and never reported as a miss.
    const composedFile = path.join(reactComponents, component, "composed.tsx");
    if (existsSync(composedFile)) {
      const source = readFileSync(composedFile, "utf8");
      const composed = findInterface(source, composedFile, isComposedProps);
      if (composed === undefined) missing.push(`${pascalCase(component)}ComposedProps`);
      else interfaces.push(composed);
      // `InputComposedProps` is an intersection over the interface above, and the
      // rule it carries lives in the alias rather than in either half.
      const alias = findTypeAlias(source, composedFile, isComposedProps);
      if (alias !== undefined) aliases.push(alias);
    }

    // The alias goes in beside the interfaces rather than after them: it is the
    // type the component is actually annotated with, and a reader who scrolls
    // past `InputBaseComposedProps` has already read the wrong one.
    const seed = [
      ...toTables(interfaces),
      ...aliases.map((alias) => ({
        name: alias.name,
        extends: undefined,
        definition: alias.text,
        rows: [],
      })),
    ];
    const { tables: expanded, shared } = expand(component, seed);

    // After the closure and never inside it: neither table cites a type, and both
    // stay last so the props keep the order they had.
    const anatomy = anatomyTable(component);
    const cssVarsInterface = findCssVars(component);
    const cssVars =
      cssVarsInterface === undefined ? undefined : (toTables([cssVarsInterface])[0] as ApiTable);
    const tables = [
      ...expanded,
      ...(anatomy === undefined ? [] : [anatomy]),
      ...(cssVars === undefined ? [] : [cssVars]),
    ];

    collected.push({ component, interfaces, aliases, tables, shared, missing, anatomy, cssVars });
  }
  return collected;
}

// ---------------------------------------------------------------------------
// The output: tables as data
// ---------------------------------------------------------------------------

/**
 * The tables as data rather than as markup, shipped inside the `react` tarball so
 * a documentation site reads the API of the exact version it embeds instead of
 * whatever a neighbouring checkout happens to hold.
 *
 * `react` and not `core` because the tables span both: `<X>MachineProps` is
 * declared in core and `<X>ComposedProps` up here, and a consumer installs this
 * package to get either.
 *
 * Nothing is escaped on the way out, and that is deliberate rather than an
 * omission. A `|`, a `<` and a `{` are metacharacters only to a GFM table and to
 * MDX, which this generator no longer emits; `JSON.stringify` carries them
 * verbatim, along with the quotes and newlines that no escape ever handled.
 */
export interface ApiRow {
  /** Carries its own `?`: the marker belongs to the name, not to the type. */
  readonly name: string;
  readonly type: string;
  readonly notes: string | undefined;
  /** `dialog.types.ts:24` */
  readonly source: string;
  /**
   * The heading this row belongs under, read from the author's own banner.
   *
   * On the row and never a list of spans beside the rows: a span is a second
   * statement about the same thing, and an index into a list nobody renumbers is
   * the shape that rots. Consecutive rows carrying the same label *are* the run.
   */
  readonly group: string | undefined;
}

/**
 * An interface and a type alias are told apart by which field carries the text.
 *
 * Two fields rather than one discriminant beside a shared field: the populated
 * field *is* the discriminant, so there is no second statement that can disagree
 * with it. What forced the split is that the two are not separable downstream —
 * `BadgeComposedProps` is an alias defined as the single name `BadgeRootProps`,
 * `UseButtonProps` an interface extending the single name `ButtonMachineProps`,
 * and a reader handed one field cannot tell `= A` from `extends A`.
 */
export interface ApiTable {
  readonly name: string;
  /** An interface's base list, joined. Rendered as `extends A, B`. */
  readonly extends: string | undefined;
  /** A type alias's right-hand side. Rendered as `= A | B`. Absent on an interface. */
  readonly definition: string | undefined;
  readonly rows: readonly ApiRow[];
}

export function toTables(interfaces: readonly ApiInterface[]): ApiTable[] {
  return interfaces.map((api) => ({
    name: api.name,
    // Joined rather than truncated to the first: an interface that extends two
    // things says both, and the field is prose for the reader either way.
    extends: api.extendsNames.length === 0 ? undefined : api.extendsNames.join(", "),
    // An interface never has one: this reader only ever walks interfaces.
    definition: undefined,
    rows: api.members.map((member) => ({
      name: `${member.name}${member.optional ? "?" : ""}`,
      type: member.type,
      notes: member.doc,
      source: `${member.source.file}:${member.source.line}`,
      group: member.group,
    })),
  }));
}

/**
 * Two spaces and a trailing newline, so a regenerated file diffs line by line.
 *
 * Takes tables and no longer interfaces: an alias has no members to hold, so a
 * signature that only accepted `ApiInterface` was the reason the artifact could
 * name `DrawerDetent` in a row and never carry what it meant.
 */
export function renderJson(tables: readonly ApiTable[]): string {
  return `${JSON.stringify(tables, null, 2)}\n`;
}

/**
 * Committed inside the package so `bun run pack` carries it — see `files` in
 * `packages/react/package.json`. Committed at all so an API change shows up in
 * review rather than on a site after a deploy.
 */
export const JSON_OUTPUT_DIR: string = path.join(root, "packages/react/api");

export function jsonName(component: string): string {
  return `${component}.json`;
}
