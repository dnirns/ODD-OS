import type { Found, Listing } from "../fs/operations";
import { type AttributeTerm, DEFAULT_DIR_OPTIONS, type DirOptions, type SortKey } from "./dirSwitches";

// Invented: the volume has no label and its serial number is ODD/OS's own.
const VOLUME_LINES = [
  " Volume in drive C has no label",
  " Volume Serial Number is 0DD0-0314",
] as const;

const NAME_WIDTH = 8;
const EXTENSION_WIDTH = 3;
const SIZE_WIDTH = 14;
const TIME_WIDTH = 6;
const COUNT_WIDTH = 9;
const TOTAL_WIDTH = 15;
const FREE_WIDTH = COUNT_WIDTH + " file(s)".length + TOTAL_WIDTH;
const WIDE_COLUMN = 16;
const WIDE_PER_ROW = 5;

export const isVisible = ({ attributes }: Listing) =>
  !attributes.hidden && !attributes.system;

const twoDigits = (value: number) => String(value).padStart(2, "0");

const number = (value: number) => value.toLocaleString("en-US");

// Times and dates use the UTC fields: the clock and the disk both keep the
// 1993 calendar there.
export const formatDirDate = (date: Date) =>
  [
    twoDigits(date.getUTCMonth() + 1),
    twoDigits(date.getUTCDate()),
    twoDigits(date.getUTCFullYear() % 100),
  ].join("-");

export const formatDirTime = (date: Date) => {
  const hours = date.getUTCHours();
  const clockHours = hours % 12 === 0 ? 12 : hours % 12;

  return `${clockHours}:${twoDigits(date.getUTCMinutes())}${hours < 12 ? "a" : "p"}`.padStart(
    TIME_WIDTH,
  );
};

const splitName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.replaceAll(".", "") !== ""
    ? [name.slice(0, dot), name.slice(dot + 1)]
    : [name, ""];
};

export const entryRow = (entry: Listing) => {
  const [base, extension] = splitName(entry.name);
  const size = entry.kind === "directory" ? " <DIR>".padEnd(SIZE_WIDTH) : number(entry.size).padStart(SIZE_WIDTH);

  return `${base.padEnd(NAME_WIDTH)} ${extension.padEnd(EXTENSION_WIDTH)}${size} ${formatDirDate(entry.modified)}  ${formatDirTime(entry.modified)}`;
};

export const wideRows = (entries: readonly Listing[]) =>
  Array.from({ length: Math.ceil(entries.length / WIDE_PER_ROW) }, (_, row) =>
    entries
      .slice(row * WIDE_PER_ROW, (row + 1) * WIDE_PER_ROW)
      .map(({ name, kind }) => (kind === "directory" ? `[${name}]` : name).padEnd(WIDE_COLUMN))
      .join("")
      .trimEnd(),
  );

export const header = (path: string) => [...VOLUME_LINES, ` Directory of ${path}`, ""];

export const volumeLines: readonly string[] = VOLUME_LINES;

export const summary = (entries: readonly Listing[], free: number) => {
  const files = entries.filter(({ kind }) => kind === "file");
  const total = files.reduce((sum, { size }) => sum + size, 0);

  return [
    `${String(files.length).padStart(COUNT_WIDTH)} file(s)${number(total).padStart(TOTAL_WIDTH)} bytes`,
    `${number(free).padStart(FREE_WIDTH)} bytes free`,
  ];
};

const hasAttribute = (entry: Listing, { code, wanted }: AttributeTerm) => {
  const { attributes } = entry;
  const has = {
    D: entry.kind === "directory",
    R: attributes.readOnly,
    H: attributes.hidden,
    S: attributes.system,
    A: attributes.archive,
  }[code];

  return has === wanted;
};

const passesFilter = (entry: Listing, { attributes }: DirOptions) =>
  attributes === undefined ? isVisible(entry) : attributes.every((term) => hasAttribute(entry, term));

const padded = (text: string, width: number) => text.toUpperCase().padEnd(width);

const compareText = (first: string, second: string) =>
  first < second ? -1 : first > second ? 1 : 0;

const compareBy = ({ code }: SortKey, first: Listing, second: Listing) => {
  const [firstBase, firstExtension] = splitName(first.name);
  const [secondBase, secondExtension] = splitName(second.name);
  const byBase = compareText(padded(firstBase, NAME_WIDTH), padded(secondBase, NAME_WIDTH));
  const byExtension = compareText(
    padded(firstExtension, EXTENSION_WIDTH),
    padded(secondExtension, EXTENSION_WIDTH),
  );

  switch (code) {
    case "N":
      return byBase || byExtension;
    case "E":
      return byExtension || byBase;
    case "S":
      return first.size - second.size;
    case "D":
      return first.modified.getTime() - second.modified.getTime();
    case "G":
      return Number(second.kind === "directory") - Number(first.kind === "directory");
  }
};

const isDot = ({ name }: Listing) => name === "." || name === "..";

// Sorts as `/O` asks. The sort is stable, so equal entries keep their storage
// order, and `.` and `..` stay at the top.
const sortEntries = (entries: readonly Listing[], order: readonly SortKey[]) => {
  if (order.length === 0) return entries;

  const sorted = entries
    .filter((entry) => !isDot(entry))
    .sort((first, second) => {
      for (const key of order) {
        const result = compareBy(key, first, second);
        if (result !== 0) return key.reversed ? -result : result;
      }
      return 0;
    });

  return [...entries.filter(isDot), ...sorted];
};

// The entries a listing shows: filtered by attribute, sorted, and in lower
// case when `/L` asks.
export const selectEntries = (
  entries: readonly Listing[],
  options: DirOptions,
): readonly Listing[] => {
  const chosen = sortEntries(
    entries.filter((entry) => passesFilter(entry, options)),
    options.order,
  );

  return options.lower
    ? chosen.map((entry) => ({ ...entry, name: entry.name.toLowerCase() }))
    : chosen;
};

export const listingLines = (
  { path, entries }: Found,
  {
    wide,
    free,
    options = DEFAULT_DIR_OPTIONS,
  }: { readonly wide: boolean; readonly free: number; readonly options?: DirOptions },
): readonly string[] => {
  const visible = selectEntries(entries, options);

  return visible.length === 0
    ? [...header(path), "File not found"]
    : [
        ...header(path),
        ...(wide ? wideRows(visible) : visible.map(entryRow)),
        ...summary(visible, free),
      ];
};
