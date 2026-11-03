import type { Color } from "../os/terminal/colors";
import { CELL_HEIGHT, CELL_WIDTH, type Screen, toRuns } from "../os/terminal/screen";
import styles from "./Terminal.module.css";

const CELL_WIDTH_EM = CELL_WIDTH / CELL_HEIGHT;
// The VGA cursor covers scanlines 13 and 14 of the cell's 16.
const CURSOR_TOP_EM = 13 / CELL_HEIGHT;

const toCssColor = (color: Color) => `var(--dos-${color})`;

type TerminalProps = {
  screen: Screen;
};

// The text layer holds the 9×16 cells; CSS stretches it to the 4:3 picture
// and lays the glass of the CRT over it.
const Terminal = ({ screen }: TerminalProps) => {
  const { row, column, visible } = screen.cursor;

  return (
    <div className={styles.screen}>
      <div className={styles.picture}>
        <div className={styles.text}>
          {screen.rows.map((cells, rowIndex) => (
            <div key={rowIndex} className={styles.row}>
              {toRuns(cells).map(({ text, fg, bg }, runIndex) => (
                <span
                  key={runIndex}
                  style={{ color: toCssColor(fg), background: toCssColor(bg) }}
                >
                  {text}
                </span>
              ))}
            </div>
          ))}
          {visible && (
            <div
              className={styles.cursor}
              aria-hidden="true"
              style={{
                top: `${row + CURSOR_TOP_EM}em`,
                left: `${column * CELL_WIDTH_EM}em`,
                background: toCssColor(screen.rows[row][column].fg),
              }}
            />
          )}
          <div className={styles.scanlines} aria-hidden="true" />
        </div>
      </div>
      <div className={styles.glass} aria-hidden="true" />
    </div>
  );
};

export default Terminal;
