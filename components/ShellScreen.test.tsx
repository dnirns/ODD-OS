import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { createDisk } from "../os/fs/disk";
import { createScreen, moveCursor, writeText } from "../os/terminal/screen";
import ShellScreen from "./ShellScreen";

test("server-renders the screen it was given", () => {
  const screen = moveCursor(writeText(createScreen(), 6, 0, "C:\\>"), 6, 4);
  const markup = renderToStaticMarkup(<ShellScreen screen={screen} disk={createDisk()} />);

  expect(markup).toContain("C:\\&gt;");
  expect(markup).toMatch(/class="[^"]*cursor[^"]*"/);
});
