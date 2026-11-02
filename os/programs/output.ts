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

export const print = (...lines: readonly string[]): PrintResult => ({
  type: "print",
  lines,
});
