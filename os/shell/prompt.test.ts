import { describe, expect, test } from "vitest";

import { EMPTY_ENVIRONMENT, setVariable } from "../environment/environment";
import { formatPromptTime } from "./dateTime";
import { formatPrompt } from "./prompt";

// Thursday 4 November 1993, 14:03:22.45 by the DOS clock.
const WHEN = new Date(Date.UTC(1993, 10, 4, 14, 3, 22, 450));

const prompt = (text: string | undefined, cwd = "C:\\", date = WHEN) =>
  formatPrompt(
    text === undefined ? EMPTY_ENVIRONMENT : setVariable(EMPTY_ENVIRONMENT, "PROMPT", text),
    cwd,
    date,
  );

describe("The default prompt", () => {
  test("is the drive letter and >", () => {
    expect(prompt(undefined)).toBe("C>");
    expect(prompt(undefined, "C:\\DOS")).toBe("C>");
  });
});

describe("Prompt codes", () => {
  test("$P$G is the drive, directory and >", () => {
    expect(prompt("$P$G")).toBe("C:\\>");
    expect(prompt("$P$G", "C:\\DOS")).toBe("C:\\DOS>");
  });

  test("$N is the drive letter", () => {
    expect(prompt("$N$G", "C:\\DOS")).toBe("C>");
  });

  test("$V is the version", () => {
    expect(prompt("$V$G")).toBe("ODD/OS Version 3.14>");
  });

  test("literal characters", () => {
    expect(prompt("$$ $Q $L$B$G")).toBe("$ = <|>");
  });

  test("a code in either case", () => {
    expect(prompt("$p$g", "C:\\DOS")).toBe("C:\\DOS>");
    expect(prompt("$v")).toBe("ODD/OS Version 3.14");
  });

  test("$T is the time with hundredths in 24 hours", () => {
    expect(prompt("$T$G")).toBe("14:03:22.45>");
  });

  test("$D is the date", () => {
    expect(prompt("$D$G")).toBe("Thu 11-04-1993>");
  });

  test("the time and date are those it is given", () => {
    const later = new Date(Date.UTC(1993, 10, 4, 14, 3, 23, 0));

    expect(prompt("$T", "C:\\", later)).toBe("14:03:23.00");
  });

  test("$_ is a line break", () => {
    expect(prompt("time is: $T$_date is: $D")).toBe("time is: 14:03:22.45\ndate is: Thu 11-04-1993");
  });

  test("$E is the escape character", () => {
    expect(prompt("$E$G")).toBe("\u001b>");
  });

  test("$H erases the previous character", () => {
    expect(prompt("AB$HC$G")).toBe("AC>");
  });

  test("$H at the start erases nothing", () => {
    expect(prompt("$HA")).toBe("A");
  });

  test("$H does not cross a line break", () => {
    expect(prompt("A$_$HB")).toBe("A\nB");
  });

  test("$H erases what a code gave", () => {
    expect(prompt("$G$H$P", "C:\\")).toBe("C:\\");
    expect(prompt("$N$H$G")).toBe(">");
  });

  test("an unknown code is dropped with its letter", () => {
    expect(prompt("a$zb$G")).toBe("ab>");
  });

  test("a $ at the end is dropped", () => {
    expect(prompt("Ready$")).toBe("Ready");
  });

  test("text with no codes is the prompt", () => {
    expect(prompt("Ready:")).toBe("Ready:");
  });

  test("an empty PROMPT value is the empty prompt", () => {
    expect(prompt("")).toBe("");
  });
});

describe("formatPromptTime", () => {
  test.each([
    [Date.UTC(1993, 0, 1, 0, 0, 0, 0), "00:00:00.00"],
    [Date.UTC(1993, 0, 1, 9, 5, 7, 90), "09:05:07.09"],
    [Date.UTC(1993, 0, 1, 12, 0, 0, 0), "12:00:00.00"],
    [Date.UTC(1993, 0, 1, 23, 59, 59, 999), "23:59:59.99"],
  ])("%d reads %s", (time, text) => {
    expect(formatPromptTime(new Date(time))).toBe(text);
  });
});
