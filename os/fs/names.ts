import { fail, ok, type Result } from "./types";

const MAX_BASE_LENGTH = 8;
const MAX_EXTENSION_LENGTH = 3;

const FORBIDDEN_CHARACTERS = new Set(`"*+,/:;<=>?[\\]|`);

const DEVICE_NAMES = new Set([
  "CON",
  "AUX",
  "PRN",
  "CLOCK$",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "LPT1",
  "LPT2",
  "LPT3",
]);

const isValidCharacter = (char: string) =>
  char >= "!" && char <= "~" && !FORBIDDEN_CHARACTERS.has(char);

export const normaliseName = (name: string): Result<string> => {
  const [base, extension = "", ...extra] = name.split(".");

  if (
    extra.length > 0 ||
    base === "" ||
    !Array.from(name).every((char) => char === "." || isValidCharacter(char))
  ) {
    return fail("InvalidName");
  }

  if (DEVICE_NAMES.has(base.toUpperCase())) return fail("InvalidName");

  const shortBase = base.slice(0, MAX_BASE_LENGTH);
  const shortExtension = extension.slice(0, MAX_EXTENSION_LENGTH);

  return ok(
    (shortExtension === "" ? shortBase : `${shortBase}.${shortExtension}`).toUpperCase(),
  );
};

export type Pattern = {
  readonly base: string;
  readonly extension: string;
};

const WILDCARDS = /[*?]/;

export const hasWildcard = (text: string) => WILDCARDS.test(text);

// Fills a field to its width as the DOS FCB parser does: `*` turns the rest of
// the field into `?`, and anything left over is blank.
const fillField = (text: string, width: number) => {
  const star = text.indexOf("*");
  const fixed = star === -1 ? text : text.slice(0, star);

  return (star === -1 ? fixed : fixed.padEnd(width, "?")).slice(0, width).padEnd(width);
};

export const parsePattern = (text: string): Result<Pattern> => {
  const [base, extension, ...extra] = text.split(".");

  if (
    extra.length > 0 ||
    base === "" ||
    !Array.from(text).every(
      (char) => char === "." || char === "*" || char === "?" || isValidCharacter(char),
    )
  ) {
    return fail("InvalidName");
  }

  // A pattern with no dot has a blank extension, except that a base name
  // ending in `*` matches any extension.
  const implied = extension === undefined && base.endsWith("*") ? "*" : "";

  return ok({
    base: fillField(base.toUpperCase().slice(0, MAX_BASE_LENGTH + 1), MAX_BASE_LENGTH),
    extension: fillField(
      (extension ?? implied).toUpperCase().slice(0, MAX_EXTENSION_LENGTH + 1),
      MAX_EXTENSION_LENGTH,
    ),
  });
};

const matchesField = (pattern: string, field: string, width: number) => {
  const padded = field.padEnd(width);

  return Array.from(pattern).every((char, index) => char === "?" || char === padded[index]);
};

export const matchesPattern = ({ base, extension }: Pattern, name: string) => {
  const [nameBase, nameExtension = ""] = name.toUpperCase().split(".");

  return (
    matchesField(base, nameBase, MAX_BASE_LENGTH) &&
    matchesField(extension, nameExtension, MAX_EXTENSION_LENGTH)
  );
};

const mapField = (pattern: string, field: string, width: number) => {
  const padded = field.padEnd(width);

  return Array.from(pattern)
    .map((char, index) => (char === "?" ? padded[index] : char))
    .join("")
    .trimEnd();
};

// The name a wildcard target gives a file, as RENAME and COPY build it: each
// `?` takes the old name's character in that position, and every other
// character is kept.
export const mapName = ({ base, extension }: Pattern, name: string) => {
  const [nameBase, nameExtension = ""] = name.toUpperCase().split(".");
  const newBase = mapField(base, nameBase, MAX_BASE_LENGTH);
  const newExtension = mapField(extension, nameExtension, MAX_EXTENSION_LENGTH);

  return newExtension === "" ? newBase : `${newBase}.${newExtension}`;
};
