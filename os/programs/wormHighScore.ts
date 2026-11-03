// The text of C:\ODDWARE\WORM.HI. Pure, with no imports: no files, clock or screen.

export const HI_PATH = "C:\\ODDWARE\\WORM.HI";

const RECORD = /^[ \t\r\n]*(\d+)[ \t\r\n]*$/;

export const formatRecord = (score: number): string => `${score}\r\n`;

// The record a file's text holds, or undefined when the text is not one.
export const parseRecord = (text: string): number | undefined => {
  const digits = RECORD.exec(text)?.[1];
  return digits === undefined ? undefined : Number(digits);
};
