import { type RefObject, useEffect } from "react";

// A row that scrolls sideways (tabs, a project's sections on a phone) hides its scrollbar, so
// it says there is more by fading the edge the rest is behind: `data-more-before` and
// `data-more-after` on the row, drawn by shell.css. The current item is brought into view
// when it changes, so the section you are on is never the one cut off.
export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  current: string | undefined = undefined,
): void {
  useEffect(() => {
    const row = ref.current;
    if (row === null) return;
    const mark = () => {
      const before = row.scrollLeft > 1;
      const after = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      row.toggleAttribute("data-more-before", before);
      row.toggleAttribute("data-more-after", after);
    };
    mark();
    row.addEventListener("scroll", mark, { passive: true });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(mark) : undefined;
    resize?.observe(row);
    return () => {
      row.removeEventListener("scroll", mark);
      resize?.disconnect();
    };
  }, [ref]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `current` is the trigger: the row is measured again whenever the current item changes.
  useEffect(() => {
    const row = ref.current;
    if (row === null || row.scrollWidth <= row.clientWidth) return;
    const item = row.querySelector<HTMLElement>(
      '[aria-current]:not([aria-current="false"]), [aria-selected="true"]',
    );
    if (item === null) return;
    // Only sideways: scrolling the item into view would move the page as well.
    const start =
      item.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const end = start + item.getBoundingClientRect().width;
    if (start < row.scrollLeft) row.scrollLeft = Math.max(0, start - 24);
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth + 24;
  }, [ref, current]);
}
