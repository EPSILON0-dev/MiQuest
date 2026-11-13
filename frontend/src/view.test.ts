// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { createFixture } from "./model";
import { readView } from "./view";
afterEach(() => localStorage.clear());
test("restores valid tree and viewport while ignoring stale targets and invalid zoom", () => {
  const model = createFixture();
  localStorage.setItem(
    "miquest-view",
    JSON.stringify({
      pageId: "launch",
      viewports: {
        launch: { x: 40, y: -25, zoom: 0.8 },
        bad: { x: 0, y: 0, zoom: -2 },
      },
    }),
  );
  expect(readView(model)).toEqual({
    pageId: "launch",
    viewports: { launch: { x: 40, y: -25, zoom: 0.8 } },
  });
  localStorage.setItem("miquest-view", JSON.stringify({ pageId: "deleted" }));
  expect(readView(model).pageId).toBe(model.pages[0].id);
});
test("malformed storage and empty workspace use safe fallbacks", () => {
  localStorage.setItem("miquest-view", "{broken");
  expect(readView(createFixture()).pageId).toBe("foundations");
  expect(readView({ ...createFixture(), pages: [] }).pageId).toBe("");
});
