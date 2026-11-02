import { describe, expect, test } from "vitest";

import { matchesPattern, normaliseName, parsePattern } from "./names";

const normalised = (name: string) => {
  const result = normaliseName(name);
  return result.ok ? result.value : result.error;
};

describe("Case-insensitive names", () => {
  test.each([
    ["readme.txt", "README.TXT"],
    ["README.TXT", "README.TXT"],
    ["ReadMe.Txt", "README.TXT"],
    ["notes", "NOTES"],
  ])("stores %s as %s", (name, expected) => {
    expect(normalised(name)).toBe(expected);
  });
});

describe("Long names are truncated", () => {
  test.each([
    ["AUTOEXECUTE.BATCH", "AUTOEXEC.BAT"],
    ["LONGFILENAME.TEXT", "LONGFILE.TEX"],
    ["LONGFILENAME", "LONGFILE"],
    ["A.TEXT", "A.TEX"],
  ])("shortens %s to %s", (name, expected) => {
    expect(normalised(name)).toBe(expected);
  });

  test("leaves names that already fit", () => {
    expect(normalised("12345678.123")).toBe("12345678.123");
  });

  test("drops an empty extension", () => {
    expect(normalised("A.")).toBe("A");
  });
});

describe("Invalid names", () => {
  test.each([
    "",
    "*.TXT",
    "A?.TXT",
    "A+B.TXT",
    "A B.TXT",
    "A,B",
    "A;B",
    "A=B",
    "A[1]",
    "A|B",
    'A"B',
    "A<B>",
    "A:B",
    "A/B",
    "A\\B",
    "A.B.C",
    "...",
    ".TXT",
    ".",
    "..",
    "CAFÉ.TXT",
    "TAB\t.TXT",
  ])("rejects %j", (name) => {
    expect(normalised(name)).toBe("InvalidName");
  });

  test.each(["A!B", "A#B", "A$B", "A%B", "A&B", "A'B", "A(B)", "A-B", "A@B", "A^B", "A_B", "A`B", "A{B}", "A~B"])(
    "accepts %s",
    (name) => {
      expect(normalised(name)).toBe(name.toUpperCase());
    },
  );
});

describe("Device names", () => {
  test.each(["CON", "con", "AUX", "PRN", "NUL", "CLOCK$", "COM1", "COM4", "LPT1", "LPT3", "Lpt2"])(
    "rejects %s",
    (name) => {
      expect(normalised(name)).toBe("InvalidName");
    },
  );

  test.each(["LPT1.TXT", "CLOCK$.DAT", "con.sys", "NUL.X"])("rejects %s with an extension", (name) => {
    expect(normalised(name)).toBe("InvalidName");
  });

  test.each(["CONSOLE", "COM5", "COM", "LPT4", "PRINTER", "CON1", "CLOCK"])("accepts %s", (name) => {
    expect(normalised(name)).toBe(name.toUpperCase());
  });
});

const matches = (pattern: string, name: string) => {
  const parsed = parsePattern(pattern);
  return parsed.ok && matchesPattern(parsed.value, name);
};

describe("Wildcard matching", () => {
  test.each([
    ["README.TXT", "*.TXT"],
    ["README.TXT", "READ*.*"],
    ["README.TXT", "R*.T*"],
    ["README.TXT", "*.*"],
    ["README.TXT", "*"],
    ["ODDWARE", "*.*"],
  ])("star fills a field: %s matches %s", (name, pattern) => {
    expect(matches(pattern, name)).toBe(true);
  });

  test.each([
    ["CONFIG.SYS", "CONFI?.SYS"],
    ["CONFIG.SYS", "?ONFIG.S?S"],
    ["CONFIG.SYS", "C?????.S?S"],
  ])("question mark: %s matches %s", (name, pattern) => {
    expect(matches(pattern, name)).toBe(true);
  });

  test("question mark also matches no character at the end of a field", () => {
    expect(matches("A??.TXT", "A.TXT")).toBe(true);
    expect(matches("A?.TXT", "ABC.TXT")).toBe(false);
  });

  test("the base name and extension are matched separately", () => {
    expect(matches("READ*.S*", "README.TXT")).toBe(false);
    expect(matches("*.TXT", "README.SYS")).toBe(false);
  });

  test("ignores letter case", () => {
    expect(matches("Read*.Txt", "readme.txt")).toBe(true);
  });

  test("a pattern with no extension matches only names with none", () => {
    expect(matches("ODDWARE", "README.TXT")).toBe(false);
    expect(matches("README", "README.TXT")).toBe(false);
    expect(matches("ODDWARE", "ODDWARE")).toBe(true);
  });

  test("a base name ending in a star matches any extension", () => {
    expect(matches("READ*", "README.TXT")).toBe(true);
    expect(matches("READ*", "README")).toBe(true);
    expect(matches("R?AD*", "README.TXT")).toBe(true);
  });

  test("a trailing dot means a blank extension", () => {
    expect(matches("README.", "README.TXT")).toBe(false);
    expect(matches("README.", "README")).toBe(true);
  });

  test("long patterns are truncated to 8.3", () => {
    expect(matches("README.TXTX", "README.TXT")).toBe(true);
    expect(matches("READMEFILE", "README")).toBe(false);
    expect(matches("READMEXX.TXT", "READMEXX.TXT")).toBe(true);
  });

  test.each(["A.B.C", ".TXT", "A+B", "A B", "CAF\u00c9", "A/B"])(
    "rejects the pattern %j",
    (pattern) => {
      expect(parsePattern(pattern)).toEqual({ ok: false, error: "InvalidName" });
    },
  );

  test("names still reject wildcards", () => {
    expect(normalised("*.TXT")).toBe("InvalidName");
    expect(normalised("A?.TXT")).toBe("InvalidName");
  });
});
