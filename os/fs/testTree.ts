import { directory, opaqueFile, textFile } from "./entries";
import type { Filesystem } from "./types";

const WHEN = new Date(Date.UTC(1993, 8, 14, 9, 31));

export const createTestFilesystem = (): Filesystem => ({
  root: directory("", WHEN, [
    opaqueFile("COMMAND.COM", WHEN, 100),
    directory("DOS", WHEN, [opaqueFile("HIMEM.SYS", WHEN, 200)]),
    textFile("CONFIG.SYS", WHEN, "FILES=30\r\n"),
    textFile("AUTOEXEC.BAT", WHEN, "PROMPT $P$G\r\n"),
    directory("ODDWARE", WHEN),
    textFile("README.TXT", WHEN, "hello"),
  ]),
});
