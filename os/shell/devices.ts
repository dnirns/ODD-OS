// The MS-DOS character devices, recognised by COPY and redirection before any
// file is looked up. The filesystem itself rejects these names.
const DEVICES = new Set([
  "CON",
  "NUL",
  "PRN",
  "AUX",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "LPT1",
  "LPT2",
  "LPT3",
]);

// `CON` is the screen and keyboard. Every other device acts as `NUL` until
// the printer and serial ports exist.
export type Device = "CON" | "NUL";

// A device name in any case, in any directory, with any extension or a
// trailing colon: `con`, `NUL.TXT`, `\dos\nul`, `prn:`.
export const deviceNamed = (name: string): Device | undefined => {
  const last = name.replace(/:$/, "").split(/[\\/:]/).at(-1) ?? "";
  const base = last.split(".")[0].toUpperCase();

  if (!DEVICES.has(base)) return undefined;
  return base === "CON" ? "CON" : "NUL";
};
