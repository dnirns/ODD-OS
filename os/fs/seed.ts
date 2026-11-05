import { directory, opaqueFile, textFile } from "./entries";
import type { Filesystem } from "./types";

const CRLF = "\r\n";

const lines = (...text: readonly string[]) =>
  text.map((line) => line + CRLF).join("");

const at = (
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
) => new Date(Date.UTC(year, month - 1, day, hours, minutes));

const DOS_RELEASED = at(1993, 3, 10, 6, 0);
const DOS_INSTALLED = at(1993, 9, 14, 9, 12);
const SYSTEM_CONFIGURED = at(1993, 9, 14, 9, 31);
const ODDWARE_ADDED = at(1993, 9, 20, 16, 48);
const WORM_COPIED = at(1993, 9, 20, 16, 49);
const README_WRITTEN = at(1993, 9, 20, 16, 52);
const CREDITS_WRITTEN = at(1993, 9, 20, 16, 55);

const COMMAND_COM_SIZE = 53_214;
const HIMEM_SYS_SIZE = 29_104;
const MEM_EXE_SIZE = 32_502;
const DOSKEY_COM_SIZE = 5_861;
const HELP_COM_SIZE = 5_527;
const WORM_EXE_SIZE = 23_744;

export const AUTOEXEC_BAT = lines("PATH C:\\DOS", "DOSKEY /INSERT", "PROMPT $P$G");

export const CONFIG_SYS = lines(
  "DEVICE=C:\\DOS\\HIMEM.SYS",
  "DOS=HIGH",
  "FILES=30",
);

export const README_TXT = lines(
  "ODD/OS Version 3.14",
  "Copyright (C) 1993 Ordinary Data Devices, Inc.",
  "",
  "This file describes your ODD/OS installation.",
  "",
  "GETTING STARTED",
  "",
  "To list the commands you can use, type HELP at the command prompt.",
  "To display the version of ODD/OS, type VER.",
  "",
  "PRODUCT SUPPORT",
  "",
  "Please contact your dealer for assistance with this product.",
);

export const CREDITS_TXT = lines(
  "Credits",
  "",
  "ODD/OS",
  "",
  "DEVELOPED BY",
  "Daniel Lowena-Irons",
  "",
  "SOURCE CODE",
  "https://github.com/dnirns/ODD-OS",
);

export const createFilesystem = (): Filesystem => ({
  root: directory("", DOS_INSTALLED, [
    opaqueFile("COMMAND.COM", DOS_RELEASED, COMMAND_COM_SIZE),
    directory("DOS", DOS_INSTALLED, [
      opaqueFile("HIMEM.SYS", DOS_RELEASED, HIMEM_SYS_SIZE),
      opaqueFile("MEM.EXE", DOS_RELEASED, MEM_EXE_SIZE),
      opaqueFile("DOSKEY.COM", DOS_RELEASED, DOSKEY_COM_SIZE),
      opaqueFile("HELP.COM", DOS_RELEASED, HELP_COM_SIZE),
    ]),
    textFile("CONFIG.SYS", SYSTEM_CONFIGURED, CONFIG_SYS),
    textFile("AUTOEXEC.BAT", SYSTEM_CONFIGURED, AUTOEXEC_BAT),
    directory("ODDWARE", ODDWARE_ADDED, [
      opaqueFile("WORM.EXE", WORM_COPIED, WORM_EXE_SIZE),
    ]),
    textFile("README.TXT", README_WRITTEN, README_TXT),
    textFile("CREDITS.TXT", CREDITS_WRITTEN, CREDITS_TXT),
  ]),
});
