import { describe, expect, test } from "vitest";

import { directory, opaqueFile } from "../fs/entries";
import { createFilesystem } from "../fs/seed";
import type { Filesystem } from "../fs/types";
import { setVariable } from "../environment/environment";
import { resolveExecutable, searchDirectories, splitExecutableLine } from "./resolve";

const WHEN = new Date(Date.UTC(1993, 2, 10, 6, 0));
const seeded = createFilesystem();

const withFiles: Filesystem = {
  root: directory("", WHEN, [
    opaqueFile("COMMAND.COM", WHEN, 100),
    directory("DOS", WHEN, [opaqueFile("MEM.EXE", WHEN, 100)]),
    directory("ODDWARE", WHEN, [
      opaqueFile("MEM.EXE", WHEN, 100),
      opaqueFile("TOOL.COM", WHEN, 100),
      opaqueFile("TOOL.EXE", WHEN, 100),
      opaqueFile("ONLY.EXE", WHEN, 100),
      directory("FOLDER.EXE", WHEN),
    ]),
  ]),
};

const withBatch: Filesystem = {
  root: directory("", WHEN, [
    directory("ODDWARE", WHEN, [opaqueFile("TOOL.BAT", WHEN, 10), opaqueFile("TOOL.EXE", WHEN, 100)]),
  ]),
};

const resolve = (
  token: string,
  cwd = "C:\\",
  filesystem = seeded,
  searchPath: readonly string[] = ["C:\\DOS"],
) => {
  const result = resolveExecutable(filesystem, cwd, token, searchPath);
  return result.type === "found" ? result.path : result.type;
};

describe("splitExecutableLine", () => {
  test.each([
    ["mem", "mem", ""],
    ["  mem /c", "mem", " /c"],
    [",;=mem", "mem", ""],
    ["mem/c", "mem", "/c"],
    ["mem,foo", "mem", ",foo"],
    ["mem;foo", "mem", ";foo"],
    ["mem=foo", "mem", "=foo"],
    ["mem.exe /c", "mem.exe", " /c"],
    ["\\dos\\mem foo", "\\dos\\mem", " foo"],
    ["c:\\dos\\mem", "c:\\dos\\mem", ""],
    ["", "", ""],
  ])("splits %j into %j and %j", (line, token, rest) => {
    expect(splitExecutableLine(line)).toEqual({ token, rest });
  });
});

describe("The search path", () => {
  const withPath = (value: string) => setVariable([], "PATH", value);

  test("is the directories of the PATH variable, in order", () => {
    expect(searchDirectories(withPath("C:\\DOS;C:\\ODDWARE"))).toEqual([
      "C:\\DOS",
      "C:\\ODDWARE",
    ]);
  });

  test("drops empty entries", () => {
    expect(searchDirectories(withPath(";C:\\DOS;;C:\\ODDWARE;"))).toEqual([
      "C:\\DOS",
      "C:\\ODDWARE",
    ]);
  });

  test("is empty when PATH is not set", () => {
    expect(searchDirectories([])).toEqual([]);
  });

  test("finds a programme in a later directory", () => {
    expect(resolve("worm", "C:\\", seeded, ["C:\\DOS", "C:\\ODDWARE"])).toBe("C:\\ODDWARE\\WORM.EXE");
  });

  test("runs the one in the directory listed first", () => {
    expect(resolve("mem", "C:\\", withFiles, ["C:\\ODDWARE", "C:\\DOS"])).toBe("C:\\ODDWARE\\MEM.EXE");
    expect(resolve("mem", "C:\\", withFiles, ["C:\\DOS", "C:\\ODDWARE"])).toBe("C:\\DOS\\MEM.EXE");
  });

  test("with no path, only the current directory is searched", () => {
    expect(resolve("mem", "C:\\", seeded, [])).toBe("notFound");
    expect(resolve("mem", "C:\\DOS", seeded, [])).toBe("C:\\DOS\\MEM.EXE");
  });

  test("skips an entry on an unknown drive or in a missing directory", () => {
    expect(resolve("mem", "C:\\", seeded, ["Z:\\BIN", "C:\\NOWHERE", "C:\\DOS"])).toBe("C:\\DOS\\MEM.EXE");
  });

  test("still reports an unknown drive typed with the name", () => {
    expect(resolve("a:mem", "C:\\", seeded, ["C:\\DOS"])).toBe("invalidDrive");
  });
});

describe("Executable names", () => {
  test("a name without an extension is found as .EXE", () => {
    expect(resolve("mem")).toBe("C:\\DOS\\MEM.EXE");
  });

  test("letter case does not matter", () => {
    expect(resolve("MeM")).toBe("C:\\DOS\\MEM.EXE");
  });

  test("a name with its extension is found as typed", () => {
    expect(resolve("mem.exe")).toBe("C:\\DOS\\MEM.EXE");
    expect(resolve("DOSKEY.COM")).toBe("C:\\DOS\\DOSKEY.COM");
  });

  test("a trailing dot is the same as no extension", () => {
    expect(resolve("mem.")).toBe("C:\\DOS\\MEM.EXE");
  });

  test("COM is tried before EXE", () => {
    expect(resolve("tool", "C:\\ODDWARE", withFiles)).toBe("C:\\ODDWARE\\TOOL.COM");
  });

  test("BAT is tried after COM and EXE", () => {
    expect(resolve("autoexec")).toBe("C:\\AUTOEXEC.BAT");
    expect(resolve("autoexec.bat")).toBe("C:\\AUTOEXEC.BAT");
    expect(resolve("tool", "C:\\ODDWARE", withBatch)).toBe("C:\\ODDWARE\\TOOL.EXE");
  });

  test("an explicit extension is not substituted", () => {
    expect(resolve("tool.exe", "C:\\ODDWARE", withFiles)).toBe("C:\\ODDWARE\\TOOL.EXE");
    expect(resolve("only.com", "C:\\ODDWARE", withFiles)).toBe("notFound");
  });

  test("the wrong extension finds nothing", () => {
    expect(resolve("mem.com")).toBe("notFound");
  });

  test.each(["readme.txt", "dos\\himem.sys", "config.sys"])(
    "%s is not executable",
    (token) => {
      expect(resolve(token)).toBe("notFound");
    },
  );

  test("an empty name finds nothing", () => {
    expect(resolve("")).toBe("notFound");
  });
});

describe("Where executables are searched", () => {
  test("the current directory is searched, then the search path", () => {
    expect(resolve("mem", "C:\\ODDWARE")).toBe("C:\\DOS\\MEM.EXE");
    expect(resolve("mem", "C:\\DOS")).toBe("C:\\DOS\\MEM.EXE");
  });

  test("the current directory comes first", () => {
    expect(resolve("mem", "C:\\ODDWARE", withFiles)).toBe("C:\\ODDWARE\\MEM.EXE");
    expect(resolve("mem", "C:\\", withFiles)).toBe("C:\\DOS\\MEM.EXE");
  });

  test("the root is not on the search path", () => {
    expect(resolve("command")).toBe("C:\\COMMAND.COM");
    expect(resolve("command", "C:\\DOS")).toBe("notFound");
    expect(resolve("command", "C:\\ODDWARE")).toBe("notFound");
  });

  test("an explicit path is the only place searched", () => {
    expect(resolve("\\command", "C:\\DOS")).toBe("C:\\COMMAND.COM");
    expect(resolve("..\\command", "C:\\DOS")).toBe("C:\\COMMAND.COM");
    expect(resolve("..\\mem", "C:\\DOS")).toBe("notFound");
    expect(resolve("oddware\\only", "C:\\", withFiles)).toBe("C:\\ODDWARE\\ONLY.EXE");
  });

  test("a drive and path are accepted", () => {
    expect(resolve("c:\\dos\\mem")).toBe("C:\\DOS\\MEM.EXE");
    expect(resolve("C:/DOS/MEM.EXE")).toBe("C:\\DOS\\MEM.EXE");
  });

  test("a drive alone searches that drive's current directory", () => {
    expect(resolve("c:mem", "C:\\DOS")).toBe("C:\\DOS\\MEM.EXE");
    expect(resolve("c:mem", "C:\\")).toBe("notFound");
  });

  test("a wildcard finds nothing", () => {
    expect(resolve("me*")).toBe("notFound");
    expect(resolve("mem.e?e")).toBe("notFound");
    expect(resolve("*")).toBe("notFound");
  });

  test("a directory finds nothing", () => {
    expect(resolve("dos")).toBe("notFound");
    expect(resolve("folder", "C:\\ODDWARE", withFiles)).toBe("notFound");
    expect(resolve("folder.exe", "C:\\ODDWARE", withFiles)).toBe("notFound");
  });

  test("a missing directory finds nothing", () => {
    expect(resolve("\\nowhere\\mem")).toBe("notFound");
  });

  test("another drive is an invalid drive", () => {
    expect(resolve("a:mem")).toBe("invalidDrive");
    expect(resolve("d:\\dos\\mem.exe")).toBe("invalidDrive");
  });
});
