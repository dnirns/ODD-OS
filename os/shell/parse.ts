export type Arguments = {
  readonly tail: string;
  readonly params: readonly string[];
  readonly switches: readonly string[];
};

export type ParsedCommand = Arguments & {
  readonly name: string;
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

  return {
    name: name.toUpperCase(),
    ...parseArguments(trimmed.slice(name.length)),
  };
};

export const parseDriveCommand = (line: string): string | undefined =>
  DRIVE_COMMAND.exec(line.replace(LEADING_DELIMITERS, ""))?.[1].toUpperCase();
