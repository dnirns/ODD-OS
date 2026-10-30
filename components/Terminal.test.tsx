import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import {
  createScreen,
  moveCursor,
  setCursorVisible,
  writeText,
} from "../os/terminal/screen";
import Terminal from "./Terminal";

const stripTags = (markup: string) => markup.replace(/<[^>]*>/g, "");

test("renders 25 rows holding all 2,000 cells as text", () => {
  const markup = renderToStaticMarkup(<Terminal screen={createScreen()} />);

  expect(markup.match(/class="[^"]*row[^"]*"/g)).toHaveLength(25);
  expect(stripTags(markup)).toHaveLength(2000);
});

test("renders colours from the DOS palette tokens", () => {
  const screen = writeText(createScreen(), 0, 0, "A", {
    fg: "yellow",
    bg: "blue",
  });
  const markup = renderToStaticMarkup(<Terminal screen={screen} />);

  expect(markup).toMatch(
    /color:var\(--dos-yellow\);background:var\(--dos-blue\)">A</,
  );
});

test("positions the cursor on the bottom scanlines of its cell", () => {
  const screen = moveCursor(createScreen(), 10, 20);
  const markup = renderToStaticMarkup(<Terminal screen={screen} />);

  expect(markup).toContain("top:10.8125em");
  expect(markup).toContain("left:11.25em");
});

test("draws the cursor in its cell's foreground colour", () => {
  const screen = writeText(createScreen(), 0, 0, "A", { fg: "red" });
  const markup = renderToStaticMarkup(<Terminal screen={screen} />);

  expect(markup).toMatch(/aria-hidden="true" style="[^"]*var\(--dos-red\)/);
});

test("renders no cursor when it is hidden", () => {
  const screen = setCursorVisible(createScreen(), false);
  const markup = renderToStaticMarkup(<Terminal screen={screen} />);

  expect(markup).not.toContain("aria-hidden");
});
