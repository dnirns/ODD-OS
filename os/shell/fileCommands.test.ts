import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { ARCHIVE, directory, NO_ATTRIBUTES, textFile } from "../fs/entries";
import type { Filesystem } from "../fs/types";
import { type CommandContext, type CommandResult, runCommand } from "./commands";
import { textLines } from "./fileCommands";
import { opaqueNoise } from "./noise";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const contextAt = (cwd = "C:\\"): CommandContext => ({
  clock: CLOCK,
  now: NOW,
  disk: { ...createDisk(), cwd },
});

const run = (line: string, cwd = "C:\\"): CommandResult => runCommand(line, contextAt(cwd));

const printed = (line: string, cwd = "C:\\") => {
  const result = run(line, cwd);
  if (result.type !== "print") throw new Error(`expected print, got ${result.type}`);
  return result.lines;
};

// Runs lines in turn, keeping any directory change, and returns the final directory.
const directoryAfter = (...lines: readonly string[]) =>
  lines.reduce((disk: Disk, line) => {
    const result = runCommand(line, { clock: CLOCK, now: NOW, disk });
    return result.type === "setDirectory" ? { ...disk, cwd: result.cwd } : disk;
  }, createDisk()).cwd;

describe("Showing the current directory", () => {
  test("CD with no parameter prints the directory and changes nothing", () => {
    expect(printed("cd", "C:\\DOS")).toEqual(["C:\\DOS"]);
    expect(directoryAfter("cd dos", "cd")).toBe("C:\\DOS");
  });

  test("CD with only a drive prints the directory", () => {
    expect(printed("cd c:", "C:\\DOS")).toEqual(["C:\\DOS"]);
    expect(printed("cd C:", "C:\\DOS")).toEqual(["C:\\DOS"]);
  });

  test("the root prints as C:\\", () => {
    expect(printed("chdir")).toEqual(["C:\\"]);
  });

  test("CHDIR behaves as CD", () => {
    expect(printed("chdir c:", "C:\\DOS")).toEqual(["C:\\DOS"]);
    expect(directoryAfter("chdir dos")).toBe("C:\\DOS");
  });
});

describe("Changing directory", () => {
  test("prints nothing for a successful change", () => {
    expect(run("cd \\dos")).toEqual({ type: "setDirectory", cwd: "C:\\DOS" });
  });

  test("accepts an absolute path", () => {
    expect(directoryAfter("cd \\dos")).toBe("C:\\DOS");
  });

  test("accepts a relative path", () => {
    expect(directoryAfter("cd dos")).toBe("C:\\DOS");
    expect(directoryAfter("cd oddware")).toBe("C:\\ODDWARE");
  });

  test("goes to the parent directory", () => {
    expect(directoryAfter("cd dos", "cd ..")).toBe("C:\\");
  });

  test("accepts a path with no space before it", () => {
    expect(directoryAfter("cd dos", "cd..")).toBe("C:\\");
    expect(directoryAfter("cd\\dos")).toBe("C:\\DOS");
    expect(directoryAfter("cd dos", "cd\\")).toBe("C:\\");
  });

  test("goes to the root with a backslash", () => {
    expect(directoryAfter("cd dos", "cd \\")).toBe("C:\\");
  });

  test("accepts a dot, either case, either separator and a drive", () => {
    expect(directoryAfter("cd dos", "cd .")).toBe("C:\\DOS");
    expect(directoryAfter("CD DOS")).toBe("C:\\DOS");
    expect(directoryAfter("cd /dos")).toBe("C:\\");
    expect(directoryAfter("cd c:\\dos")).toBe("C:\\DOS");
    expect(directoryAfter("cd c:dos")).toBe("C:\\DOS");
  });

  test("keeps the directory for later commands", () => {
    expect(directoryAfter("cd dos", "cd")).toBe("C:\\DOS");
    expect(directoryAfter("cd dos", "ver", "c:")).toBe("C:\\DOS");
  });
});

describe("Changing directory fails clearly", () => {
  test.each([
    ["cd nowhere"],
    ["cd readme.txt"],
    ["cd d*"],
    ["cd ?"],
    ["cd ..."],
    ["cd \\nowhere\\dos"],
    ["cd readme.txt\\"],
    ["cd a+b"],
  ])("%s prints Invalid directory", (line) => {
    expect(printed(line)).toEqual(["Invalid directory"]);
  });

  test("going above the root prints Invalid directory", () => {
    expect(printed("cd ..")).toEqual(["Invalid directory"]);
    expect(printed("cd ..", "C:\\")).toEqual(["Invalid directory"]);
  });

  test("a failed change leaves the directory alone", () => {
    expect(directoryAfter("cd dos", "cd nowhere")).toBe("C:\\DOS");
  });

  test("a second path prints Too many parameters", () => {
    expect(printed("cd dos oddware")).toEqual(["Too many parameters"]);
  });

  test("a switch prints Invalid switch", () => {
    expect(printed("cd /x")).toEqual(["Invalid switch"]);
    expect(printed("cd /x dos")).toEqual(["Invalid switch"]);
  });

  test.each(["cd d:\\", "cd d:", "cd d:dos", "chdir a:"])("%s prints Invalid drive specification", (line) => {
    expect(printed(line)).toEqual(["Invalid drive specification"]);
  });
});

describe("Selecting a drive", () => {
  test.each(["c:", "C:", "c:\\", "C:/", "  c:"])("%j is accepted silently", (line) => {
    expect(run(line, "C:\\DOS")).toEqual({ type: "setDirectory", cwd: "C:\\DOS" });
  });

  test.each(["a:", "d:", "Z:\\"])("%j prints Invalid drive specification", (line) => {
    expect(printed(line)).toEqual(["Invalid drive specification"]);
  });

  test("a drive before a command name is an unknown command", () => {
    expect(printed("c:dir")).toEqual(["Bad command or file name"]);
    expect(printed("c:ver")).toEqual(["Bad command or file name"]);
  });
});

const dirRows = (line: string, cwd = "C:\\") => printed(line, cwd).slice(4);

const dirNames = (line: string, cwd = "C:\\") =>
  dirRows(line, cwd)
    .slice(0, -2)
    .map((row) => row.slice(0, 12).trimEnd().replace(/ +/g, "."));

const header = (path: string) => [
  " Volume in drive C has no label",
  " Volume Serial Number is 0DD0-0314",
  ` Directory of ${path}`,
  "",
];

const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 12));
const hiddenTree: Filesystem = {
  root: directory("", WHEN, [
    textFile("SHOWN.TXT", WHEN, "ab"),
    textFile("HIDDEN.TXT", WHEN, "hidden", { ...ARCHIVE, hidden: true }),
    textFile("SYSTEM.SYS", WHEN, "system", { ...NO_ATTRIBUTES, system: true }),
  ]),
};

const printedWith = (line: string, filesystem: Filesystem) => {
  const result = runCommand(line, {
    clock: CLOCK,
    now: NOW,
    disk: { filesystem, cwd: "C:\\" },
  });
  if (result.type !== "print") throw new Error(`expected print, got ${result.type}`);
  return result.lines;
};

describe("Directory listing layout", () => {
  test("the root header", () => {
    expect(printed("dir").slice(0, 4)).toEqual(header("C:\\"));
  });

  test("a subdirectory header", () => {
    expect(printed("dir c:\\dos").slice(0, 4)).toEqual(header("C:\\DOS"));
  });

  test("entries appear in storage order", () => {
    expect(dirNames("dir")).toEqual([
      "COMMAND.COM",
      "DOS",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "ODDWARE",
      "README.TXT",
      "CREDITS.TXT",
    ]);
  });

  test("shows the seeded rows", () => {
    expect(dirRows("dir").slice(0, 2)).toEqual([
      "COMMAND  COM        53,214 03-10-93   6:00a",
      "DOS          <DIR>         09-14-93   9:12a",
    ]);
  });

  test("the summary counts five files and shows the free space", () => {
    const [files, free] = printed("dir").slice(-2);

    expect(files).toMatch(/^ +5 file\(s\) +[\d,]+ bytes$/);
    expect(free).toMatch(/^ +356,024,320 bytes free$/);
  });
});

describe("Dot entries", () => {
  test("a subdirectory starts with . and ..", () => {
    expect(dirNames("dir dos")).toEqual([".", "..", "HIMEM.SYS", "MEM.EXE", "DOSKEY.COM", "HELP.COM"]);
    expect(dirRows("dir dos")[0]).toMatch(/^\. +<DIR> +09-14-93 +9:12a$/);
  });

  test("the root has none", () => {
    expect(dirNames("dir")).not.toContain(".");
  });

  test("an empty directory lists only the dot entries", () => {
    const rows = printedWith("dir empty", { root: directory("", WHEN, [directory("EMPTY", WHEN)]) }).slice(4);

    expect(rows.slice(0, 2).map((row) => row.slice(0, 2).trim())).toEqual([".", ".."]);
    expect(rows.at(-2)).toBe("        0 file(s)              0 bytes");
  });
});

describe("The seeded ODDWARE directory", () => {
  test("lists the game", () => {
    expect(dirNames("dir oddware")).toEqual([".", "..", "WORM.EXE"]);
    expect(dirRows("dir oddware")[2]).toBe("WORM     EXE        23,744 09-20-93   4:49p");
    expect(dirRows("dir oddware").at(-2)).toBe("        1 file(s)         23,744 bytes");
  });
});

describe("Hidden and system entries", () => {
  test("a hidden file is not listed or counted", () => {
    const rows = printedWith("dir", hiddenTree);

    expect(rows.join("\n")).not.toContain("HIDDEN");
    expect(rows.at(-2)).toBe("        1 file(s)              2 bytes");
  });

  test("a system file is not listed", () => {
    expect(printedWith("dir", hiddenTree).join("\n")).not.toContain("SYSTEM");
  });

  test("a pattern that matches only a hidden file finds nothing", () => {
    expect(printedWith("dir hidden.txt", hiddenTree).slice(-2)).toEqual(["", "File not found"]);
    expect(printedWith("dir sys*.*", hiddenTree).slice(-1)).toEqual(["File not found"]);
  });
});

describe("Directory listing parameters", () => {
  test("a directory lists its contents", () => {
    expect(printed("dir \\dos").slice(0, 4)).toEqual(header("C:\\DOS"));
    expect(dirNames("dir \\dos")).toContain("HIMEM.SYS");
  });

  test("a file lists that entry under its directory", () => {
    const rows = printed("dir readme.txt");

    expect(rows.slice(0, 4)).toEqual(header("C:\\"));
    expect(rows[4]).toMatch(/^README {3}TXT/);
    expect(rows.at(-2)).toMatch(/^ +1 file\(s\)/);
  });

  test("a pattern lists the matches", () => {
    expect(dirNames("dir *.sys")).toEqual(["CONFIG.SYS"]);
  });

  test("a pattern with a path lists that directory", () => {
    const rows = printed("dir c:\\dos\\*.sys");

    expect(rows[2]).toBe(" Directory of C:\\DOS");
    expect(dirNames("dir c:\\dos\\*.sys")).toEqual(["HIMEM.SYS"]);
  });

  test("a long name is truncated", () => {
    expect(dirNames("DIR readme.txtx")).toEqual(["README.TXT"]);
  });

  test("with no parameter it lists the working directory", () => {
    expect(printed("dir", "C:\\DOS")[2]).toBe(" Directory of C:\\DOS");
  });

  test("a relative path lists from the working directory", () => {
    expect(dirNames("dir ..", "C:\\DOS")).toContain("COMMAND.COM");
  });
});

describe("Wildcards in DIR", () => {
  test("star in the extension", () => {
    expect(dirNames("dir *.txt")).toEqual(["README.TXT", "CREDITS.TXT"]);
  });

  test("star alone lists every visible entry", () => {
    expect(dirNames("dir *")).toEqual(dirNames("dir"));
  });

  test("question marks", () => {
    expect(dirNames("dir c?????.s?s")).toEqual(["CONFIG.SYS"]);
  });

  test("the base name and extension are separate", () => {
    expect(printed("dir read*.s*").slice(-1)).toEqual(["File not found"]);
  });

  test("a plain name with no extension finds nothing", () => {
    expect(printed("dir readme").slice(-2)).toEqual(["", "File not found"]);
  });

  test("a star ending the base name matches any extension", () => {
    expect(dirNames("dir read*")).toEqual(["README.TXT"]);
  });

  test("a wildcard in a directory component is a missing path", () => {
    expect(printed("dir d*\\*.sys")).toEqual(["Path not found"]);
  });

  test("star matches the dot entries in a subdirectory", () => {
    expect(dirNames("dir *.*", "C:\\DOS")).toEqual([".", "..", "HIMEM.SYS", "MEM.EXE", "DOSKEY.COM", "HELP.COM"]);
    expect(dirNames("dir *.sys", "C:\\DOS")).toEqual(["HIMEM.SYS"]);
  });
});

describe("Directory listing errors", () => {
  test("no match prints the header, a blank row and File not found", () => {
    const rows = printed("dir *.zzz");

    expect(rows).toEqual([...header("C:\\"), "File not found"]);
  });

  test("a missing path prints no header", () => {
    expect(printed("dir \\nowhere\\*.txt")).toEqual(["Path not found"]);
    expect(printed("dir nowhere\\a.txt")).toEqual(["Path not found"]);
  });

  test("a path through a file is a missing path", () => {
    expect(printed("dir readme.txt\\*.txt")).toEqual(["Path not found"]);
    expect(printed("dir readme.txt\\")).toEqual(["Path not found"]);
  });

  test("another drive", () => {
    expect(printed("dir d:")).toEqual(["Invalid drive specification"]);
    expect(printed("dir a:\\")).toEqual(["Invalid drive specification"]);
  });

  test("an unsupported switch lists nothing", () => {
    expect(printed("dir /q")).toEqual(["Invalid switch"]);
    expect(printed("dir /w /x")).toEqual(["Invalid switch"]);
    expect(printed("dir /ax")).toEqual(["Invalid switch"]);
    expect(printed("dir /ox")).toEqual(["Invalid switch"]);
    expect(printed("dir /-q")).toEqual(["Invalid switch"]);
  });

  test("two paths", () => {
    expect(printed("dir dos oddware")).toEqual(["Too many parameters"]);
  });

  test("a repeated switch", () => {
    expect(printed("dir /w /w")).toEqual(["Too many parameters"]);
    expect(printed("dir /p /p")).toEqual(["Too many parameters"]);
  });

  test("an invalid name has no match", () => {
    expect(printed("dir a+b")).toEqual(["File not found"]);
  });
});

describe("Wide listings", () => {
  test("the root in wide format", () => {
    const rows = printed("dir /w");

    expect(rows[4].split(/\s+/)).toEqual(["COMMAND.COM", "[DOS]", "CONFIG.SYS", "AUTOEXEC.BAT", "[ODDWARE]"]);
    expect(rows[5].split(/\s+/)).toEqual(["README.TXT", "CREDITS.TXT"]);
  });

  test("the switch needs no space", () => {
    expect(printed("dir/w")).toEqual(printed("dir /w"));
    expect(printed("DIR/W")).toEqual(printed("dir /W"));
  });

  test("the dot entries appear in a subdirectory", () => {
    const rows = printed("dir /w dos");

    expect(rows[4].split(/\s+/)).toEqual(["[.]", "[..]", "HIMEM.SYS", "MEM.EXE", "DOSKEY.COM"]);
    expect(rows[5].trim()).toBe("HELP.COM");
  });

  test("a switch may come before the path", () => {
    expect(printed("dir /w dos")).toEqual(printed("dir dos /w"));
  });
});

describe("The filesystem is not changed", () => {
  const entries = ["", "dos", "oddware", "readme.txt", "command.com", "dos\\himem.sys", "nowhere", "*.*"];
  const commands = ["dir", "dir /w", "cd", "chdir", "type"];

  test.each(["fileCommands.ts", "dir.ts", "noise.ts", "text.ts"])(
    "%s never touches the browser's address or history",
    (file) => {
      const code = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

      expect(code).not.toMatch(/\b(window|document|location|navigator)\b|history\.(push|replace)State/);
    },
  );

  test("read-only commands leave the filesystem equal", () => {
    const disk = createDisk();
    const before = structuredClone(disk.filesystem);

    commands.forEach((command) =>
      entries.forEach((entry) => {
        runCommand(`${command} ${entry}`, { clock: CLOCK, now: NOW, disk });
      }),
    );

    expect(disk.filesystem).toEqual(before);
  });
});

const textTree = (text: string): Filesystem => ({
  root: directory("", WHEN, [textFile("T.TXT", WHEN, text)]),
});

const typedText = (text: string) => printedWith("type t.txt", textTree(text));

describe("Displaying a text file", () => {
  test("shows the lines of README.TXT", () => {
    const rows = printed("type readme.txt");

    expect(rows[0]).toBe("ODD/OS Version 3.14");
    expect(rows).toContain("GETTING STARTED");
    expect(rows.at(-1)).toBe("Please contact your dealer for assistance with this product.");
  });

  test("shows CONFIG.SYS by a path from another directory", () => {
    expect(printed("type c:\\config.sys", "C:\\DOS")).toEqual([
      "DEVICE=C:\\DOS\\HIMEM.SYS",
      "DOS=HIGH",
      "FILES=30",
    ]);
    expect(printed("type ..\\config.sys", "C:\\DOS")).toEqual(printed("type config.sys"));
  });

  test("ends lines at CRLF or LF", () => {
    expect(typedText("one\r\ntwo\r\n")).toEqual(["one", "two"]);
    expect(typedText("one\ntwo\n")).toEqual(["one", "two"]);
    expect(typedText("one\r\ntwo\nthree")).toEqual(["one", "two", "three"]);
  });

  test("keeps blank lines", () => {
    expect(typedText("a\r\n\r\nb\r\n")).toEqual(["a", "", "b"]);
  });

  test("stops at the first Ctrl+Z", () => {
    expect(typedText("one\r\ntwo\x1Athree")).toEqual(["one", "two"]);
    expect(typedText("\x1Aone")).toEqual([]);
  });

  test("shows text with no final line break as if it had one", () => {
    expect(typedText("last line")).toEqual(["last line"]);
    expect(textLines("last line")).toEqual(textLines("last line\r\n"));
  });

  test("shows an empty file as nothing", () => {
    expect(typedText("")).toEqual([]);
  });

  test("leaves tabs and long lines to the screen", () => {
    expect(typedText("a\tb\r\n")).toEqual(["a\tb"]);
    expect(typedText(`${"x".repeat(100)}\r\n`)).toEqual(["x".repeat(100)]);
  });

  test("treats a lone CR as a line break", () => {
    expect(typedText("a\rb")).toEqual(["a", "b"]);
  });

  test("works in any letter case", () => {
    expect(printed("TYPE README.TXT")).toEqual(printed("type readme.txt"));
  });

  test("shows a hidden file named exactly", () => {
    expect(printedWith("type hidden.txt", hiddenTree)).toEqual(["hidden"]);
  });
});

describe("Displaying an opaque file", () => {
  test("shows the same burst every time", () => {
    expect(printed("type command.com")).toEqual(printed("type command.com"));
  });

  test("shows the burst for the file's canonical path and size", () => {
    expect(printed("type command.com")).toEqual(opaqueNoise("C:\\COMMAND.COM", 53_214));
    expect(printed("type dos\\himem.sys")).toEqual(opaqueNoise("C:\\DOS\\HIMEM.SYS", 29_104));
  });

  test("differs between files", () => {
    expect(printed("type command.com")).not.toEqual(printed("type dos\\himem.sys"));
  });

  test("ignores how the path is written", () => {
    expect(printed("TYPE COMMAND.COM")).toEqual(printed("type c:\\command.com"));
    expect(printed("type ..\\command.com", "C:\\DOS")).toEqual(printed("type command.com"));
  });

  test("shows no more than four rows", () => {
    expect(printed("type command.com").length).toBeLessThanOrEqual(4);
  });
});

describe("Displaying a file fails clearly", () => {
  test("no parameter", () => {
    expect(printed("type")).toEqual(["Required parameter missing"]);
  });

  test("a missing file names the file as typed", () => {
    expect(printed("type nothing.txt")).toEqual(["File not found - nothing.txt"]);
    expect(printed("type NoThing.Txt")).toEqual(["File not found - NoThing.Txt"]);
  });

  test("a missing path names the path as typed", () => {
    expect(printed("type \\nowhere\\a.txt")).toEqual(["Path not found - \\nowhere\\a.txt"]);
    expect(printed("type readme.txt\\a.txt")).toEqual(["Path not found - readme.txt\\a.txt"]);
  });

  test("a directory is access denied", () => {
    expect(printed("type dos")).toEqual(["Access denied - dos"]);
    expect(printed("type \\")).toEqual(["Access denied - \\"]);
  });

  test("a wildcard is an invalid path or file name", () => {
    expect(printed("type *.txt")).toEqual(["Invalid path or file name"]);
    expect(printed("type read?e.txt")).toEqual(["Invalid path or file name"]);
  });

  test("another drive", () => {
    expect(printed("type d:readme.txt")).toEqual(["Invalid drive specification"]);
  });

  test("two parameters", () => {
    expect(printed("type readme.txt config.sys")).toEqual(["Too many parameters"]);
  });

  test("a switch", () => {
    expect(printed("type /x readme.txt")).toEqual(["Invalid switch"]);
    expect(printed("type readme.txt /p")).toEqual(["Invalid switch"]);
  });

  test("an invalid name", () => {
    expect(printed("type a+b")).toEqual(["File not found - a+b"]);
    expect(printed("type con")).toEqual(["File not found - con"]);
  });
});
