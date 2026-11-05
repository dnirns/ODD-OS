import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { COLUMNS } from "../terminal/screen";
import { createClock, readClock } from "./clock";
import { answerPrompt, type CommandContext, type CommandResult, runCommand } from "./commands";

const now = Date.UTC(2026, 10, 1, 12, 0);
const context: CommandContext = {
  clock: { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - now },
  now,
  disk: createDisk(),
};

const printed = (line: string) => {
  const result = runCommand(line, context);
  if (result.type !== "print") throw new Error(`expected print, got ${result.type}`);
  return result.lines;
};

const listed = (line: string) => {
  const result = runCommand(line, context);
  if (result.type !== "page" && result.type !== "print") throw new Error(`expected a list, got ${result.type}`);
  return result.lines;
};

const clockAfter = (result: CommandResult) => {
  if (result.type !== "setClock") throw new Error(`expected setClock, got ${result.type}`);
  return readClock(result.clock, now);
};

describe("unknown commands", () => {
  test.each(["foo /x", "attrib a b", "worm.exe", "constructor", "__proto__", "/x", ",;", "c:ver"])("rejects %j", (line) => {
    expect(printed(line)).toEqual(["Bad command or file name"]);
  });
});

describe("CLS and VER", () => {
  test("CLS clears", () => {
    expect(runCommand("cLs", context)).toEqual({ type: "clear" });
  });

  test("VER has one blank row before its text and one after", () => {
    expect(printed("ver")).toEqual(["", "ODD/OS Version 3.14", ""]);
  });

  test("stray arguments are ignored", () => {
    expect(runCommand("cls foo", context)).toEqual({ type: "clear" });
    expect(printed("ver foo")).toEqual(printed("ver"));
  });

  test.each(["cls /x", "ver /x", "ver/x"])("%s is an invalid switch", (line) => {
    expect(printed(line)).toEqual(["Invalid switch"]);
  });
});

describe("HELP", () => {
  test("lists working commands alphabetically", () => {
    const result = runCommand("help", context);
    const [heading, ...rows] = listed("help");

    expect(result.type).toBe("page");
    expect(heading).toBe("For more information on a specific command, type HELP command-name");
    expect(rows.map((row) => row.split(" ")[0])).toEqual([
      "CD",
      "CHDIR",
      "CLS",
      "COMMAND",
      "COPY",
      "DATE",
      "DEL",
      "DIR",
      "DOSKEY",
      "ECHO",
      "ERASE",
      "EXIT",
      "HELP",
      "MD",
      "MEM",
      "MKDIR",
      "PATH",
      "PROMPT",
      "RD",
      "REN",
      "RENAME",
      "RMDIR",
      "SET",
      "TIME",
      "TYPE",
      "VER",
    ]);
  });

  test.each([
    "CD",
    "CHDIR",
    "CLS",
    "COMMAND",
    "COPY",
    "DATE",
    "DEL",
    "DIR",
    "DOSKEY",
    "ECHO",
    "ERASE",
    "EXIT",
    "HELP",
    "MD",
    "MEM",
    "MKDIR",
    "RD",
    "REN",
    "RENAME",
    "RMDIR",
    "TIME",
    "TYPE",
    "VER",
  ])(
    "HELP %s matches its /? text",
    (name) => {
      expect(printed(`help ${name.toLowerCase()}`)).toEqual(printed(`${name} /?`));
      expect(printed(`${name}/?`)[0]).not.toBe("");
    },
  );

  test("Help for the new file commands", () => {
    const copy = printed("copy /?").join("\n");

    for (const option of ["/A", "/B", "/V", "/Y", "/-Y"]) expect(copy).toContain(option);
    expect(printed("del /?")).toEqual(printed("erase /?"));
    expect(printed("del /?").join("\n")).toContain("/P");
    expect(printed("md /?")).toEqual(printed("mkdir /?"));
    expect(printed("rd /?")).toEqual(printed("rmdir /?"));
    expect(printed("ren /?")).toEqual(printed("rename /?"));
  });

  test("unknown topics and bad arguments", () => {
    expect(printed("help foo")).toEqual(["Help not available for this command"]);
    expect(printed("help /x")).toEqual(["Invalid switch"]);
    expect(printed("help cls ver")).toEqual(["Too many parameters"]);
  });

  test("no line exceeds the screen width", () => {
    const lines = [
      "cd /?",
      "chdir /?",
      "cls /?",
      "date /?",
      "dir /?",
      "help /?",
      "mem /?",
      "time /?",
      "type /?",
      "ver /?",
      "copy /?",
      "del /?",
      "echo /?",
      "md /?",
      "rd /?",
      "ren /?",
      "mem",
    ].flatMap(printed);

    expect(listed("help").every((line) => line.length <= COLUMNS)).toBe(true);

    expect(lines.every((line) => line.length <= COLUMNS)).toBe(true);
  });
});

describe("Help for the filesystem commands", () => {
  test("DIR help names the switches that work and no others", () => {
    const text = printed("dir /?").join("\n");

    expect(text).toContain("/W");
    expect(text).toContain("/P");
    expect(text).not.toMatch(/\/[ABCLOS]\b/);
    expect(printed("help dir")).toEqual(printed("dir /?"));
  });

  test("shows help instead of listing", () => {
    expect(printed("dir /?").join("\n")).not.toContain("Volume in drive");
    expect(printed("dir /w /?")).toEqual(printed("dir /?"));
  });

  test("CD and CHDIR share a text and do not change directory", () => {
    const withDisk = { ...context, disk: { ...context.disk, cwd: "C:\\DOS" } };
    const result = runCommand("cd /?", withDisk);

    expect(result.type).toBe("print");
    expect(printed("chdir /?")).toEqual(printed("cd /?"));
    expect(printed("cd /?").join("\n")).toContain("CHDIR");
  });

  test("TYPE help gives its syntax and does not display the file", () => {
    expect(printed("type readme.txt /?")).toEqual(printed("type /?"));
    expect(printed("type /?").join("\n")).toContain("TYPE [drive:][path]filename");
  });

  test("help topics work in any case", () => {
    expect(printed("help CHDIR")).toEqual(printed("cd /?"));
    expect(printed("HELP Type")).toEqual(printed("type /?"));
  });
});

describe("Recognising a command", () => {
  test("runs a command ending at a dot", () => {
    expect(printed("ver.com")).toEqual(printed("ver"));
  });

  test("runs a command ending at other delimiters", () => {
    expect(printed("ver;")).toEqual(printed("ver"));
    expect(printed("ver,")).toEqual(printed("ver"));
    expect(printed("ver=")).toEqual(printed("ver"));
  });

  test("passes a path with no space to CD", () => {
    expect(runCommand("cd\\dos", context)).toEqual({ type: "setDirectory", cwd: "C:\\DOS" });
  });

  test("a drive before a name is not a command", () => {
    expect(printed("c:ver")).toEqual(["Bad command or file name"]);
  });
});

describe("Clearing the screen in a subdirectory", () => {
  test("CLS still just clears", () => {
    expect(runCommand("cls", { ...context, disk: { ...context.disk, cwd: "C:\\DOS" } })).toEqual({
      type: "clear",
    });
  });
});

describe("MEM", () => {
  const rows = printed("mem");
  const values = (label: string) => {
    const row = rows.find((text) => text.startsWith(label)) ?? "";
    return Array.from(row.slice(label.length).matchAll(/([\d,]+)K/g), ([, value]) =>
      Number(value.replaceAll(",", "")),
    );
  };

  test("starts with a blank row and ends with the high memory line", () => {
    expect(rows[0]).toBe("");
    expect(rows.at(-1)).toBe("ODD/OS is resident in the high memory area.");
  });

  test("reports the expected totals", () => {
    expect(values("Conventional")[0]).toBe(640);
    expect(values("Upper")[0]).toBe(0);
    expect(values("Reserved")[0]).toBe(384);
    expect(values("Extended (XMS)")[0]).toBe(7168);
    expect(values("Total memory")[0]).toBe(8192);
  });

  test.each(["Conventional", "Upper", "Reserved", "Extended (XMS)", "Total memory", "Total under 1 MB"])(
    "%s columns sum",
    (label) => {
      const [total, used, free] = values(label);
      expect(used + free).toBe(total);
    },
  );

  test("each column of the table sums to the total row", () => {
    const labels = ["Conventional", "Upper", "Reserved", "Extended (XMS)"];

    [0, 1, 2].forEach((column) => {
      const sum = labels.reduce((total, label) => total + values(label)[column], 0);
      expect(sum).toBe(values("Total memory")[column]);
    });
  });

  test("right-aligns the columns under their rule", () => {
    expect(rows[3]).toBe("Conventional         640K       57K      583K");
    expect(rows[6]).toBe("Extended (XMS)     7,168K       64K    7,104K");
  });

  test("errors", () => {
    expect(printed("mem /c")).toEqual(["Invalid switch"]);
    expect(printed("mem foo")).toEqual(["Too many parameters"]);
  });
});

describe("DATE", () => {
  test("shows the date and asks for a new one", () => {
    expect(runCommand("date", context)).toEqual({
      type: "ask",
      input: "date",
      lines: ["Current date is Mon 11-01-1993"],
    });
  });

  test("sets the date directly, keeping the time", () => {
    const date = clockAfter(runCommand("date 12/25/1993", context));

    expect(date.toISOString()).toBe("1993-12-25T15:45:12.340Z");
  });

  test("an invalid argument asks again without the current date", () => {
    expect(runCommand("date foo", context)).toEqual({
      type: "ask",
      input: "date",
      lines: ["", "Invalid date"],
    });
  });

  test("/? does not prompt", () => {
    expect(runCommand("date /?", context).type).toBe("print");
  });
});

describe("TIME", () => {
  test("shows the time and asks for a new one", () => {
    expect(runCommand("time", context)).toEqual({
      type: "ask",
      input: "time",
      lines: ["Current time is  3:45:12.34p"],
    });
  });

  test("sets the time directly, keeping the date", () => {
    const date = clockAfter(runCommand("time 17:59:02.22", context));

    expect(date.toISOString()).toBe("1993-11-01T17:59:02.220Z");
  });

  test("an invalid argument asks again", () => {
    expect(runCommand("time 25:00", context)).toEqual({
      type: "ask",
      input: "time",
      lines: ["", "Invalid time"],
    });
  });
});

describe("answerPrompt", () => {
  test.each(["", "   "])("keeps the value for %j", (line) => {
    expect(answerPrompt("date", line, context)).toEqual({ type: "print", lines: [] });
    expect(answerPrompt("time", line, context)).toEqual({ type: "print", lines: [] });
  });

  test("applies a valid entry", () => {
    expect(clockAfter(answerPrompt("date", "12-25-93", context)).getUTCDate()).toBe(25);
    expect(clockAfter(answerPrompt("time", "9", context)).getUTCHours()).toBe(9);
  });

  test("rejects extra text", () => {
    expect(answerPrompt("date", "12-25-93 foo", context).type).toBe("ask");
  });
});

test("createClock output works with commands", () => {
  const clock = createClock(now);

  expect(runCommand("date", { clock, now, disk: createDisk() }).type).toBe("ask");
});
