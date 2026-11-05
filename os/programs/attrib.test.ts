import { describe, expect, test } from "vitest";

import { resolvePath } from "../fs/path";
import { fromRoot, type Session } from "../shell/testSession";

// What the last command line printed.
const shown = (...lines: readonly string[]) => {
  const before = fromRoot(...lines.slice(0, -1)).shown.length;
  return fromRoot(...lines).shown.slice(before);
};

const attributesOf = (session: Session, path: string) => {
  const found = resolvePath(session.disk.filesystem, "C:\\", path);
  if (!found.ok) throw new Error(found.error);
  return found.value.entry.attributes;
};

const entryOf = (session: Session, path: string) => {
  const found = resolvePath(session.disk.filesystem, "C:\\", path);
  if (!found.ok) throw new Error(found.error);
  return found.value.entry;
};

const NONE = { readOnly: false, hidden: false, system: false, archive: false };

describe("ATTRIB is an external command", () => {
  test("found on the path", () => {
    expect(shown("attrib autoexec.bat")).toEqual(["  A                 C:\\AUTOEXEC.BAT"]);
  });

  test("not found without C:\\DOS on the path", () => {
    expect(shown("set path=", "attrib")).toEqual(["Bad command or file name"]);
  });

  test("runs by its full name", () => {
    expect(shown("set path=", "c:\\dos\\attrib.exe autoexec.bat")).toEqual(["  A                 C:\\AUTOEXEC.BAT"]);
  });
});

describe("Showing attributes", () => {
  test("a system file", () => {
    expect(shown("attrib io.sys")).toEqual(["     SHR            C:\\IO.SYS"]);
  });

  test("a directory with no attributes", () => {
    expect(shown("attrib dos")).toEqual(["                    C:\\DOS"]);
  });

  test("the whole directory lists files only, hidden ones included", () => {
    expect(shown("attrib")).toEqual([
      "     SHR            C:\\IO.SYS",
      "     SHR            C:\\MSDOS.SYS",
      "  A                 C:\\COMMAND.COM",
      "  A                 C:\\CONFIG.SYS",
      "  A                 C:\\AUTOEXEC.BAT",
      "  A                 C:\\README.TXT",
      "  A                 C:\\CREDITS.TXT",
    ]);
  });

  test("the path field starts in column 20", () => {
    shown("attrib").forEach((row) => {
      expect(row.indexOf("C:\\")).toBe(20);
    });
  });
});

describe("Which entries ATTRIB processes", () => {
  test("a pattern includes system files", () => {
    expect(shown("attrib *.sys").map((row) => row.slice(20))).toEqual(["C:\\IO.SYS", "C:\\MSDOS.SYS", "C:\\CONFIG.SYS"]);
  });

  test("a path", () => {
    expect(shown("attrib \\dos\\*.exe").map((row) => row.slice(20))).toEqual(["C:\\DOS\\MEM.EXE", "C:\\DOS\\ATTRIB.EXE"]);
  });

  test("from another directory, with a relative path", () => {
    const rows = fromRoot("cd dos", "attrib ..\\readme.txt").shown;

    expect(rows.at(-1)).toBe("  A                 C:\\README.TXT");
  });

  test("a directory named explicitly changes", () => {
    const after = fromRoot("attrib +h oddware");

    expect(attributesOf(after, "ODDWARE").hidden).toBe(true);
    expect(shown("attrib +h oddware", "dir")).not.toContainEqual(expect.stringContaining("ODDWARE"));
  });

  test("wildcards skip directories", () => {
    const after = fromRoot("attrib +h *.*");

    expect(attributesOf(after, "DOS").hidden).toBe(false);
    expect(attributesOf(after, "ODDWARE").hidden).toBe(false);
    expect(attributesOf(after, "README.TXT").hidden).toBe(true);
  });
});

describe("Setting and clearing attributes", () => {
  test("read-only stops DEL", () => {
    expect(shown("attrib +r readme.txt", "del readme.txt")).toEqual(["Access denied"]);
    expect(attributesOf(fromRoot("attrib +r readme.txt", "del readme.txt"), "README.TXT").readOnly).toBe(true);
  });

  test("clearing it lets DEL work", () => {
    const after = fromRoot("attrib +r readme.txt", "attrib -r readme.txt", "del readme.txt");

    expect(resolvePath(after.disk.filesystem, "C:\\", "README.TXT").ok).toBe(false);
  });

  test("hiding a file and finding it again", () => {
    expect(shown("attrib +h readme.txt", "dir")).not.toContainEqual(expect.stringContaining("README"));
    expect(shown("attrib +h readme.txt", "dir /ah")).toContainEqual(expect.stringContaining("README   TXT"));
  });

  test("several changes at once, in any case and order", () => {
    expect(shown("attrib readme.txt +R -a", "attrib readme.txt")).toEqual(["       R            C:\\README.TXT"]);
  });

  test("prints nothing when it changes", () => {
    expect(shown("attrib +r readme.txt")).toEqual([]);
  });

  test("keeps the date and does not set the archive attribute", () => {
    const before = entryOf(fromRoot(), "README.TXT");
    const after = fromRoot("attrib -a readme.txt", "attrib +r readme.txt");

    expect(entryOf(after, "README.TXT").modified).toEqual(before.modified);
    expect(attributesOf(after, "README.TXT")).toEqual({ ...NONE, readOnly: true });
  });

  test("the last change to one attribute wins", () => {
    expect(attributesOf(fromRoot("attrib +r -r readme.txt"), "README.TXT").readOnly).toBe(false);
  });
});

describe("Hidden and system files keep their attributes", () => {
  test("clearing only hidden", () => {
    const after = fromRoot("attrib -h io.sys");

    expect(after.shown.at(-1)).toBe("Not resetting system file C:\\IO.SYS");
    expect(attributesOf(after, "IO.SYS")).toEqual({ readOnly: true, hidden: true, system: true, archive: false });
  });

  test("clearing only system", () => {
    expect(shown("attrib -s io.sys")).toEqual(["Not resetting hidden file C:\\IO.SYS"]);
  });

  test("read-only on a system file", () => {
    expect(shown("attrib -r io.sys")).toEqual(["Not resetting system file C:\\IO.SYS"]);
  });

  test("clearing both at once", () => {
    expect(shown("attrib -s -h -r io.sys")).toEqual([]);
    expect(shown("attrib -s -h -r io.sys", "attrib io.sys")).toEqual(["                    C:\\IO.SYS"]);
  });

  test("a hidden-only file", () => {
    expect(shown("attrib +h readme.txt", "attrib +r readme.txt")).toEqual(["Not resetting hidden file C:\\README.TXT"]);
  });

  test("a pattern refuses the system files and changes the rest", () => {
    const after = fromRoot("attrib -a *.sys");

    expect(shown("attrib -a *.sys")).toEqual([
      "Not resetting system file C:\\IO.SYS",
      "Not resetting system file C:\\MSDOS.SYS",
    ]);
    expect(attributesOf(after, "CONFIG.SYS").archive).toBe(false);
  });
});

describe("Subdirectories", () => {
  test("a pattern across the drive", () => {
    expect(shown("attrib \\*.exe /s").map((row) => row.slice(20))).toEqual([
      "C:\\DOS\\MEM.EXE",
      "C:\\DOS\\ATTRIB.EXE",
      "C:\\ODDWARE\\WORM.EXE",
    ]);
  });

  test("subdirectories come before the directory's own files", () => {
    const paths = shown("attrib /s").map((row) => row.slice(20));

    expect(paths.indexOf("C:\\DOS\\HIMEM.SYS")).toBeLessThan(paths.indexOf("C:\\IO.SYS"));
    expect(paths.indexOf("C:\\ODDWARE\\WORM.EXE")).toBeLessThan(paths.indexOf("C:\\IO.SYS"));
    expect(paths).not.toContain("C:\\DOS");
  });

  test("a named file in every directory", () => {
    expect(shown("attrib worm.exe /s").map((row) => row.slice(20))).toEqual(["C:\\ODDWARE\\WORM.EXE"]);
  });

  test("a named directory with /S lists its contents", () => {
    expect(shown("attrib oddware /s").map((row) => row.slice(20))).toEqual(["C:\\ODDWARE\\WORM.EXE"]);
  });

  test("changes a tree", () => {
    const after = fromRoot("copy readme.txt oddware", "attrib +r *.txt /s");

    expect(attributesOf(after, "README.TXT").readOnly).toBe(true);
    expect(attributesOf(after, "ODDWARE\\README.TXT").readOnly).toBe(true);
    expect(attributesOf(after, "CONFIG.SYS").readOnly).toBe(false);
  });
});

describe("Clearing everything with a comma", () => {
  test("clears every file in the directory, silently", () => {
    const after = fromRoot("attrib ,");

    expect(shown("attrib ,")).toEqual([]);
    expect(attributesOf(after, "IO.SYS")).toEqual(NONE);
    expect(attributesOf(after, "README.TXT")).toEqual(NONE);
    expect(attributesOf(after, "DOS\\MEM.EXE").archive).toBe(true);
    expect(shown("attrib ,", "dir")).toContainEqual(expect.stringContaining("IO       SYS"));
  });

  test("leaves directories alone", () => {
    expect(attributesOf(fromRoot("attrib +h oddware", "attrib ,"), "ODDWARE").hidden).toBe(true);
  });

  test("with /S reaches every directory", () => {
    expect(attributesOf(fromRoot("attrib , /s"), "DOS\\MEM.EXE")).toEqual(NONE);
  });
});

describe("ATTRIB errors", () => {
  test("nothing matches", () => {
    expect(shown("attrib nothing.txt")).toEqual(["File not found - nothing.txt"]);
    expect(shown("attrib *.zzz")).toEqual(["File not found - *.zzz"]);
  });

  test("missing path", () => {
    expect(shown("attrib \\nowhere\\*.txt")).toEqual(["Path not found - \\nowhere\\*.txt"]);
    expect(shown("attrib \\nowhere\\x.txt")).toEqual(["Path not found - \\nowhere\\x.txt"]);
  });

  test("another drive", () => {
    expect(shown("attrib a:*.*")).toEqual(["Invalid drive specification"]);
    expect(shown("attrib d:\\readme.txt")).toEqual(["Invalid drive specification"]);
  });

  test("the current drive by letter", () => {
    expect(shown("attrib c:readme.txt")).toEqual(["  A                 C:\\README.TXT"]);
    expect(shown("attrib c:*.txt").map((row) => row.slice(20))).toEqual(["C:\\README.TXT", "C:\\CREDITS.TXT"]);
  });

  test("unknown attributes and switches change nothing", () => {
    ["attrib +x readme.txt", "attrib +rh readme.txt", "attrib + readme.txt", "attrib /q", "attrib /s /s"].forEach(
      (line) => {
        expect(shown(line)).toEqual(["Invalid switch"]);
      },
    );
    expect(attributesOf(fromRoot("attrib +x +r readme.txt"), "README.TXT").readOnly).toBe(false);
  });

  test("two names", () => {
    const after = fromRoot("attrib +r readme.txt credits.txt");

    expect(after.shown).toEqual(["Too many parameters"]);
    expect(attributesOf(after, "README.TXT").readOnly).toBe(false);
  });
});

describe("ATTRIB help", () => {
  test("/? shows the usage and changes nothing", () => {
    const help = shown("attrib /?");

    expect(help[0]).toBe("Displays or changes file attributes.");
    expect(help).toContain("ATTRIB [+R | -R] [+A | -A] [+S | -S] [+H | -H] [[drive:][path]filename] [/S]");
    expect(shown("attrib +r readme.txt /?", "attrib readme.txt")).toEqual(["  A                 C:\\README.TXT"]);
  });

  test("equals HELP ATTRIB", () => {
    expect(shown("help attrib")).toEqual(shown("attrib /?"));
  });
});

describe("Effects elsewhere", () => {
  test("DIR /A finds a hidden file, and RD refuses a directory that holds one", () => {
    const after = fromRoot("md box", "copy readme.txt box", "attrib +h box\\readme.txt", "rd box");

    expect(after.shown.slice(-2)).toEqual(["Invalid path, not directory,", "or directory not empty"]);
    expect(shown("md box", "copy readme.txt box", "attrib +h box\\readme.txt", "dir /ah box")).toContainEqual(
      expect.stringContaining("README   TXT"),
    );
  });
});
