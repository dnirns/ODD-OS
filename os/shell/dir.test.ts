import { afterEach, describe, expect, test, vi } from "vitest";

import { NO_ATTRIBUTES } from "../fs/entries";
import type { Found, Listing } from "../fs/operations";
import { entryRow, formatDirDate, formatDirTime, listingLines } from "./dir";

afterEach(() => {
  vi.unstubAllEnvs();
});

const at = (month: number, day: number, hours: number, minutes: number, year = 1993) =>
  new Date(Date.UTC(year, month - 1, day, hours, minutes));

const file = (name: string, size: number, modified: Date): Listing => ({
  name,
  kind: "file",
  modified,
  attributes: NO_ATTRIBUTES,
  size,
});

const folder = (name: string, modified: Date): Listing => ({
  name,
  kind: "directory",
  modified,
  attributes: NO_ATTRIBUTES,
  size: 0,
});

const found = (entries: readonly Listing[], path = "C:\\"): Found => ({
  path,
  isRoot: path === "C:\\",
  modified: at(9, 14, 9, 12),
  entries,
});

const FREE = 356_188_160;
const lines = (entries: readonly Listing[], options = { wide: false }, path = "C:\\") =>
  listingLines(found(entries, path), { ...options, free: FREE });

describe("Directory listing layout", () => {
  test("starts with the volume lines and the directory", () => {
    expect(lines([file("A.TXT", 1, at(1, 2, 3, 4))]).slice(0, 4)).toEqual([
      " Volume in drive C has no label",
      " Volume Serial Number is 0DD0-0314",
      " Directory of C:\\",
      "",
    ]);
  });

  test("names the directory listed", () => {
    expect(lines([file("A.TXT", 1, at(1, 2, 3, 4))], { wide: false }, "C:\\DOS")[2]).toBe(
      " Directory of C:\\DOS",
    );
  });

  test("keeps storage order", () => {
    const rows = lines([
      file("Z.TXT", 1, at(1, 2, 3, 4)),
      file("A.TXT", 1, at(1, 2, 3, 4)),
      folder("M", at(1, 2, 3, 4)),
    ]).slice(4, 7);

    expect(rows.map((row) => row.slice(0, 5))).toEqual(["Z    ", "A    ", "M    "]);
  });
});

describe("Directory entry columns", () => {
  test("shows a file", () => {
    expect(entryRow(file("COMMAND.COM", 53_214, at(3, 10, 6, 0)))).toBe(
      "COMMAND  COM        53,214 03-10-93   6:00a",
    );
  });

  test("shows a directory", () => {
    expect(entryRow(folder("DOS", at(9, 14, 9, 12)))).toBe(
      "DOS          <DIR>         09-14-93   9:12a",
    );
  });

  test("starts the date in the same column for files and directories", () => {
    const fileRow = entryRow(file("A.B", 1, at(9, 14, 9, 12)));
    const directoryRow = entryRow(folder("A", at(9, 14, 9, 12)));

    expect(fileRow.indexOf("09-14-93")).toBe(directoryRow.indexOf("09-14-93"));
    expect(fileRow.length).toBe(directoryRow.length);
  });

  test("shows the afternoon with a p", () => {
    expect(entryRow(folder("ODDWARE", at(9, 20, 16, 48)))).toBe(
      "ODDWARE      <DIR>         09-20-93   4:48p",
    );
    expect(formatDirTime(at(9, 20, 16, 48))).toBe(" 4:48p");
  });

  test("shows midnight and noon as 12", () => {
    expect(formatDirTime(at(1, 1, 0, 5))).toBe("12:05a");
    expect(formatDirTime(at(1, 1, 12, 30))).toBe("12:30p");
    expect(formatDirTime(at(1, 1, 23, 59))).toBe("11:59p");
  });

  test("leaves the extension blank when a name has none", () => {
    expect(entryRow(file("README", 5, at(1, 2, 3, 4))).slice(0, 12)).toBe("README      ");
  });

  test("puts thousands separators in sizes", () => {
    expect(entryRow(file("A.B", 1_234_567, at(1, 2, 3, 4)))).toContain("1,234,567");
    expect(entryRow(file("A.B", 999, at(1, 2, 3, 4)))).toContain(" 999 ");
  });

  test("zero-pads the date to two digits", () => {
    expect(formatDirDate(at(1, 2, 3, 4, 2005))).toBe("01-02-05");
    expect(formatDirDate(at(12, 25, 3, 4, 1994))).toBe("12-25-94");
  });

  test("reads the UTC fields in every time zone", () => {
    const row = (zone: string) => {
      vi.stubEnv("TZ", zone);
      return entryRow(file("A.TXT", 1, at(3, 10, 6, 0)));
    };

    expect(row("Pacific/Auckland")).toBe("A        TXT             1 03-10-93   6:00a");
    expect(row("America/Los_Angeles")).toBe(row("Pacific/Auckland"));
  });
});

describe("Directory listing summary", () => {
  test("counts files and sums their sizes", () => {
    const rows = lines([
      file("A.TXT", 100, at(1, 2, 3, 4)),
      file("B.TXT", 1_000, at(1, 2, 3, 4)),
      folder("D", at(1, 2, 3, 4)),
    ]);

    expect(rows.slice(-2)).toEqual([
      "        2 file(s)          1,100 bytes",
      "                     356,188,160 bytes free",
    ]);
  });

  test("ends the byte total and the free space in the same column", () => {
    const [total, free] = lines([file("A.TXT", 100, at(1, 2, 3, 4))]).slice(-2);

    expect(total.indexOf(" bytes")).toBe(free.indexOf(" bytes free"));
  });

  test("does not count directories or dot entries", () => {
    const rows = lines(
      [folder(".", at(1, 2, 3, 4)), folder("..", at(1, 2, 3, 4)), file("A.TXT", 5, at(1, 2, 3, 4))],
      { wide: false },
      "C:\\DOS",
    );

    expect(rows.at(-2)).toContain("1 file(s)");
  });

  test("shows zero files for a directory of only dot entries", () => {
    const rows = lines([folder(".", at(1, 2, 3, 4)), folder("..", at(1, 2, 3, 4))], { wide: false }, "C:\\ODDWARE");

    expect(rows.at(-2)).toBe("        0 file(s)              0 bytes");
  });

  test("sums file sizes and not clusters", () => {
    expect(lines([file("A.TXT", 1, at(1, 2, 3, 4))]).at(-2)).toBe("        1 file(s)              1 bytes");
  });
});

describe("Dot entries", () => {
  test("shows . and .. as directories with their own date", () => {
    const rows = lines(
      [folder(".", at(9, 14, 9, 12)), folder("..", at(9, 14, 9, 12)), file("HIMEM.SYS", 29_104, at(3, 10, 6, 0))],
      { wide: false },
      "C:\\DOS",
    );

    expect(rows.slice(4, 7)).toEqual([
      ".            <DIR>         09-14-93   9:12a",
      "..           <DIR>         09-14-93   9:12a",
      "HIMEM    SYS        29,104 03-10-93   6:00a",
    ]);
  });
});

describe("Wide listings", () => {
  const entries = [
    file("COMMAND.COM", 1, at(1, 2, 3, 4)),
    folder("DOS", at(1, 2, 3, 4)),
    file("CONFIG.SYS", 1, at(1, 2, 3, 4)),
    file("AUTOEXEC.BAT", 1, at(1, 2, 3, 4)),
    folder("ODDWARE", at(1, 2, 3, 4)),
    file("README.TXT", 1, at(1, 2, 3, 4)),
  ];

  test("puts five entries on a row in 16-column fields", () => {
    const [first, second] = lines(entries, { wide: true }).slice(4);

    expect(first.split(/\s+/)).toEqual(["COMMAND.COM", "[DOS]", "CONFIG.SYS", "AUTOEXEC.BAT", "[ODDWARE]"]);
    expect(first.indexOf("[DOS]")).toBe(16);
    expect(first.indexOf("[ODDWARE]")).toBe(64);
    expect(second).toBe("README.TXT");
  });

  test("keeps the header and summary", () => {
    const rows = lines(entries, { wide: true });

    expect(rows[2]).toBe(" Directory of C:\\");
    expect(rows.at(-2)).toContain("4 file(s)");
    expect(rows.at(-1)).toContain("bytes free");
  });

  test("shows dot entries in brackets", () => {
    const rows = lines(
      [folder(".", at(1, 2, 3, 4)), folder("..", at(1, 2, 3, 4)), file("HIMEM.SYS", 1, at(1, 2, 3, 4))],
      { wide: true },
      "C:\\DOS",
    );

    expect(rows[4].split(/\s+/)).toEqual(["[.]", "[..]", "HIMEM.SYS"]);
  });
});

describe("hidden entries", () => {
  test("are left out of the rows, the count and the total", () => {
    const rows = lines([
      file("A.TXT", 10, at(1, 2, 3, 4)),
      { ...file("H.TXT", 1000, at(1, 2, 3, 4)), attributes: { ...NO_ATTRIBUTES, hidden: true } },
      { ...file("S.SYS", 1000, at(1, 2, 3, 4)), attributes: { ...NO_ATTRIBUTES, system: true } },
    ]);

    expect(rows.join("\n")).not.toContain("H ");
    expect(rows.at(-2)).toBe("        1 file(s)             10 bytes");
  });

  test("leave File not found when nothing else matches", () => {
    const rows = lines([
      { ...file("H.TXT", 1000, at(1, 2, 3, 4)), attributes: { ...NO_ATTRIBUTES, hidden: true } },
    ]);

    expect(rows.slice(-2)).toEqual(["", "File not found"]);
  });
});
