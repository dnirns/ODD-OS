import { describe, expect, test } from "vitest";

import { fromRoot } from "./testSession";

// What the last command line printed.
const dir = (...lines: readonly string[]) => {
  const before = fromRoot(...lines.slice(0, -1)).shown.length;
  return fromRoot(...lines).shown.slice(before);
};

const names = (rows: readonly string[]) =>
  rows
    .filter((row) => /^[A-Z.]+ +[A-Z]* +(<DIR>|[\d,]+) /i.test(row))
    .map((row) => row.slice(0, 12).replace(/ +$/, "").replace(/ +/, "."));

const ROOT_BY_NAME = ["DOS", "ODDWARE", "AUTOEXEC.BAT", "COMMAND.COM", "CONFIG.SYS", "CREDITS.TXT", "README.TXT"];

describe("/A", () => {
  test("shows hidden and system entries first on the root", () => {
    expect(names(dir("dir /a")).slice(0, 3)).toEqual(["IO.SYS", "MSDOS.SYS", "COMMAND.COM"]);
  });

  test("without /A the system files stay hidden", () => {
    expect(names(dir("dir"))).not.toContain("IO.SYS");
    expect(dir("dir io.sys")).toContain("File not found");
  });

  test("/AD shows only directories", () => {
    const rows = dir("dir /ad");

    expect(names(rows)).toEqual(["DOS", "ODDWARE"]);
    expect(rows.some((row) => row.includes("0 file(s)"))).toBe(true);
  });

  test("/A-D shows only files, hidden ones included", () => {
    expect(names(dir("dir /a-d"))).toEqual([
      "IO.SYS",
      "MSDOS.SYS",
      "COMMAND.COM",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "README.TXT",
      "CREDITS.TXT",
    ]);
  });

  test("/A:H shows the hidden entries only", () => {
    expect(names(dir("dir /a:h"))).toEqual(["IO.SYS", "MSDOS.SYS"]);
    expect(names(dir("dir /a:hs-d"))).toEqual(["IO.SYS", "MSDOS.SYS"]);
    expect(names(dir("dir /a:r"))).toEqual(["IO.SYS", "MSDOS.SYS"]);
  });

  test("a hidden file can be named once /A is given", () => {
    expect(names(dir("dir /a io.sys"))).toEqual(["IO.SYS"]);
  });

  test("the colon is optional", () => {
    expect(dir("dir /ah")).toEqual(dir("dir /a:h"));
  });

  test("the summary counts the same entries as the listing", () => {
    expect(dir("dir /a:h").some((row) => /^ +2 file\(s\) +78,704 bytes$/.test(row))).toBe(true);
  });
});

describe("/O", () => {
  test("alone sorts directories first, then by name", () => {
    expect(names(dir("dir /o"))).toEqual(ROOT_BY_NAME);
  });

  test("/ON sorts by name alone", () => {
    expect(names(dir("dir /on"))).toEqual([
      "AUTOEXEC.BAT",
      "COMMAND.COM",
      "CONFIG.SYS",
      "CREDITS.TXT",
      "DOS",
      "ODDWARE",
      "README.TXT",
    ]);
  });

  test("/OE sorts by extension", () => {
    const sorted = names(dir("dir /oe"));

    expect(sorted.slice(0, 2)).toEqual(["DOS", "ODDWARE"]);
    expect(sorted.slice(2)).toEqual(["AUTOEXEC.BAT", "COMMAND.COM", "CONFIG.SYS", "CREDITS.TXT", "README.TXT"]);
  });

  test("/OS and /O-S sort by size with the dot entries first", () => {
    expect(names(dir("dir /os dos"))).toEqual([".", "..", "HELP.COM", "DOSKEY.COM", "HIMEM.SYS", "MEM.EXE"]);
    expect(names(dir("dir /o-s dos"))).toEqual([".", "..", "MEM.EXE", "HIMEM.SYS", "DOSKEY.COM", "HELP.COM"]);
  });

  test("/OD puts the earliest entry first", () => {
    expect(names(dir("dir /od"))[0]).toBe("COMMAND.COM");
  });

  test("equal entries keep storage order", () => {
    expect(names(dir("dir /os dos /a"))).toEqual(names(dir("dir /os dos")));
  });

  test("the colon is optional", () => {
    expect(dir("dir /o:n")).toEqual(dir("dir /on"));
  });

  test("without /O the order is storage order", () => {
    expect(names(dir("dir"))[0]).toBe("COMMAND.COM");
  });
});

describe("/B", () => {
  test("prints names only", () => {
    expect(dir("dir /b")).toEqual([
      "COMMAND.COM",
      "DOS",
      "CONFIG.SYS",
      "AUTOEXEC.BAT",
      "ODDWARE",
      "README.TXT",
      "CREDITS.TXT",
    ]);
  });

  test("leaves out the dot entries", () => {
    expect(dir("dir /b dos")).toEqual(["HIMEM.SYS", "MEM.EXE", "DOSKEY.COM", "HELP.COM"]);
  });

  test("wins over /W", () => {
    expect(dir("dir /b /w")).toEqual(dir("dir /b"));
  });

  test("shows only File not found when nothing matches", () => {
    expect(dir("dir /b *.zzz")).toEqual(["File not found"]);
  });

  test("works with /A and /O", () => {
    expect(dir("dir /b /a /on")[0]).toBe("AUTOEXEC.BAT");
    expect(dir("dir /b /a:h")).toEqual(["IO.SYS", "MSDOS.SYS"]);
  });
});

describe("/L", () => {
  test("lower-cases names but not the header", () => {
    const rows = dir("dir /l");

    expect(rows).toContain(" Directory of C:\\");
    expect(rows.some((row) => row.startsWith("command  com"))).toBe(true);
    expect(rows.some((row) => row.includes("<DIR>"))).toBe(true);
  });

  test("works with /B and /W", () => {
    expect(dir("dir /l /b")[0]).toBe("command.com");
    expect(dir("dir /l /w")[4]).toContain("[oddware]");
  });
});

describe("/S", () => {
  test("lists each directory in turn", () => {
    const headers = dir("dir /s").filter((row) => row.startsWith(" Directory of"));

    expect(headers).toEqual([" Directory of C:\\", " Directory of C:\\DOS", " Directory of C:\\ODDWARE"]);
  });

  test("ends with totals and a single bytes-free row", () => {
    const rows = dir("dir /s");
    const total = rows.indexOf("Total files listed:");

    expect(total).toBeGreaterThan(0);
    expect(rows[total - 1]).toBe("");
    expect(rows[total + 1]).toMatch(/^ +10 file\(s\) +[\d,]+ bytes$/);
    expect(rows[total + 2]).toMatch(/bytes free$/);
    expect(rows.filter((row) => row.endsWith("bytes free"))).toHaveLength(1);
  });

  test("prints the volume rows once", () => {
    expect(dir("dir /s").filter((row) => row.startsWith(" Volume"))).toHaveLength(2);
  });

  test("applies the pattern in every directory and skips those without a match", () => {
    const rows = dir("dir *.exe /s");

    expect(rows.filter((row) => row.startsWith(" Directory of"))).toEqual([
      " Directory of C:\\DOS",
      " Directory of C:\\ODDWARE",
    ]);
    expect(names(rows)).toEqual(["MEM.EXE", "WORM.EXE"]);
  });

  test("shows File not found after the first header when nothing matches", () => {
    expect(dir("dir *.zzz /s")).toEqual([
      " Volume in drive C has no label",
      " Volume Serial Number is 0DD0-0314",
      " Directory of C:\\",
      "",
      "File not found",
    ]);
  });

  test("with /B prints full paths", () => {
    expect(dir("dir *.exe /s /b")).toEqual(["C:\\DOS\\MEM.EXE", "C:\\ODDWARE\\WORM.EXE"]);
    expect(dir("dir /s /b dos")).toEqual([
      "C:\\DOS\\HIMEM.SYS",
      "C:\\DOS\\MEM.EXE",
      "C:\\DOS\\DOSKEY.COM",
      "C:\\DOS\\HELP.COM",
    ]);
  });

  test("starts in the named directory", () => {
    const headers = dir("dir dos /s").filter((row) => row.startsWith(" Directory of"));

    expect(headers).toEqual([" Directory of C:\\DOS"]);
  });

  test("does not list hidden files without /A", () => {
    expect(names(dir("dir /s"))).not.toContain("IO.SYS");
    expect(names(dir("dir /s /a"))).toContain("IO.SYS");
  });
});

describe("/C, /CH and /-x", () => {
  test("/C and /CH change nothing", () => {
    expect(dir("dir /c")).toEqual(dir("dir"));
    expect(dir("dir /ch")).toEqual(dir("dir"));
  });

  test("/-W cancels /W on the command line", () => {
    expect(dir("dir /w /-w")).toEqual(dir("dir"));
  });

  test("a repeated switch is still refused", () => {
    expect(dir("dir /w /w")).toEqual(["Too many parameters"]);
  });
});

describe("DIRCMD", () => {
  test("presets the switches", () => {
    expect(dir("set dircmd=/w", "dir")).toEqual(dir("dir /w"));
  });

  test("the command line replaces a preset", () => {
    expect(dir("set dircmd=/o", "dir /on")).toEqual(dir("dir /on"));
  });

  test("/-w cancels a preset", () => {
    expect(dir("set dircmd=/w", "dir /-w")).toEqual(dir("dir"));
  });

  test("the same switch twice is not an error", () => {
    expect(dir("set dircmd=/w", "dir /w")).toEqual(dir("dir /w"));
  });

  test("a malformed value is ignored", () => {
    expect(dir("set dircmd=/q", "dir")).toEqual(dir("dir"));
    expect(dir("set dircmd=/w /q", "dir")).toEqual(dir("dir"));
  });

  test("removing the variable restores the default", () => {
    expect(dir("set dircmd=/w", "set dircmd=", "dir")).toEqual(dir("dir"));
  });

  test("is found without regard to case", () => {
    expect(dir("set DirCmd=/B", "dir")).toEqual(dir("dir /b"));
  });
});

describe("DIR /?", () => {
  test("lists the switches and equals HELP DIR", () => {
    const help = dir("dir /?").join("\n");

    ["/A", "/B", "/C", "/CH", "/L", "/O", "/P", "/S", "/W"].forEach((item) => {
      expect(help).toContain(item);
    });
    expect(dir("help dir")).toEqual(dir("dir /?"));
  });
});

describe("Files the other commands leave alone", () => {
  test("DEL, COPY, REN and TYPE do not reach the hidden system files", () => {
    const after = fromRoot("del *.*", "y", "copy *.* \\dos\\", "ren io.sys x.sys", "dir /a:h");

    expect(names(after.shown.slice(-12))).toEqual(["IO.SYS", "MSDOS.SYS"]);
  });
});
