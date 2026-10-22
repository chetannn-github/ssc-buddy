import { useEffect, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { taskWidgetHeight } from "./task-widget-height";

/** Measure intrinsic row heights so shrinking the window does not create a resize loop. */
export function useTaskWidgetHeight(contentRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const content = contentRef.current;
    const card = content?.parentElement;
    if (!content || !card || !isTauri() || window.__SSC_HABIT_WIDGET__?.style !== "tasks") return;
    let active = true, applying = false, frame = 0, lastHeight = 0;
    let pendingHeight: number | null = null;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = async () => {
      if (applying) return;
      applying = true;
      try {
        while (active && pendingHeight !== null) {
          const height = pendingHeight;
          pendingHeight = null;
          await invoke("fit_tasks_widget", { height, animate: !motion.matches });
        }
      } catch (error) { console.warn("Could not resize Tasks widget", error); }
      finally { applying = false; if (active && pendingHeight !== null) void apply(); }
    };
    const spacing = (element: Element, names: string[]) => {
      const style = getComputedStyle(element);
      return names.reduce((sum, name) => sum + (parseFloat(style.getPropertyValue(name)) || 0), 0);
    };
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && !["absolute", "fixed"].includes(style.position);
    };
    const outerHeight = (element: Element) => element.getBoundingClientRect().height + spacing(element, ["margin-top", "margin-bottom"]);
    const measure = () => {
      frame = 0;
      const list = content.querySelector(".android-task-list");
      if (!list) return;
      const rows = Array.from(list.children).filter(visible);
      const listHeight = rows.reduce((sum, row) => sum + outerHeight(row), 0)
        + Math.max(0, rows.length - 1) * spacing(list, ["row-gap"])
        + spacing(list, ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"]);
      const fixedChildren = Array.from(content.children).filter(element => element !== list && visible(element));
      const siblings = Array.from(card.children).filter(element => element !== content && visible(element));
      const chromeHeight = [...fixedChildren, ...siblings].reduce((sum, element) => sum + outerHeight(element), 0)
        + spacing(card, ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"])
        + spacing(content, ["padding-top", "padding-bottom", "margin-top", "margin-bottom"])
        + spacing(list, ["margin-top", "margin-bottom"]);
      const height = taskWidgetHeight(chromeHeight, listHeight);
      if (Math.abs(height - lastHeight) <= 1) return;
      lastHeight = height;
      pendingHeight = height;
      void apply();
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const observe = () => {
      resize.disconnect();
      resize.observe(card);
      for (const element of content.querySelectorAll(":scope > *, .android-task-list > *")) resize.observe(element);
      schedule();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(content, { childList: true, subtree: true, characterData: true });
    observe();
    return () => { active = false; pendingHeight = null; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); };
  }, [contentRef]);
}
