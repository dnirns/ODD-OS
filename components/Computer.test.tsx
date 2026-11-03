import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import Computer from "./Computer";

const stripTags = (markup: string) => markup.replace(/<[^>]*>/g, "");

test("server-renders 25 blank rows with no cursor", () => {
  const markup = renderToStaticMarkup(<Computer />);

  expect(markup.match(/class="[^"]*row[^"]*"/g)).toHaveLength(25);
  expect(stripTags(markup)).toBe(" ".repeat(2000));
  expect(markup).not.toMatch(/class="[^"]*cursor[^"]*"/);
});
