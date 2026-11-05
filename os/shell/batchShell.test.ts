import { describe, expect, test } from "vitest";

import { createDisk, type Disk } from "../fs/disk";
import { deleteFile, writeFile } from "../fs/operations";
import { createScreen, moveCursor, type Screen, writeText } from "../terminal/screen";
import { batchDelay, createShell, reduceShell, startup, tickShell, type ShellState } from "./shell";
import { STARTING_ENVIRONMENT } from "./environmentCommands";
import { PROMPT } from "./prompt";
import type { ShellKey } from "./shellKeys";

const NOW = Date.UTC(2026, 10, 1, 12, 0);
const CLOCK = { offsetMs: Date.UTC(1993, 10, 1, 15, 45, 12, 340) - NOW };

const key = (type: Exclude<ShellKey["type"], "char">): ShellKey => ({ type });
const type = (text: string): ShellKey[] => Array.from(text, (char) => ({ type: "char", char }));
const enter = key("enter");

const diskWith = (files: Readonly<Record<string, string>>): Disk =>
  Object.entries(files).reduce((disk, [path, text]) => {
    const written = writeFile(disk.filesystem, "C:\\", path, text, new Date(0));
    if (!written.ok) throw new Error(`cannot write ${path}`);
    return { ...disk, filesystem: written.value };
  }, createDisk());

const shellOn = (disk: Disk): ShellState =>
  createShell(moveCursor(writeText(createScreen(), 0, 0, PROMPT), 0, PROMPT.length), CLOCK, disk);

const press = (state: ShellState, ...keys: readonly ShellKey[]) =>
  keys.reduce((current, item) => reduceShell(current, { key: item, now: NOW }), state);

const submit = (state: ShellState, line: string) => press(state, ...type(line), enter);

// Ticks until the batch has finished or is waiting for the visitor.
const settle = (state: ShellState): ShellState => {
  let current = state;
  for (let step = 0; step < 200 && batchDelay(current) !== undefined; step += 1) {
    current = tickShell(current, NOW);
  }
  return current;
};

const go = (files: Readonly<Record<string, string>>, ...lines: readonly string[]) =>
  lines.reduce((state, line) => settle(submit(state, line)), shellOn(diskWith(files)));

const rowText = (screen: Screen, row: number) =>
  screen.rows[row].map((cell) => cell.char).join("").trimEnd();

const shownRows = ({ screen }: ShellState) =>
  screen.rows.map((_, row) => rowText(screen, row)).filter((text) => text !== "");

const bat = (...lines: readonly string[]) => lines.map((line) => `${line}\r\n`).join("");

describe("Running a batch file", () => {
  test("runs by name and by name with its extension", () => {
    const files = { "GO.BAT": bat("ECHO hello") };

    expect(shownRows(go(files, "go"))).toContain("hello");
    expect(shownRows(go(files, "go.bat"))).toContain("hello");
  });

  test("echoes each line after the prompt, then shows the prompt again", () => {
    const shell = go({ "GO.BAT": bat("ECHO hi", "VER") }, "go");

    expect(shownRows(shell).slice(0, 3)).toEqual(["C:\\>go", "C:\\>ECHO hi", "hi"]);
    expect(shownRows(shell).at(-1)).toBe("C:\\>");
    expect(shell.input).toEqual({ type: "command" });
  });

  test("@ hides one line's echo", () => {
    const rows = shownRows(go({ "GO.BAT": bat("@ECHO hi") }, "go"));

    expect(rows).toContain("hi");
    expect(rows).not.toContain("C:\\>ECHO hi");
  });

  test("ECHO OFF stops the echo and the setting returns when the batch ends", () => {
    const shell = go({ "GO.BAT": bat("@ECHO OFF", "ECHO quiet") }, "go");
    const rows = shownRows(shell);

    expect(rows).toContain("quiet");
    expect(rows).not.toContain("C:\\>ECHO quiet");
    expect(shell.echo).toBe(true);
    expect(rows.at(-1)).toBe("C:\\>");
  });

  test("a label is neither run nor echoed", () => {
    const rows = shownRows(go({ "GO.BAT": bat(":START", "ECHO after") }, "go"));

    expect(rows.some((row) => row.includes(":START"))).toBe(false);
    expect(rows).toContain("after");
  });

  test("a failing line is reported and the next line runs", () => {
    const rows = shownRows(go({ "GO.BAT": bat("nonsense", "ECHO next") }, "go"));

    expect(rows).toContain("Bad command or file name");
    expect(rows).toContain("next");
  });

  test("replaces parameters and variables", () => {
    const rows = shownRows(go({ "GO.BAT": bat("ECHO %1-%2 %path%") }, "go a b"));

    expect(rows).toContain("a-b C:\\DOS");
  });

  test("does not replace them at the prompt", () => {
    expect(shownRows(go({}, "echo %path%"))).toContain("%path%");
  });

  test("a programme of the same name runs before the batch", () => {
    const rows = shownRows(go({ "VER.BAT": bat("ECHO from batch") }, "ver"));

    expect(rows).not.toContain("from batch");
  });

  test("a batch run from a batch replaces it", () => {
    const rows = shownRows(
      go({ "A.BAT": bat("B", "ECHO back in a"), "B.BAT": bat("ECHO in b") }, "a"),
    );

    expect(rows).toContain("in b");
    expect(rows).not.toContain("back in a");
  });

  test("a batch run from a batch keeps the echo setting from before the first", () => {
    const shell = go({ "A.BAT": bat("@ECHO OFF", "B"), "B.BAT": bat("ECHO in b") }, "a");

    expect(shell.echo).toBe(true);
  });

  test("nothing is shown between lines but the lines", () => {
    const shown = shownRows(go({ "GO.BAT": bat("@ECHO one", "@ECHO two") }, "go"));

    expect(shown.slice(0, 4)).toEqual(["C:\\>go", "one", "two", "C:\\>"]);
  });
});

describe("Keys while a batch runs", () => {
  test("typed keys are ignored between lines", () => {
    const started = submit(shellOn(diskWith({ "GO.BAT": bat("VER", "VER") })), "go");
    const typed = press(started, ...type("dir"));

    expect(typed).toBe(started);
    expect(started.input).toEqual({ type: "batch" });
  });

  test("a line waits for the next tick", () => {
    const started = submit(shellOn(diskWith({ "GO.BAT": bat("@ECHO one", "@ECHO two") })), "go");

    expect(shownRows(started)).toEqual(["C:\\>go"]);
    expect(batchDelay(started)).toBe(0);
    expect(shownRows(tickShell(started, NOW))).toEqual(["C:\\>go", "one"]);
  });
});

describe("Stopping a batch", () => {
  const ctrlC = key("break");
  const looping = () => submit(shellOn(diskWith({ "GO.BAT": bat("PAUSE", "ECHO more") })), "go");
  const waiting = () => settle(looping());

  test("Ctrl+C asks whether to terminate", () => {
    const asked = press(waiting(), ctrlC);

    expect(shownRows(asked).slice(-2)).toEqual(["Press any key to continue . . .^C", "Terminate batch job (Y/N)?"]);
  });

  test("Y ends the batch and returns the prompt", () => {
    const ended = press(waiting(), ctrlC, { type: "char", char: "y" });

    expect(ended.batch).toBeUndefined();
    expect(ended.input).toEqual({ type: "command" });
    expect(shownRows(ended)).not.toContain("more");
    expect(shownRows(ended).at(-1)).toBe("C:\\>");
  });

  test("Y restores the echo setting", () => {
    const shell = submit(shellOn(diskWith({ "GO.BAT": bat("@ECHO OFF", "PAUSE") })), "go");
    const ended = press(settle(shell), ctrlC, { type: "char", char: "Y" });

    expect(ended.echo).toBe(true);
  });

  test("N lets the batch carry on", () => {
    const resumed = settle(press(waiting(), ctrlC, { type: "char", char: "n" }, { type: "char", char: "x" }));

    expect(shownRows(resumed)).toContain("more");
  });

  test("other keys are ignored while it asks", () => {
    const asked = press(waiting(), ctrlC);

    expect(press(asked, { type: "char", char: "q" }, enter).input.type).toBe("terminate");
  });

  test("Ctrl+C at the prompt does nothing to the shell", () => {
    const idle = shellOn(createDisk());

    expect(press(idle, ctrlC)).toBe(idle);
  });
});

describe("Batches and secondary interpreters", () => {
  test("a batch is suspended by COMMAND and comes back with EXIT", () => {
    const inner = submit(shellOn(diskWith({ "GO.BAT": bat("@ECHO one", "COMMAND", "@ECHO two") })), "go");
    const nested = settle(inner);

    expect(nested.depth).toBe(1);
    expect(nested.batch).toBeUndefined();
    expect(nested.outerBatches).toHaveLength(1);
    expect(shownRows(nested)).not.toContain("two");

    const back = settle(submit(nested, "exit"));

    expect(back.depth).toBe(0);
    expect(shownRows(back)).toContain("two");
    expect(back.batch).toBeUndefined();
  });
});

describe("REM and PAUSE", () => {
  test("REM prints nothing", () => {
    expect(shownRows(go({}, "rem anything"))).toEqual(["C:\\>rem anything", "C:\\>"]);
  });

  test("PAUSE waits for any key at the prompt", () => {
    const paused = submit(shellOn(createDisk()), "pause");

    expect(shownRows(paused).at(-1)).toBe("Press any key to continue . . .");
    expect(shownRows(press(paused, key("escape"))).at(-1)).toBe("C:\\>");
  });

  test("PAUSE in a batch waits and then the batch goes on", () => {
    const paused = settle(submit(shellOn(diskWith({ "GO.BAT": bat("PAUSE", "@ECHO after") })), "go"));

    expect(shownRows(paused).at(-1)).toBe("Press any key to continue . . .");
    expect(shownRows(settle(press(paused, { type: "char", char: " " })))).toContain("after");
  });
});

describe("The startup", () => {
  const screen = () => moveCursor(writeText(createScreen(), 0, 0, "Starting ODD/OS..."), 1, 0);
  const boot = (files: Readonly<Record<string, string>>, instant: boolean) =>
    startup(
      createShell(screen(), CLOCK, diskWith(files), undefined, STARTING_ENVIRONMENT),
      NOW,
      instant,
    );

  test("runs a kept AUTOEXEC.BAT", () => {
    const shell = boot({ "AUTOEXEC.BAT": bat("PROMPT Ready:", "SET GREETING=Hi") }, true);

    expect(shell.environment.map(({ name }) => name)).toEqual(["COMSPEC", "PROMPT", "GREETING"]);
    expect(shownRows(shell).at(-1)).toBe("Ready:");
  });

  test("Esc during the paced startup runs the rest at once", () => {
    const paced = boot({}, false);
    const slow = boot({ "AUTOEXEC.BAT": bat("PROMPT Ready:") }, false);

    expect(batchDelay(slow)).toBe(1800);
    expect(batchDelay(paced)).toBeDefined();
    expect(shownRows(press(slow, key("escape"))).at(-1)).toBe("Ready:");
  });

  test("Esc is ignored during an ordinary batch", () => {
    const started = submit(shellOn(diskWith({ "GO.BAT": bat("@ECHO one", "@ECHO two") })), "go");

    expect(press(started, key("escape"))).toBe(started);
  });

  test("without the file the date and time are asked for, then C>", () => {
    const removed = deleteFile(createDisk().filesystem, "C:\\", "AUTOEXEC.BAT");
    if (!removed.ok) throw new Error("cannot delete");
    const asked = startup(
      createShell(screen(), CLOCK, { ...createDisk(), filesystem: removed.value }, undefined, STARTING_ENVIRONMENT),
      NOW,
      true,
    );

    expect(shownRows(asked).at(-2)).toMatch(/^Current date is /);
    expect(shownRows(asked).at(-1)).toBe("Enter new date (mm-dd-yy):");

    const dated = settle(press(asked, enter));
    expect(shownRows(dated).at(-1)).toBe("Enter new time:");

    const timed = settle(press(dated, enter));
    expect(shownRows(timed).at(-1)).toBe("C>");
    expect(timed.batch).toBeUndefined();
  });
});
