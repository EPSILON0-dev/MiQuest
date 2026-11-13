// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { createFixture } from "./model";
import { readView, restoreViewport } from "./view";
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

test("keeps the same graph point centered when restoring a differently sized canvas", () => {
  const saved = { x: 320, y: 180, zoom: 1.3, width: 1220, height: 856 };
  const restored = restoreViewport(saved, 390, 800);
  expect(restored).toEqual({ x: -95, y: 152, zoom: 1.3 });
  expect((390 / 2 - restored.x) / restored.zoom).toBe(
    (1220 / 2 - saved.x) / saved.zoom,
  );
  expect(restoreViewport({ x: 10, y: 20, zoom: 1 }, 390, 800)).toEqual({
    x: 10,
    y: 20,
    zoom: 1,
  });
});
