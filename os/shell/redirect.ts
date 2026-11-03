import type { Disk } from "../fs/disk";
import { ARCHIVE } from "../fs/entries";
import { writeEntry } from "../fs/operations";
import { formatPath, locate } from "../fs/path";
import type { Attributes, FileContent } from "../fs/types";
import { print } from "../programs/output";
import { ROWS } from "../terminal/screen";
import { readClock } from "./clock";
import {
  answerPrompt,
  type CommandContext,
  type CommandResult,
  PAUSE_MESSAGE,
  PROMPT_TEXT,
  runCommand,
} from "./commands";
import { deviceNamed } from "./devices";
import { splitRedirection, trimDelimiters } from "./parse";

export const PAGE_ROWS = ROWS - 2;

const FILE_CREATION_ERROR = "File creation error";

// Where redirected output goes. `write` gives the disk with the target
// holding everything written so far.
type Target = { readonly write: (disk: Disk, written: string) => Disk };

const DISCARD: Target = { write: (disk) => disk };

const withText = (base: FileContent, text: string): FileContent =>
  base.kind === "text" ? { kind: "text", text: base.text + text } : { kind: "opaque", size: base.size + text.length };

// Creates or empties the target, or keeps it to add to, before the command
// runs. A target that can't be written gives `File creation error`.
const fileTarget = (
  { disk, clock, now }: CommandContext,
  name: string,
  append: boolean,
): Target | undefined => {
  const located = locate(disk.filesystem, disk.cwd, name);
  if (located.kind === "error") return undefined;
  if (located.kind === "found" && (located.entry.kind === "directory" || located.entry.attributes.readOnly)) {
    return undefined;
  }

  const existing = located.kind === "found" && located.entry.kind === "file" ? located.entry : undefined;
  const path = located.kind === "found" ? formatPath(located.names) : formatPath([...located.parent, located.name]);
  const base: FileContent = append && existing ? existing.content : { kind: "text", text: "" };
  const attributes: Attributes = existing ? { ...existing.attributes, archive: true } : ARCHIVE;
  const modified = readClock(clock, now);

  return {
    write: (onto, written) => {
      if (append && existing && written === "") return onto;

      const result = writeEntry(onto.filesystem, onto.cwd, path, withText(base, written), modified, attributes);
      return result.ok ? { ...onto, filesystem: result.value } : onto;
    },
  };
};

const asFileText = (lines: readonly string[]) => lines.map((line) => `${line}\r\n`).join("");

const withDisk = (disk: Disk, result: CommandResult): CommandResult => ({ type: "withDisk", disk, result });

// Sends what a result would print to the target instead, keeping what it does
// to the disk, the directory, the clock and the echo setting. Questions write
// their prompt to the target and still wait, and so do pauses.
const redirect = (target: Target, written: string, disk: Disk, result: CommandResult): CommandResult => {
  const save = (text: string, onto = disk) => ({ written: written + text, disk: target.write(onto, written + text) });

  switch (result.type) {
    case "print":
      return { type: "files", disk: save(asFileText(result.lines)).disk, lines: [] };
    case "files":
      return { type: "files", disk: save(asFileText(result.lines), result.disk).disk, lines: [] };
    case "withDisk":
      return redirect(target, written, result.disk, result.result);
    case "clear":
      return { type: "files", disk: save("").disk, lines: [] };
    case "nest":
      return withDisk(save(asFileText(result.lines)).disk, { type: "nest", lines: [] });
    case "page": {
      if (result.lines.length <= PAGE_ROWS) return redirect(target, written, disk, print(...result.lines));

      const saved = save(asFileText([...result.lines.slice(0, PAGE_ROWS), PAUSE_MESSAGE]));
      return withDisk(saved.disk, {
        type: "question",
        lines: [],
        prompt: "",
        read: "key",
        answer: (_, context) =>
          redirect(target, saved.written, context.disk, { type: "page", lines: result.lines.slice(PAGE_ROWS) }),
      });
    }
    case "ask":
      return redirect(target, written, disk, {
        type: "question",
        lines: result.lines,
        prompt: PROMPT_TEXT[result.input],
        read: "line",
        answer: (text, context) => answerPrompt(result.input, text, context),
      });
    case "question": {
      const saved = save(asFileText(result.lines) + result.prompt);
      return withDisk(saved.disk, {
        ...result,
        lines: [],
        prompt: "",
        answer: (text, context) => redirect(target, saved.written, context.disk, result.answer(text, context)),
      });
    }
    case "setClock":
    case "setDirectory":
    case "setEcho":
    case "leave":
    case "launch":
      return withDisk(save("").disk, result);
  }
};

// Runs a command line, sending its output wherever `>` or `>>` says.
export const runRedirected = (line: string, context: CommandContext): CommandResult => {
  const split = splitRedirection(line);
  if (split === undefined) return print(FILE_CREATION_ERROR);
  if (split.target === undefined) return runCommand(line, context);

  const { name, append } = split.target;
  const blank = trimDelimiters(split.line) === "";
  const device = deviceNamed(name);
  if (device === "CON") return blank ? print() : runCommand(split.line, context);

  const target = device === "NUL" ? DISCARD : fileTarget(context, name, append);
  if (target === undefined) return print(FILE_CREATION_ERROR);

  const disk = target.write(context.disk, "");
  if (blank) return { type: "files", disk, lines: [] };
  return redirect(target, "", disk, runCommand(split.line, { ...context, disk }));
};
