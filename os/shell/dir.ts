import type { Found, Listing } from "../fs/operations";

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

const wideRows = (entries: readonly Listing[]) =>
  Array.from({ length: Math.ceil(entries.length / WIDE_PER_ROW) }, (_, row) =>
    entries
      .slice(row * WIDE_PER_ROW, (row + 1) * WIDE_PER_ROW)
      .map(({ name, kind }) => (kind === "directory" ? `[${name}]` : name).padEnd(WIDE_COLUMN))
      .join("")
      .trimEnd(),
  );

export const header = (path: string) => [...VOLUME_LINES, ` Directory of ${path}`, ""];

const summary = (entries: readonly Listing[], free: number) => {
  const files = entries.filter(({ kind }) => kind === "file");
  const total = files.reduce((sum, { size }) => sum + size, 0);

  return [
    `${String(files.length).padStart(COUNT_WIDTH)} file(s)${number(total).padStart(TOTAL_WIDTH)} bytes`,
    `${number(free).padStart(FREE_WIDTH)} bytes free`,
  ];
};

export const listingLines = (
  { path, entries }: Found,
  { wide, free }: { readonly wide: boolean; readonly free: number },
): readonly string[] => {
  const visible = entries.filter(isVisible);

  return visible.length === 0
    ? [...header(path), "File not found"]
    : [
        ...header(path),
        ...(wide ? wideRows(visible) : visible.map(entryRow)),
        ...summary(visible, free),
      ];
};
