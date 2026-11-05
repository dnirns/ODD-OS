import type { FsError } from "../fs/types";
import { findEntries, type Found, type Listing } from "../fs/operations";
import { resolvePath } from "../fs/path";
import type { Filesystem } from "../fs/types";
import {
  entryRow,
  header,
  listingLines,
  selectEntries,
  summary,
  volumeLines,
  wideRows,
} from "./dir";
import type { DirOptions } from "./dirSwitches";

const NOT_FOUND = "File not found";
const LAST_COMPONENT = /[^\\/:]*$/;

export type DirListing =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly error: FsError };

type Block = { readonly path: string; readonly entries: readonly Listing[] };

const join = (path: string, name: string) =>
  path.endsWith("\\") ? `${path}${name}` : `${path}\\${name}`;

const isDot = ({ name }: Listing) => name === "." || name === "..";

// The pattern to apply in every directory: everything for a directory
// parameter, otherwise the last part of the parameter.
const patternOf = (fs: Filesystem, cwd: string, spec: string) => {
  const target = resolvePath(fs, cwd, spec === "" ? "." : spec);

  return target.ok && target.value.entry.kind === "directory"
    ? "*"
    : (LAST_COMPONENT.exec(spec)?.[0] ?? "*");
};

// The directory a listing starts in and each directory below it, depth first,
// that holds at least one entry the options show.
const collect = (
  fs: Filesystem,
  cwd: string,
  start: Found,
  pattern: string,
  options: DirOptions,
): readonly Block[] => {
  const walk = (path: string): readonly Block[] => {
    const all = findEntries(fs, cwd, path);
    if (!all.ok) return [];

    return all.value.entries
      .filter(({ kind, name }) => kind === "directory" && name !== "." && name !== "..")
      .flatMap(({ name }) => {
        const below = join(path, name);
        const matches = findEntries(fs, cwd, join(below, pattern));
        const entries = matches.ok ? selectEntries(matches.value.entries, options) : [];

        return [...(entries.length > 0 ? [{ path: below, entries }] : []), ...walk(below)];
      });
  };

  const first = selectEntries(start.entries, options);

  return [...(first.length > 0 ? [{ path: start.path, entries: first }] : []), ...walk(start.path)];
};

const bareRows = (entries: readonly Listing[]) => entries.filter((e) => !isDot(e)).map((e) => e.name);

const blockLines = (block: Block, options: DirOptions) => [
  "",
  ` Directory of ${block.path}`,
  "",
  ...(options.wide ? wideRows(block.entries) : block.entries.map(entryRow)),
  summary(block.entries, 0)[0],
];

// The lines `DIR` prints for a parameter and the options.
export const dirListing = (
  fs: Filesystem,
  cwd: string,
  spec: string,
  options: DirOptions,
  free: number,
): DirListing => {
  const found = findEntries(fs, cwd, spec);
  if (!found.ok) return found;

  if (!options.subdirectories) {
    if (!options.bare) return { ok: true, lines: listingLines(found.value, { wide: options.wide, free, options }) };

    const names = bareRows(selectEntries(found.value.entries, options));
    return { ok: true, lines: names.length === 0 ? [NOT_FOUND] : names };
  }

  const blocks = collect(fs, cwd, found.value, patternOf(fs, cwd, spec), options);

  if (options.bare) {
    const paths = blocks.flatMap(({ path, entries }) =>
      entries.filter((entry) => !isDot(entry)).map(({ name }) => join(path, name)),
    );
    return { ok: true, lines: paths.length === 0 ? [NOT_FOUND] : paths };
  }

  if (blocks.length === 0) return { ok: true, lines: [...header(found.value.path), NOT_FOUND] };

  return {
    ok: true,
    lines: [
      ...volumeLines,
      ...blocks.flatMap((block) => blockLines(block, options)),
      "",
      "Total files listed:",
      ...summary(
        blocks.flatMap(({ entries }) => entries),
        free,
      ),
    ],
  };
};
