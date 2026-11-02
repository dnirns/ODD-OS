import { MACHINE } from "../machine";
import { INVALID_SWITCH, print, TOO_MANY_PARAMETERS } from "./output";
import type { CommandProgramme } from "./types";

const CONVENTIONAL_KB = 640;
const RESERVED_KB = 384;
const CONVENTIONAL_USED_KB = 57;
const EXTENDED_USED_KB = 64;
const LARGEST_PROGRAM_BYTES = 596_864;

const number = (value: number) => value.toLocaleString("en-US");

const memoryRow = (label: string, ...kilobytes: readonly number[]) =>
  label.padEnd(18) +
  kilobytes.map((kb) => `${number(kb)}K`.padStart(7)).join("   ");

const memoryReport = (): readonly string[] => {
  const extended = MACHINE.memoryKb - CONVENTIONAL_KB - RESERVED_KB;
  const rule = "----------------  -------   -------   -------";
  const conventionalFree = CONVENTIONAL_KB - CONVENTIONAL_USED_KB;
  const used = CONVENTIONAL_USED_KB + RESERVED_KB + EXTENDED_USED_KB;

  return [
    "",
    "Memory Type        Total  =   Used  +   Free",
    rule,
    memoryRow("Conventional", CONVENTIONAL_KB, CONVENTIONAL_USED_KB, conventionalFree),
    memoryRow("Upper", 0, 0, 0),
    memoryRow("Reserved", RESERVED_KB, RESERVED_KB, 0),
    memoryRow("Extended (XMS)", extended, EXTENDED_USED_KB, extended - EXTENDED_USED_KB),
    rule,
    memoryRow("Total memory", MACHINE.memoryKb, used, MACHINE.memoryKb - used),
    "",
    memoryRow("Total under 1 MB", CONVENTIONAL_KB, CONVENTIONAL_USED_KB, conventionalFree),
    "",
    `Largest executable program size ${`${conventionalFree}K`.padStart(8)} (${number(LARGEST_PROGRAM_BYTES)} bytes)`,
    `Largest free upper memory block ${"0K".padStart(8)} ${"(0 bytes)".padStart(15)}`,
    "ODD/OS is resident in the high memory area.",
  ];
};

const SUMMARY = "Displays the amount of used and free memory in your system.";

export const MEM: CommandProgramme = {
  kind: "command",
  summary: SUMMARY,
  help: [SUMMARY, "", "MEM"],
  run: ({ switches, params }) => {
    if (switches.length > 0) return print(INVALID_SWITCH);
    if (params.length > 0) return print(TOO_MANY_PARAMETERS);
    return print(...memoryReport());
  },
};
