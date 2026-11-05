import { describe, expect, test } from "vitest";

import { setVariable } from "../environment/environment";
import { batchLines, batchParams, classifyLine, expandLine, isQuiet } from "./batch";

const environment = setVariable(setVariable([], "PATH", "C:\\DOS"), "Greeting", "Hello");
const params = batchParams("go", " one two,three");

const expand = (line: string) => expandLine(line, params, environment);

describe("batchLines", () => {
  test("splits on CR LF and LF and skips blank lines", () => {
    expect(batchLines("VER\r\n\r\nDIR\nMEM\r\n")).toEqual(["VER", "DIR", "MEM"]);
  });

  test("the end-of-file character ends the file", () => {
    expect(batchLines("VER\r\n\x1AMEM\r\n")).toEqual(["VER"]);
  });
});

describe("batchParams", () => {
  test("%0 is the name and %1 to %9 the words after it", () => {
    expect(params).toEqual(["go", "one", "two", "three"]);
  });

  test("only nine words are kept", () => {
    expect(batchParams("go", "1 2 3 4 5 6 7 8 9 10 11")).toHaveLength(10);
  });
});

describe("classifyLine", () => {
  test("a colon starts a label", () => {
    expect(classifyLine(":START")).toEqual({ type: "label" });
    expect(classifyLine("  :start")).toEqual({ type: "label" });
  });

  test("an at sign hides the echo and is dropped", () => {
    expect(classifyLine("@echo off")).toEqual({ type: "line", quiet: true, text: "echo off" });
    expect(classifyLine("  @ver")).toEqual({ type: "line", quiet: true, text: "ver" });
  });

  test("anything else is echoed as typed", () => {
    expect(classifyLine("  ver")).toEqual({ type: "line", quiet: false, text: "  ver" });
  });

  test("an at sign then a colon is a command, not a label", () => {
    expect(classifyLine("@:x")).toEqual({ type: "line", quiet: true, text: ":x" });
  });
});

describe("expandLine", () => {
  test("replaces %0 to %9, and an absent argument by nothing", () => {
    expect(expand("%0 %1 %3 [%4]")).toBe("go one three []");
  });

  test("replaces %NAME% in any letter case", () => {
    expect(expand("%path% %GREETING% %greeting%")).toBe("C:\\DOS Hello Hello");
  });

  test("an unset variable is nothing", () => {
    expect(expand("[%nothere%]")).toBe("[]");
  });

  test("%% is one percent sign", () => {
    expect(expand("100%%")).toBe("100%");
    expect(expand("%%path%%")).toBe("%path%");
  });

  test("a percent sign with no closing one stays as typed", () => {
    expect(expand("50% off")).toBe("50% off");
    expect(expand("%path")).toBe("%path");
    expect(expand("end%")).toBe("end%");
  });

  test("text between two percent signs is a variable name", () => {
    expect(expand("5% sure, 6% more")).toBe("5 more");
  });

  test("a line is cut at 127 characters", () => {
    expect(expand("x".repeat(200))).toHaveLength(127);
  });
});

describe("isQuiet", () => {
  test("results that print nothing", () => {
    expect(isQuiet({ type: "print", lines: [] })).toBe(true);
    expect(isQuiet({ type: "setEcho", echo: false })).toBe(true);
    expect(isQuiet({ type: "print", lines: ["x"] })).toBe(false);
    expect(isQuiet({ type: "clear" })).toBe(false);
  });
});
