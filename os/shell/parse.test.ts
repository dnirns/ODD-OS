import { describe, expect, test } from "vitest";

import { parseCommand, parseDriveCommand } from "./parse";

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

describe("parseCommand name terminators", () => {
  test.each([
    ["cd..", "CD", ".."],
    ["cd\\dos", "CD", "\\dos"],
    ["dir/w", "DIR", "/w"],
    ["ver.com", "VER", ".com"],
    ["type[x]", "TYPE", "[x]"],
    ["dir>x", "DIR", ">x"],
    ["dir|x", "DIR", "|x"],
    ["dir<x", "DIR", "<x"],
    ["dir+x", "DIR", "+x"],
    ['dir"x', "DIR", '"x'],
    ["c:ver", "C", ":ver"],
  ])("ends the name of %j", (line, name, tail) => {
    const parsed = parseCommand(line);

    expect(parsed.name).toBe(name);
    expect(parsed.tail).toBe(tail);
  });

  test("ends the name at a control character", () => {
    expect(parseCommand("ver\u0001x").name).toBe("VER");
  });

  test.each(["ver;", "ver,", "ver="])("ends the name of %j at a delimiter", (line) => {
    expect(parseCommand(line).name).toBe("VER");
  });

  test("passes a path to a command as its parameter", () => {
    expect(parseCommand("cd..").params).toEqual([".."]);
    expect(parseCommand("cd\\dos").params).toEqual(["\\dos"]);
  });
});

describe("parseDriveCommand", () => {
  test.each(["c:", "C:", "c:\\", "c:/", "  c:  ", "d:"])("accepts %j", (line) => {
    expect(parseDriveCommand(line)).toBe(line.trim().charAt(0).toUpperCase());
  });

  test.each(["c:ver", "c:\\dos", "c", "c: x", "ab:", ":"])("rejects %j", (line) => {
    expect(parseDriveCommand(line)).toBeUndefined();
  });
});
