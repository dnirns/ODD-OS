import { describe, expect, test } from "vitest";

import { formatRecord, HI_PATH, parseRecord } from "./wormHighScore";

describe("The high-score file", () => {
  test("Lives beside WORM.EXE", () => {
    expect(HI_PATH).toBe("C:\\ODDWARE\\WORM.HI");
  });

  test.each([
    [120, "120\r\n"],
    [0, "0\r\n"],
    [16_350, "16350\r\n"],
  ])("%i is written as its digits and CRLF", (score, text) => {
    expect(formatRecord(score)).toBe(text);
  });

  test.each([0, 10, 450, 16_350])("%i reads back as itself", (score) => {
    expect(parseRecord(formatRecord(score))).toBe(score);
  });
});

describe("Reading the record", () => {
  test.each([
    ["450", 450],
    ["450\r\n", 450],
    ["  450\t\r\n", 450],
    ["\n\n450\n", 450],
    ["00450", 450],
  ])("%j is a record of %i", (text, score) => {
    expect(parseRecord(text)).toBe(score);
  });

  test.each(["", "\r\n", "HELLO", "12A", "-5", "1.5", "1 2", "+5"])("%j is not a record", (text) => {
    expect(parseRecord(text)).toBeUndefined();
  });
});
