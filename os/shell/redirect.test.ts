import { describe, expect, test } from "vitest";

import { applyChanges, diskChanges } from "../fs/changes";
import { createDisk, type Disk } from "../fs/disk";
import { directory, NO_ATTRIBUTES, textFile } from "../fs/entries";
import { locate } from "../fs/path";
import { createFilesystem } from "../fs/seed";
import type { Entry, FileContent } from "../fs/types";
import { createScreen, moveCursor, type Screen, writeText } from "../terminal/screen";
import { VERSION } from "../version";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState } from "./shell";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };
const WHEN = new Date(Date.UTC(1993, 5, 1, 9, 30));

const enter: ShellKey = { type: "enter" };
const type = (text: string): ShellKey[] => Array.from(text, (char) => ({ type: "char", char }));

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const shellOn = (disk: Disk = createDisk()) =>
  createShell(moveCursor(writeText(createScreen(), 0, 0, PROMPT), 0, PROMPT.length), CLOCK, disk);

const rowText = (screen: Screen, row: number) => screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const screenText = ({ screen }: ShellState) => screen.rows.map((_, row) => rowText(screen, row));

const entryAt = ({ disk }: ShellState, path: string): Entry | undefined => {
  const found = locate(disk.filesystem, disk.cwd, path);
  return found.kind === "found" ? found.entry : undefined;
};

const contentAt = (shell: ShellState, path: string): FileContent | undefined => {
  const entry = entryAt(shell, path);
  return entry?.kind === "file" ? entry.content : undefined;
};

const textAt = (shell: ShellState, path: string) => {
  const content = contentAt(shell, path);
  return content?.kind === "text" ? content.text : undefined;
};

const typed = (shell: ShellState, path: string) => run(shell, `type ${path}`);

// Only the command line, a blank row and the prompt on screen.
const quiet = (shell: ShellState) => expect(screenText(shell).slice(1, 3)).toEqual(["", PROMPT]);

describe("Redirecting output to a file", () => {
  test("Saving a listing", () => {
    const shell = run(shellOn(), "dir > list.txt");
    quiet(shell);

    const listing = screenText(run(shellOn(run(shellOn(), "> list.txt").disk), "dir")).slice(1, -2);
    const saved = textAt(shell, "LIST.TXT")?.split("\r\n").slice(0, -1);
    expect(saved).toEqual(listing.slice(0, saved?.length));
    expect(saved?.some((row) => row.startsWith("LIST     TXT"))).toBe(true);
  });

  test("Text before the operator", () => {
    const shell = run(shellOn(), "echo hello > a.txt");

    expect(textAt(shell, "A.TXT")).toBe("hello \r\n");
    expect(textAt(shell, "A.TXT")).toHaveLength(8);
  });

  test("No spaces", () => {
    expect(textAt(run(shellOn(), "echo hi>a.txt"), "A.TXT")).toBe("hi\r\n");
  });

  test("Replacing", () => {
    expect(textAt(run(shellOn(), "echo one > a.txt", "echo two >> a.txt", "echo three > a.txt"), "A.TXT")).toBe(
      "three \r\n",
    );
  });

  test("Operator before the command", () => {
    expect(textAt(run(shellOn(), "> a.txt echo hi"), "A.TXT")).toBe("hi\r\n");
  });

  test("Help text", () => {
    expect(textAt(run(shellOn(), "ver /? > v.txt"), "V.TXT")).toBe("Displays the ODD/OS version.\r\n\r\nVER\r\n");
  });

  test("the line with its redirection joins the history", () => {
    expect(press(run(shellOn(), "echo hi > a.txt"), { type: "up" }).line).toBe("echo hi > a.txt");
  });
});

describe("Appending output to a file", () => {
  test("Appending", () => {
    const shell = typed(run(shellOn(), "echo one > a.txt", "echo two >> a.txt"), "a.txt");

    expect(textAt(shell, "A.TXT")).toBe("one \r\ntwo \r\n");
    expect(screenText(shell).slice(5, 7)).toEqual(["one", "two"]);
  });

  test(">> creates a missing file", () => {
    expect(textAt(run(shellOn(), "echo x >> new.txt"), "NEW.TXT")).toBe("x \r\n");
  });

  test("the last redirection decides the target", () => {
    const shell = run(shellOn(), "echo x > a.txt > b.txt");

    expect(textAt(shell, "B.TXT")).toBe("x  \r\n");
  });
});

describe("Redirection on its own creates a file", () => {
  test("Empty file", () => {
    const shell = run(shellOn(), "> empty.txt");

    quiet(shell);
    expect(contentAt(shell, "EMPTY.TXT")).toEqual({ kind: "text", text: "" });
  });

  test("Emptying a file", () => {
    expect(textAt(run(shellOn(), "echo text > a.txt", ">a.txt"), "A.TXT")).toBe("");
  });

  test(">> on its own leaves an existing file alone", () => {
    const before = run(shellOn(), "echo text > a.txt");

    expect(entryAt(run(before, ">> a.txt"), "A.TXT")).toBe(entryAt(before, "A.TXT"));
  });
});

describe("What reaches the file", () => {
  test("Long lines are not wrapped", () => {
    const long = "x".repeat(100);

    expect(textAt(run(shellOn(), `echo ${long}> long.txt`), "LONG.TXT")).toBe(`${long}\r\n`);
  });

  test("tabs are kept as tabs", () => {
    expect(textAt(run(shellOn(), "echo a\tb> t.txt"), "T.TXT")).toBe("a\tb\r\n");
  });

  test("Errors go to the file", () => {
    expect(textAt(run(shellOn(), "type missing.txt > out.txt"), "OUT.TXT")).toBe("File not found - missing.txt\r\n");
  });

  test("Unknown command", () => {
    expect(textAt(run(shellOn(), "foo > out.txt"), "OUT.TXT")).toBe("Bad command or file name\r\n");
  });

  test("a redirected command still changes the directory", () => {
    const shell = run(shellOn(), "cd dos > out.txt");

    expect(shell.disk.cwd).toBe("C:\\DOS");
    expect(contentAt(shell, "\\OUT.TXT")).toEqual({ kind: "text", text: "" });
  });

  test("a redirected command still changes files", () => {
    const shell = run(shellOn(), "copy readme.txt notes.txt > out.txt");

    expect(entryAt(shell, "NOTES.TXT")).toBeDefined();
    expect(textAt(shell, "OUT.TXT")).toBe("        1 File(s) copied\r\n");
  });

  test("a redirected command still changes the echo setting", () => {
    expect(run(shellOn(), "echo off > nul").echo).toBe(false);
  });

  test("CLS does not clear the screen", () => {
    expect(rowText(run(shellOn(), "cls > out.txt").screen, 0)).toBe(`${PROMPT}cls > out.txt`);
  });
});

describe("Redirected commands that wait or take the screen", () => {
  const MANY = { filesystem: { root: directory("", WHEN, Array.from({ length: 30 }, (_, index) => textFile(`F${index}.TXT`, WHEN, "x", NO_ATTRIBUTES))) }, cwd: "C:\\" };

  test("Paused listing", () => {
    const paused = run(shellOn(MANY), "dir /p > list.txt");

    expect(paused.input.type).toBe("question");
    const rows = textAt(paused, "LIST.TXT")?.split("\r\n");
    expect(rows?.[23]).toBe("Press any key to continue . . .");
    expect(rows).toHaveLength(25);

    const done = press(paused, ...type("x"));
    expect(done.input.type).toBe("command");
    expect(textAt(done, "LIST.TXT")?.split("\r\n").filter((row) => row.startsWith("Press"))).toHaveLength(1);
    expect(textAt(done, "LIST.TXT")).toContain("file(s)");
    quiet(done);
  });

  test("Asking for the date", () => {
    const asked = run(shellOn(), "date > d.txt");

    expect(textAt(asked, "D.TXT")).toBe("Current date is Mon 11-01-1993\r\nEnter new date (mm-dd-yy): ");
    const answered = press(asked, ...type("12-25-93"));
    expect(rowText(answered.screen, 1)).toBe("12-25-93");

    const kept = run(asked, "");
    expect(kept.clock).toEqual(asked.clock);
    expect(kept.input.type).toBe("command");
  });

  test("a redirected date that is set changes the clock", () => {
    expect(run(shellOn(), "date > d.txt", "12-25-93").clock).not.toEqual(shellOn().clock);
  });

  test("a redirected question writes its prompt and still asks", () => {
    const asked = run(shellOn(), "del *.* > out.txt");

    expect(textAt(asked, "OUT.TXT")).toBe("All files in directory will be deleted!\r\nAre you sure (Y/N)?");
    const declined = run(asked, "n");
    expect(declined.input.type).toBe("command");
    expect(entryAt(declined, "README.TXT")).toBeDefined();
    expect(entryAt(declined, "OUT.TXT")).toBeDefined();
  });

  test("A fullscreen programme", () => {
    const playing = run(shellOn({ ...createDisk(), cwd: "C:\\ODDWARE" }), "worm > w.txt");

    expect(playing.running).toBeDefined();
    const left = press(playing, { type: "escape" });
    expect(left.running).toBeUndefined();
    expect(contentAt(left, "W.TXT")).toEqual({ kind: "text", text: "" });
  });
});

describe("Devices as targets", () => {
  test.each(["nul", "NUL", "nul.txt", "nul:", "prn", "lpt1", "com3", "aux"])("Discarding output: %s", (device) => {
    const shell = run(shellOn(), `dir > ${device}`);

    quiet(shell);
    expect(shell.disk.filesystem).toEqual(createFilesystem());
  });

  test("The console", () => {
    const shell = run(shellOn(), "ver > con");

    expect(screenText(shell).slice(1, 4)).toEqual(["", VERSION, ""]);
    expect(shell.disk.filesystem).toEqual(createFilesystem());
  });
});

describe("Redirection failures", () => {
  test("Missing directory", () => {
    const shell = run(shellOn(), "echo hi > \\nowhere\\a.txt");

    expect(screenText(shell).slice(1, 4)).toEqual(["File creation error", "", PROMPT]);
    expect(shell.disk.filesystem).toEqual(createFilesystem());
  });

  test("Read-only target", () => {
    const note = textFile("NOTE.TXT", WHEN, "keep", { ...NO_ATTRIBUTES, readOnly: true });
    const shell = run(shellOn({ filesystem: { root: directory("", WHEN, [note]) }, cwd: "C:\\" }), "ver > \\note.txt");

    expect(rowText(shell.screen, 1)).toBe("File creation error");
    expect(entryAt(shell, "NOTE.TXT")).toBe(note);
  });

  test("Directory as target", () => {
    expect(rowText(run(shellOn(), "ver > dos").screen, 1)).toBe("File creation error");
  });

  test("an invalid name", () => {
    expect(rowText(run(shellOn(), "ver > a*b").screen, 1)).toBe("File creation error");
  });

  test("No target", () => {
    const shell = run(shellOn(), "dir >");

    expect(screenText(shell).slice(1, 4)).toEqual(["File creation error", "", PROMPT]);
  });
});

describe("Redirected files are dated by the DOS clock", () => {
  test("Dated by the DOS clock", () => {
    const shell = run(shellOn(), "date 12-25-93", "ver > v.txt");

    expect(entryAt(shell, "V.TXT")?.modified.getUTCDate()).toBe(25);
    expect(entryAt(shell, "V.TXT")?.attributes).toEqual({ ...NO_ATTRIBUTES, archive: true });
  });

  test("Kept after a reload", () => {
    const shell = run(shellOn(), "echo note > note.txt");
    const restored = applyChanges(createFilesystem(), diskChanges(createFilesystem(), shell.disk.filesystem));

    expect(textAt(typed(shellOn({ filesystem: restored, cwd: "C:\\" }), "note.txt"), "NOTE.TXT")).toBe("note \r\n");
  });
});
