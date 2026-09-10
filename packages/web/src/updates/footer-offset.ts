import { useEffect, useState } from "react";

// The control stays floating, but lifts above the footer whenever it enters the viewport.
export function useFooterOffset(): number {
  const [bottom, setBottom] = useState(20);
  useEffect(() => {
    let frame = 0;
    const measure = (): void => {
      const rect = document.getElementById("app-footer")?.getBoundingClientRect();
      setBottom(
        rect !== undefined && rect.bottom > 0
          ? Math.max(20, window.innerHeight - rect.top + 12)
          : 20,
      );
    };
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return bottom;
}
