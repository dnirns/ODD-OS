import type { Color } from "../os/terminal/colors";
import { type Screen, toRuns } from "../os/terminal/screen";
import styles from "./Terminal.module.css";

const CELL_WIDTH_EM = 9 / 16;
const CURSOR_TOP_EM = 13 / 16;

const toCssColor = (color: Color) => `var(--dos-${color})`;

type TerminalProps = {
  screen: Screen;
};

const Terminal = ({ screen }: TerminalProps) => {
  const { row, column, visible } = screen.cursor;

  return (
    <div className={styles.terminal}>
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
    </div>
  );
};

export default Terminal;
