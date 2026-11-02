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
