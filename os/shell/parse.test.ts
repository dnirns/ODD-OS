import { describe, expect, test } from "vitest";

import { parseCommand } from "./parse";

describe("parseCommand", () => {
  test("upper-cases the name", () => {
    expect(parseCommand("vEr").name).toBe("VER");
  });

  test.each([" ", "\t", ",", ";", "="])("skips a leading %j", (delimiter) => {
    expect(parseCommand(`${delimiter}${delimiter}ver`).name).toBe("VER");
  });

  test.each([",", ";", "=", " "])("ends the name at %j", (delimiter) => {
    const { name, params } = parseCommand(`help${delimiter}cls`);

    expect(name).toBe("HELP");
    expect(params).toEqual(["cls"]);
  });

  test("ends the name at a switch", () => {
    const { name, switches, params } = parseCommand("cls/?");

    expect(name).toBe("CLS");
    expect(switches).toEqual(["/?"]);
    expect(params).toEqual([]);
  });

  test("separates parameters from upper-cased switches", () => {
    const { params, switches } = parseCommand("mem foo /c/d bar");

    expect(params).toEqual(["foo", "bar"]);
    expect(switches).toEqual(["/C", "/D"]);
  });

  test("keeps the argument text intact for date parsing", () => {
    expect(parseCommand("date  12/25/1993 ").tail).toBe("12/25/1993");
  });

  test("gives an empty name when only delimiters are present", () => {
    expect(parseCommand(",;=").name).toBe("");
  });
});
