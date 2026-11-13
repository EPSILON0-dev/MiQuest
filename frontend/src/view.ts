import type { Model } from "./model";
import type { Viewport } from "@xyflow/react";
export type SavedViewport = Viewport & { width?: number; height?: number };
export function restoreViewport(
  saved: SavedViewport,
  width: number,
  height: number,
): Viewport {
  return {
    x: saved.x + (saved.width ? (width - saved.width) / 2 : 0),
    y: saved.y + (saved.height ? (height - saved.height) / 2 : 0),
    zoom: saved.zoom,
  };
}
export function readView(model: Model): {
  pageId: string;
  viewports: Record<string, SavedViewport>;
} {
  try {
    const saved = JSON.parse(localStorage.getItem("miquest-view") ?? "{}");
    const viewports: Record<string, SavedViewport> = {};
    for (const [key, value] of Object.entries(saved.viewports ?? {})) {
      const v = value as SavedViewport;
      if (
        v &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.zoom) &&
        v.zoom >= 0.2 &&
        v.zoom <= 2
      )
        viewports[key] = {
          x: v.x,
          y: v.y,
          zoom: v.zoom,
          ...(Number.isFinite(v.width) && v.width! > 0
            ? { width: v.width }
            : {}),
          ...(Number.isFinite(v.height) && v.height! > 0
            ? { height: v.height }
            : {}),
        };
    }
    return {
      pageId: model.pages.some((p) => p.id === saved.pageId)
        ? saved.pageId
        : (model.pages[0]?.id ?? ""),
      viewports,
    };
  } catch {
    return { pageId: model.pages[0]?.id ?? "", viewports: {} };
  }
}
