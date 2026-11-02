import { describe, expect, test } from "vitest";

import { applySteps, createBootScreen, createBootSteps } from "./boot/bootSteps";
import { readFile } from "./fs/operations";
import { resolvePath } from "./fs/path";
import { createFilesystem } from "./fs/seed";
import { runCommand } from "./shell/commands";
import type { Screen } from "./terminal/screen";

const fs = createFilesystem();

const textOf = (path: string) => {
  const result = readFile(fs, "C:\\", path);
  if (!result.ok || result.value.kind !== "text") throw new Error(`${path} is not a text file`);
  return result.value.text;
};

const fileLines = (text: string) => text.split("\r\n").filter((line) => line !== "");

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const echoedCommands = (screen: Screen) =>
  screen.rows
    .map((_, row) => rowText(screen, row))
    .filter((text) => text.startsWith("C>"))
    .map((text) => text.slice("C>".length));

const memLines = () => {
  const result = runCommand("mem", { clock: { offsetMs: 0 }, now: 0 });
  if (result.type !== "print") throw new Error("MEM did not print");
  return result.lines;
};

const DRIVER_LINE = /^(DEVICE|DEVICEHIGH|INSTALL|INSTALLHIGH|SHELL)=(\S+)/i;
const HIMEM_LINE = /^DEVICE=C:\\DOS\\HIMEM\.SYS$/i;

const problems = (config: string, mem: readonly string[]): readonly string[] => {
  const settings = fileLines(config);
  const report = mem.join("\n");
  const usesHighMemoryArea = report.includes("resident in the high memory area");
  const upperIsEmpty = /^Upper\s+0K\s+0K\s+0K$/m.test(report);

  return [
    ...(usesHighMemoryArea && !settings.includes("DOS=HIGH")
      ? ["MEM reports the high memory area but CONFIG.SYS lacks DOS=HIGH"]
      : []),
    ...(usesHighMemoryArea && !settings.some((line) => HIMEM_LINE.test(line))
      ? ["MEM reports the high memory area but CONFIG.SYS does not load HIMEM.SYS"]
      : []),
    ...(!usesHighMemoryArea && settings.includes("DOS=HIGH")
      ? ["CONFIG.SYS sets DOS=HIGH but MEM does not report the high memory area"]
      : []),
    ...(upperIsEmpty
      ? settings
          .filter((line) => /EMM386|DEVICEHIGH|LOADHIGH|INSTALLHIGH|UMB/i.test(line))
          .map((line) => `MEM reports Upper 0K but CONFIG.SYS has ${line}`)
      : []),
    ...(!upperIsEmpty && !settings.some((line) => /EMM386/i.test(line))
      ? ["MEM reports upper memory but CONFIG.SYS loads no EMM386"]
      : []),
    ...settings
      .filter((line) => DRIVER_LINE.test(line) && !HIMEM_LINE.test(line))
      .map((line) => `${line} uses memory that MEM does not account for`),
  ];
};

describe("AUTOEXEC.BAT matches the boot", () => {
  const file = fileLines(textOf("C:\\AUTOEXEC.BAT"));

  test("Boot echo and file agree", () => {
    const screen = applySteps(createBootScreen(), createBootSteps());

    expect(echoedCommands(screen)).toEqual(file);
  });

  test("the reduced-motion boot echoes the same commands", () => {
    const screen = applySteps(createBootScreen(), createBootSteps({ reducedMotion: true }));

    expect(echoedCommands(screen)).toEqual(file);
  });

  test("the file has one command per line", () => {
    expect(file).toEqual(["PATH C:\\DOS", "DOSKEY /INSERT", "PROMPT $P$G"]);
  });

  test("a changed file would no longer match", () => {
    const screen = applySteps(createBootScreen(), createBootSteps());

    expect(echoedCommands(screen)).not.toEqual([...file, "ECHO OFF"]);
  });
});

describe("CONFIG.SYS matches MEM", () => {
  const config = textOf("C:\\CONFIG.SYS");

  test("MEM still reports the figures CONFIG.SYS is written for", () => {
    const report = memLines().join("\n");

    expect(report).toMatch(/^Upper\s+0K\s+0K\s+0K$/m);
    expect(report).toMatch(/^Conventional\s+640K\s+57K\s+583K$/m);
    expect(report).toContain("ODD/OS is resident in the high memory area.");
  });

  test("High memory configuration", () => {
    const settings = fileLines(config);

    expect(settings).toContain("DEVICE=C:\\DOS\\HIMEM.SYS");
    expect(settings).toContain("DOS=HIGH");
    expect(config).not.toMatch(/EMM386|DEVICEHIGH|LOADHIGH|UMB/i);
  });

  test("agrees with MEM", () => {
    expect(problems(config, memLines())).toEqual([]);
  });

  test("Referenced paths exist", () => {
    const referenced = fileLines(config)
      .map((line) => DRIVER_LINE.exec(line)?.[2])
      .filter((path): path is string => path !== undefined);

    expect(referenced).toEqual(["C:\\DOS\\HIMEM.SYS"]);
    referenced.forEach((path) => {
      expect(resolvePath(fs, "C:\\", path).ok).toBe(true);
    });
  });

  test("a driver that does not exist would be caught", () => {
    expect(resolvePath(fs, "C:\\", "C:\\DOS\\EMM386.EXE")).toEqual({
      ok: false,
      error: "FileNotFound",
    });
  });

  describe("disagreement is detected", () => {
    test("when CONFIG.SYS drops DOS=HIGH", () => {
      expect(problems(config.replace("DOS=HIGH\r\n", ""), memLines())).not.toEqual([]);
    });

    test("when CONFIG.SYS drops HIMEM.SYS", () => {
      expect(problems(config.replace("DEVICE=C:\\DOS\\HIMEM.SYS\r\n", ""), memLines())).not.toEqual([]);
    });

    test("when CONFIG.SYS loads something into upper memory", () => {
      expect(problems(`${config}DEVICEHIGH=C:\\DOS\\HIMEM.SYS\r\n`, memLines())).not.toEqual([]);
      expect(problems(`${config}DOS=UMB\r\n`, memLines())).not.toEqual([]);
    });

    test("when CONFIG.SYS loads another driver", () => {
      expect(problems(`${config}DEVICE=C:\\DOS\\ANSI.SYS\r\n`, memLines())).not.toEqual([]);
    });

    test("when MEM reports upper memory", () => {
      const altered = memLines().map((line) =>
        line.startsWith("Upper") ? "Upper                 64K       32K       32K" : line,
      );

      expect(problems(config, altered)).not.toEqual([]);
    });

    test("when MEM stops reporting the high memory area", () => {
      const altered = memLines().filter((line) => !line.includes("high memory area"));

      expect(problems(config, altered)).not.toEqual([]);
      expect(problems(config.replace("DOS=HIGH\r\n", ""), altered)).toEqual([]);
    });
  });
});
