import { MACHINE } from "../machine";
import { drawDefrag } from "./defragScreen";
import { advanceDefrag, type DefragState, type Method, startDefrag, TICK_MS, wantsTicks } from "./defragRun";
import { INVALID_DRIVE, INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { FullscreenProgramme, ProgrammeArgs, Running } from "./types";

const SUMMARY = "Reorganizes the files on a disk to optimize disk performance.";

// The MS-DOS 6.22 descriptions of the switches DEFRAG accepts here.
const HELP = [
  SUMMARY,
  "",
  "DEFRAG [drive:] [/F] [/U] [/H] [/SKIPHIGH] [/G0]",
  "",
  "  drive:     Specifies the drive that contains the disk you want to optimize.",
  "  /F         Defragments files and ensures that the disk contains no empty",
  "             spaces between files.",
  "  /U         Defragments files and leaves empty spaces, if any, between files.",
  "  /H         Moves hidden files.",
  "  /SKIPHIGH  Loads DEFRAG into conventional memory. By default, DEFRAG is",
  "             loaded into upper memory, if upper memory is available.",
  "  /G0        Disables the graphic mouse and graphic character set.",
];

// Accepted with no visible effect: there is no upper memory to skip and no mouse.
const QUIET_SWITCHES = new Set(["/SKIPHIGH", "/G0"]);

type Options = { readonly method: Method | undefined; readonly moveHidden: boolean; readonly chooseDrive: boolean };

const parse = ({ params, switches }: ProgrammeArgs): Options | string => {
  const known = new Set(["/F", "/U", "/H", ...QUIET_SWITCHES]);
  if (switches.some((option) => !known.has(option))) return INVALID_SWITCH;
  if (switches.includes("/F") && switches.includes("/U")) return INVALID_SWITCH;

  if (params.length > 1) return TOO_MANY_PARAMETERS;
  if (params.length === 1 && params[0].toUpperCase() !== "C:") return INVALID_DRIVE;

  return {
    method: switches.includes("/F") ? "full" : switches.includes("/U") ? "unfragment" : undefined,
    moveHidden: switches.includes("/H"),
    chooseDrive: params.length === 0,
  };
};

// An event that changes nothing returns this same value, so nothing is redrawn.
const running = (state: DefragState): Running => {
  const current: Running = {
    type: "running",
    screen: drawDefrag(state),
    tickMs: wantsTicks(state) ? TICK_MS : undefined,
    step: (event) => {
      const next = advanceDefrag(state, event);
      if (next.phase.kind === "exit") {
        return next.disk === next.launchDisk ? { type: "exit" } : { type: "exit", disk: next.disk };
      }
      return next === state ? current : running(next);
    },
  };

  return current;
};

export const DEFRAG = {
  kind: "fullscreen",
  summary: SUMMARY,
  help: HELP,
  start: (args, { disk, files, now }) => {
    const options = parse(args);
    if (typeof options === "string") return print(options);

    return running(
      startDefrag({
        disk,
        files,
        capacityMb: MACHINE.fixedDiskMb,
        moveHidden: options.moveHidden,
        method: options.method,
        chooseDrive: options.chooseDrive,
        seed: now >>> 0,
      }),
    );
  },
} satisfies FullscreenProgramme;
