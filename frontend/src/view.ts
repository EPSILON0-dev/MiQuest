import type { Model } from "./model";
import type { Viewport } from "@xyflow/react";
export function readView(model: Model): {
  pageId: string;
  viewports: Record<string, Viewport>;
} {
  try {
    const saved = JSON.parse(localStorage.getItem("miquest-view") ?? "{}");
    const viewports: Record<string, Viewport> = {};
    for (const [key, value] of Object.entries(saved.viewports ?? {})) {
      const v = value as Viewport;
      if (
        v &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.zoom) &&
        v.zoom >= 0.2 &&
        v.zoom <= 2
      )
        viewports[key] = v;
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
