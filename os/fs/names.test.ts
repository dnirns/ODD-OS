import { describe, expect, test } from "vitest";

import { normaliseName } from "./names";

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
