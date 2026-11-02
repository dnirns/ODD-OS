import { describe, expect, test } from "vitest";

import { resolvePath } from "./path";
import { createTestFilesystem } from "./testTree";

const fs = createTestFilesystem();

const resolved = (path: string, cwd = "C:\\") => {
  const result = resolvePath(fs, cwd, path);
  return result.ok ? result.value.path : result.error;
};

describe("Only drive C exists", () => {
  test("Drive letter in lower case", () => {
    expect(resolved("c:\\dos")).toBe("C:\\DOS");
  });

  test.each(["A:\\", "D:README.TXT", "z:", "b:\\DOS"])("Another drive: %s", (path) => {
    expect(resolved(path)).toBe("InvalidDrive");
  });
});

describe("Absolute and relative paths", () => {
  test("Absolute path", () => {
    expect(resolved("\\DOS", "C:\\ODDWARE")).toBe("C:\\DOS");
  });

  test("Relative path", () => {
    expect(resolved("HIMEM.SYS", "C:\\DOS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Drive with a relative path", () => {
    expect(resolved("C:HIMEM.SYS", "C:\\DOS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Bare drive", () => {
    expect(resolved("C:", "C:\\DOS")).toBe("C:\\DOS");
  });

  test("Root", () => {
    expect(resolved("C:\\", "C:\\DOS")).toBe("C:\\");
    expect(resolved("\\", "C:\\DOS")).toBe("C:\\");
  });

  test("a lower-case working directory is accepted", () => {
    expect(resolved("himem.sys", "c:\\dos")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("a working directory that does not exist", () => {
    expect(resolved("A.TXT", "C:\\NOWHERE")).toBe("PathNotFound");
  });

  test("a working directory that is a file", () => {
    expect(resolved("A.TXT", "C:\\README.TXT")).toBe("NotADirectory");
  });
});

describe("Dot and dot-dot", () => {
  test("Parent directory", () => {
    expect(resolved("..\\README.TXT", "C:\\DOS")).toBe("C:\\README.TXT");
  });

  test("Current directory", () => {
    expect(resolved(".\\HIMEM.SYS", "C:\\DOS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Above the root", () => {
    expect(resolved("..", "C:\\")).toBe("PathNotFound");
    expect(resolved("C:\\DOS\\..\\..", "C:\\ODDWARE")).toBe("PathNotFound");
    expect(resolved("..\\..", "C:\\DOS")).toBe("PathNotFound");
  });

  test("Three dots", () => {
    expect(resolved("...")).toBe("FileNotFound");
    expect(resolved("...\\DOS")).toBe("PathNotFound");
  });

  test("dots then names", () => {
    expect(resolved("DOS\\..\\ODDWARE")).toBe("C:\\ODDWARE");
    expect(resolved(".")).toBe("C:\\");
  });

  test("a trailing separator after three dots", () => {
    expect(resolved("...\\")).toBe("PathNotFound");
  });
});

describe("Separators", () => {
  test("Forward slashes", () => {
    expect(resolved("/DOS/HIMEM.SYS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Repeated separators", () => {
    expect(resolved("C:\\DOS\\\\HIMEM.SYS")).toBe("C:\\DOS\\HIMEM.SYS");
    expect(resolved("DOS/\\/HIMEM.SYS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Trailing separator", () => {
    expect(resolved("C:\\DOS\\")).toBe("C:\\DOS");
    expect(resolved("C:\\README.TXT\\")).toBe("NotADirectory");
  });

  test("Network-style path", () => {
    expect(resolved("\\\\DOS")).toBe("PathNotFound");
    expect(resolved("//DOS")).toBe("PathNotFound");
    expect(resolved("C:\\\\DOS")).toBe("PathNotFound");
  });
});

describe("Case-insensitive names", () => {
  test("Lower-case lookup", () => {
    expect(resolved("readme.txt")).toBe("C:\\README.TXT");
    expect(resolved("DoS\\HiMeM.SyS")).toBe("C:\\DOS\\HIMEM.SYS");
  });

  test("Lookup with a long name", () => {
    expect(resolved("C:\\AUTOEXECUTE.BATCH")).toBe("C:\\AUTOEXEC.BAT");
  });
});

describe("Missing components", () => {
  test("Missing file", () => {
    expect(resolved("C:\\DOS\\MISSING.TXT")).toBe("FileNotFound");
  });

  test("Missing directory", () => {
    expect(resolved("C:\\MISSING\\A.TXT")).toBe("PathNotFound");
  });

  test("File used as a directory", () => {
    expect(resolved("C:\\README.TXT\\A.TXT")).toBe("PathNotFound");
    expect(resolved("C:\\README.TXT\\..")).toBe("PathNotFound");
  });

  test("a missing last component with a trailing separator", () => {
    expect(resolved("C:\\MISSING\\")).toBe("PathNotFound");
  });
});

describe("Invalid names in paths", () => {
  test("Wildcard", () => {
    expect(resolved("*.TXT")).toBe("InvalidName");
  });

  test("Device name", () => {
    expect(resolved("con")).toBe("InvalidName");
    expect(resolved("C:\\DOS\\LPT1.TXT")).toBe("InvalidName");
  });

  test("an earlier missing component is reported first", () => {
    expect(resolved("C:\\MISSING\\*.TXT")).toBe("PathNotFound");
  });
});

describe("Bad input does not throw", () => {
  test.each(["", "\\\\", ":", "C:\\:", " ", "\0", "C:\\DOS\\\0"])("%j", (path) => {
    expect(() => resolvePath(fs, "C:\\", path)).not.toThrow();
    expect(resolvePath(fs, "C:\\", path).ok).toBe(false);
  });

  test("an empty path is not found", () => {
    expect(resolved("")).toBe("FileNotFound");
  });
});

describe("Resolved entries", () => {
  test("returns the entry found", () => {
    const result = resolvePath(fs, "C:\\", "readme.txt");

    expect(result.ok && result.value.entry.name).toBe("README.TXT");
  });
});
