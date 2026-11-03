export type Arguments = {
  readonly tail: string;
  readonly params: readonly string[];
  readonly switches: readonly string[];
};

export type ParsedCommand = Arguments & {
  readonly name: string;
  // Everything after the name, exactly as typed.
  readonly rest: string;
};

const LEADING_DELIMITERS = /^[ \t,;=]+/;
// MS-DOS 4.0 ends a built-in command name at these characters, so `CD..`,
// `CD\DOS` and `DIR/W` run their commands.
const COMMAND_NAME = /^[^ \t,;=/.\\"[\]:<|>+\u0000-\u001f]*/;
const DRIVE_COMMAND = /^([A-Za-z]):[\\/]?[ \t,;=]*$/;
const DELIMITERS = /[ \t,;=]+/;

export const trimDelimiters = (text: string) =>
  text.replace(LEADING_DELIMITERS, "").replace(/[ \t,;=]+$/, "");

export const parseArguments = (text: string): Arguments => {
  const tail = trimDelimiters(text);
  const parts = tail
    .split(DELIMITERS)
    .flatMap((token) => token.split(/(?=\/)/))
    .filter((part) => part !== "");

  return {
    tail,
    params: parts.filter((part) => !part.startsWith("/")),
    switches: parts
      .filter((part) => part.startsWith("/"))
      .map((part) => part.toUpperCase()),
  };
};

export const parseCommand = (line: string): ParsedCommand => {
  const trimmed = line.replace(LEADING_DELIMITERS, "");
  const [name] = COMMAND_NAME.exec(trimmed) ?? [""];

  const rest = trimmed.slice(name.length);

  return { name: name.toUpperCase(), rest, ...parseArguments(rest) };
};

export const parseDriveCommand = (line: string): string | undefined =>
  DRIVE_COMMAND.exec(line.replace(LEADING_DELIMITERS, ""))?.[1].toUpperCase();

export type Redirection = {
  // The line without its redirections.
  readonly line: string;
  // The last target named, which decides where the output goes.
  readonly target: { readonly name: string; readonly append: boolean } | undefined;
};

// `>` or `>>`, any delimiters, then the target name up to a delimiter, `/`
// or `>`.
const REDIRECTION = /(>>?)[ \t,;=]*([^ \t,;=/>]*)/g;

// Takes `> name` and `>> name` out of a line, wherever they are, keeping the
// text around them. An operator with no name gives `undefined`.
export const splitRedirection = (line: string): Redirection | undefined => {
  const found = Array.from(line.matchAll(REDIRECTION));
  if (found.some(([, , name]) => name === "")) return undefined;

  const last = found.at(-1);
  return {
    line: line.replace(REDIRECTION, ""),
    target: last && { name: last[2], append: last[1] === ">>" },
  };
};
