import { describe, expect, test } from "vitest";

import { createScreen, moveCursor, type Screen, writeText } from "../terminal/screen";
import { PROMPT } from "./prompt";
import { createShell, reduceShell, type ShellState, tickShell } from "./shell";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const type = (text: string): ShellKey[] => Array.from(text, (char) => ({ type: "char", char }));
const enter: ShellKey = { type: "enter" };

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, key) => reduceShell(current, { key, now: NOW }), state);

const run = (state: ShellState, ...lines: readonly string[]) =>
  lines.reduce((current, line) => press(current, ...type(line), enter), state);

const shell = () => createShell(moveCursor(writeText(createScreen(), 0, 0, PROMPT), 0, PROMPT.length), CLOCK);

const text = (screen: Screen) => screen.rows.map((row) => row.map((cell) => cell.char).join("").trimEnd());

const tickUntil = (state: ShellState, done: (rows: readonly string[]) => boolean) => {
  let current = state;
  for (let count = 0; count < 20_000 && !done(text(current.screen)); count += 1) current = tickShell(current, NOW);
  return current;
};

describe("DEFRAG at the prompt", () => {
  test("help lists DEFRAG with its summary", () => {
    const rows = text(run(shell(), "help").screen);

    expect(rows.some((row) => row.startsWith("DEFRAG   Reorganizes the files on a disk"))).toBe(true);
  });

  test("defrag /? prints the same rows as help defrag, without starting", () => {
    const help = run(shell(), "defrag /?");
    const topic = run(shell(), "help defrag");

    expect(help.running).toBeUndefined();
    expect(text(help.screen).slice(1, 14)).toEqual(text(topic.screen).slice(1, 14));
    expect(text(help.screen)[1]).toBe("Reorganizes the files on a disk to optimize disk performance.");
  });

  test("not on the path, it is a bad command", () => {
    const state = run(shell(), "set path=", "defrag");

    expect(state.running).toBeUndefined();
    expect(text(state.screen)).toContain("Bad command or file name");
  });

  test("a refusal prints and the screen does not clear", () => {
    const state = run(shell(), "defrag /q");

    expect(state.running).toBeUndefined();
    expect(text(state.screen).slice(0, 3)).toEqual([`${PROMPT}defrag /q`, "Invalid switch", ""]);
  });

  test("a full run leaves C:\\FILE0000.CHK, which TYPE shows", () => {
    const launched = press(run(shell(), "defrag"), enter);
    const recommended = tickUntil(launched, (rows) => rows.some((row) => row.includes("Recommended optimization method:")));
    const holding = tickUntil(press(recommended, enter), (rows) => rows.some((row) => row.includes("Optimization complete.")));
    const finished = press(holding, enter, enter);
    const exited = press(finished, ...[2, 1].flatMap(() => [{ type: "right" } as ShellKey]), enter);

    expect(launched.running).toBeDefined();
    expect(exited.running).toBeUndefined();

    const typed = text(run(exited, "cls", "type \\file0000.chk").screen);
    expect(typed.join("\n")).toContain("█");
    expect(typed.some((row) => row.startsWith("ORDINARY DATA DEVICES XRS 0000: "))).toBe(true);
    expect(text(run(exited, "cls", "dir /b").screen)).toContain("FILE0000.CHK");
  });
});
