import { COLUMNS } from "../terminal/screen";

const TAB_WIDTH = 8;

// Expands tabs to 8-column stops and breaks the text into screen rows. A tab
// stop is counted from the start of the row it falls on.
export const layoutRows = (text: string): readonly string[] => {
  const rows: string[] = [];
  let row = "";

  for (const char of text) {
    const cells =
      char === "\t" ? " ".repeat(TAB_WIDTH - (row.length % TAB_WIDTH)) : char;

    row += cells;
    if (row.length >= COLUMNS) {
      rows.push(row);
      row = "";
    }
  }

  return row === "" && rows.length > 0 ? rows : [...rows, row];
};
