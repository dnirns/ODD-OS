import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import Home from "./page";

test("renders the terminal in a single main viewport", () => {
  const markup = renderToStaticMarkup(<Home />);

  expect(markup.match(/<main\b/g)).toHaveLength(1);
  expect(markup).not.toMatch(/<(a|nav|button|img)\b/);
  expect(markup).toContain("ODD/OS Version 3.14");
});
