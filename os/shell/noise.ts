// What TYPE shows for an opaque file. Real DOS would print every byte of the
// file; ODD/OS has no bytes, so it prints a short, fixed burst of printable
// characters and then stops, as at a Ctrl+Z. This is fictional.

const COLUMNS = 80;
const MAX_ROWS = 4;
const BREAK_ODDS = 24;

// Printable ASCII, then CP437 0x80 to 0xFE as Unicode. The art glyphs of
// 0x01 to 0x1F are left out because the bundled font has no glyphs for their
// Unicode forms.
export const NOISE_GLYPHS = Array.from(
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
    "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■",
);

const hash = (text: string) =>
  Array.from(text).reduce(
    (value, char) => Math.imul(value ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0,
    0x811c9dc5,
  );

// A small seeded generator (mulberry32), so the same file always gives the
// same burst.
const generator = (seed: number) => {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const opaqueNoise = (path: string, size: number): readonly string[] => {
  const next = generator(hash(`${path.toUpperCase()}\0${size}`));
  const rows: string[] = [];
  let remaining = Math.min(size, MAX_ROWS * COLUMNS);

  while (remaining > 0 && rows.length < MAX_ROWS) {
    let row = "";

    while (row.length < COLUMNS && remaining > 0) {
      row += NOISE_GLYPHS[Math.floor(next() * NOISE_GLYPHS.length)];
      remaining -= 1;
      if (next() < 1 / BREAK_ODDS) break;
    }

    rows.push(row);
  }

  return rows;
};
