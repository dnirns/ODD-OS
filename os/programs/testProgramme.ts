import { changeDirectory, createDisk, type Disk } from "../fs/disk";
import { writeFile } from "../fs/operations";
import { clearScreen, createScreen, setCursorVisible, writeText } from "../terminal/screen";
import { PROGRAMMES } from "./registry";
import type {
  FullscreenProgramme,
  ProgrammeKey,
  Registry,
  Running,
} from "./types";

// A fullscreen programme for tests. It is never in the production registry.
//   Escape  exits, changing nothing
//   d       exits having changed the working directory to C:\DOS
//   x       fails
// Any other key and every tick is counted on screen.

export const TEST_PROGRAMME_PATH = "C:\\ODDWARE\\TEST.EXE";

const name = (key: ProgrammeKey) => (key.type === "char" ? key.char : key.type);

const draw = (keys: number, last: string, ticks: number) =>
  setCursorVisible(
    [
      "TEST PROGRAMME",
      `KEYS: ${keys} LAST: ${last}`,
      `TICKS: ${ticks}`,
    ].reduce(
      (screen, text, row) => writeText(screen, row, 0, text),
      clearScreen(createScreen()),
    ),
    false,
  );

const running = (
  disk: Disk,
  tickMs: number | undefined,
  keys: number,
  last: string,
  ticks: number,
): Running => ({
  type: "running",
  screen: draw(keys, last, ticks),
  tickMs,
  step: (event) => {
    if (event.type === "tick") return running(disk, tickMs, keys, last, ticks + 1);

    const { key } = event;
    if (key.type === "escape") return { type: "exit" };
    if (key.type === "char" && key.char === "x") throw new Error("test programme failed");
    if (key.type === "char" && key.char === "d") {
      const changed = changeDirectory(disk, "\\DOS");
      return changed.ok ? { type: "exit", disk: changed.value } : { type: "exit" };
    }

    return running(disk, tickMs, keys + 1, name(key), ticks);
  },
});

export const createTestProgramme = (tickMs?: number): FullscreenProgramme => ({
  kind: "fullscreen",
  start: (_args, { disk }) => running(disk, tickMs, 0, "-", 0),
});

// The seeded disk with a runnable `C:\ODDWARE\TEST.EXE`, and a registry for it.
export const withTestProgramme = (
  tickMs?: number,
): { readonly disk: Disk; readonly programmes: Registry } => {
  const disk = createDisk();
  const written = writeFile(
    disk.filesystem,
    "C:\\",
    TEST_PROGRAMME_PATH,
    "test",
    new Date(Date.UTC(1993, 8, 20, 17, 0)),
  );
  if (!written.ok) throw new Error(written.error);

  return {
    disk: { ...disk, filesystem: written.value },
    programmes: { ...PROGRAMMES, [TEST_PROGRAMME_PATH]: createTestProgramme(tickMs) },
  };
};
