import type { Disk } from "../fs/disk";

export const INVALID_SWITCH = "Invalid switch";
export const TOO_MANY_PARAMETERS = "Too many parameters";
export const INVALID_DRIVE = "Invalid drive specification";
export const BAD_COMMAND = "Bad command or file name";

export type PrintResult = {
  readonly type: "print";
  readonly lines: readonly string[];
};

export type PageResult = {
  readonly type: "page";
  readonly lines: readonly string[];
};

// A command programme that changed the disk: the shell takes the new disk
// and shows the lines.
export type FilesResult = {
  readonly type: "files";
  readonly disk: Disk;
  readonly lines: readonly string[];
};

export const print = (...lines: readonly string[]): PrintResult => ({
  type: "print",
  lines,
});
