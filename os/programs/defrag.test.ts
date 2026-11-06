import { describe, expect, test } from "vitest";

import { createDisk } from "../fs/disk";
import { findChild } from "../fs/entries";
import { createClock } from "../shell/clock";
import { DEFRAG } from "./defrag";
import { programmeFiles } from "./files";
import { print } from "./output";
import type { Exited, ProgrammeArgs, ProgrammeContext, ProgrammeKey, Running } from "./types";

const NOW = Date.UTC(2026, 10, 1, 12, 0);

const context: ProgrammeContext = {
  disk: createDisk(),
  clock: createClock(NOW),
  now: NOW,
  history: [],
  commands: [],
  environment: [],
  files: programmeFiles("C:\\DOS", createClock(NOW)),
};

const args = (...words: string[]): ProgrammeArgs => ({
  rest: ` ${words.join(" ")}`,
  tail: words.join(" "),
  params: words.filter((word) => !word.startsWith("/")),
  switches: words.filter((word) => word.startsWith("/")).map((word) => word.toUpperCase()),
});

const started = (...words: string[]) => {
  const result = DEFRAG.start(args(...words), context);
  if (result.type !== "running") throw new Error(`expected running, got ${result.type}`);
  return result;
};

const step = (running: Running | Exited, event: "tick" | ProgrammeKey["type"]): Running | Exited => {
  if (running.type === "exit") return running;
  return running.step(event === "tick" ? { type: "tick", now: NOW } : { type: "key", key: { type: event } as ProgrammeKey, now: NOW });
};

const until = (running: Running | Exited, done: (screen: string) => boolean) => {
  let current = running;
  for (let count = 0; count < 20_000; count += 1) {
    if (current.type === "exit") return current;
    if (done(current.screen.rows.map((row) => row.map((cell) => cell.char).join("")).join("\n"))) return current;
    current = step(current, "tick");
  }
  throw new Error("stuck");
};

describe("DEFRAG switches", () => {
  test.each([
    ["/q", "Invalid switch"],
    ["/sn", "Invalid switch"],
    ["/b", "Invalid switch"],
    ["/lcd", "Invalid switch"],
    ["/bw", "Invalid switch"],
    ["/f /u", "Invalid switch"],
    ["a:", "Invalid drive specification"],
    ["c: d:", "Too many parameters"],
  ])("%s prints %s without starting", (line, message) => {
    expect(DEFRAG.start(args(...line.split(" ")), context)).toEqual(print(message));
  });

  test.each(["", "c:", "C:", "/skiphigh /g0", "/h", "/f", "/u", "c: /f"])("%j starts", (line) => {
    expect(started(...line.split(" ").filter(Boolean)).type).toBe("running");
  });

  test("with a drive, starts reading it at once", () => {
    expect(started("c:").tickMs).toBeDefined();
    expect(started("c:").screen.rows.some((row) => row.map((cell) => cell.char).join("").includes("Select Drive"))).toBe(false);
  });

  test("with no drive, shows the drive list and waits", () => {
    const list = started();
    const text = list.screen.rows.map((row) => row.map((cell) => cell.char).join("")).join("\n");

    expect(text).toContain("Select Drive");
    expect(text).toContain("[-C-]");
    expect(list.tickMs).toBeUndefined();
  });

  test("Enter on the drive list reads the drive", () => {
    const reading = step(started(), "enter");

    expect(reading.type === "running" && reading.tickMs).toBeDefined();
  });

  test("Escape or Cancel on the drive list returns to the prompt", () => {
    expect(step(started(), "escape")).toEqual({ type: "exit" });
    expect(step(step(step(started(), "tab"), "tab"), "enter")).toEqual({ type: "exit" });
  });

  test("/F with no drive shows the drive list first", () => {
    expect(started("/f").tickMs).toBeUndefined();
  });
});

describe("DEFRAG help", () => {
  test("names the drive and each accepted switch", () => {
    const help = DEFRAG.help.join("\n");

    expect(DEFRAG.help[0]).toBe("Reorganizes the files on a disk to optimize disk performance.");
    expect(help).toContain("DEFRAG [drive:] [/F] [/U] [/H] [/SKIPHIGH] [/G0]");
    for (const item of ["drive:", "/F", "/U", "/H", "/SKIPHIGH", "/G0"]) expect(help).toContain(`  ${item}`);
    expect(DEFRAG.help.every((line) => line.length <= 80)).toBe(true);
  });
});

describe("Leaving DEFRAG", () => {
  test("Escape twice from the start returns no disk when nothing changed", () => {
    const analysed = until(started("c:"), (screen) => screen.includes("Recommended optimization method:"));

    expect(step(step(analysed, "escape"), "escape")).toEqual({ type: "exit" });
  });

  test("/F returns the disk with the recovered file", () => {
    const holding = until(started("c:", "/f"), (screen) => screen.includes("Optimization complete."));
    const finished = step(holding, "enter");
    const exited = step(finished, "enter");

    expect(exited.type).toBe("exit");
    if (exited.type !== "exit") return;
    expect(exited.disk && findChild(exited.disk.filesystem.root, "FILE0000.CHK")).toBeDefined();
  });
});
