import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { type PlaySection, playSections } from "./sections";

// Three editing tabs and, set apart at the right, Review: it opens over the editor in a drawer
// rather than replacing it, so it reads as the next step rather than a fourth page.
export function SectionNavigation({
  section,
  underneath,
  onNavigate,
}: {
  readonly section: PlaySection;
  // The editor showing under the Review drawer, so its tab stays marked while Review is open.
  readonly underneath: Exclude<PlaySection, "review">;
  readonly onNavigate: (section: PlaySection) => void;
}): ReactElement {
  const editors = playSections.filter((item) => item.id !== "review");
  return (
    <nav
      aria-label="Run setup"
      className="mb-5 flex min-w-0 items-end gap-3 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      {editors.map((item, index) => {
        const current = section === item.id;
        const marked = current || (section === "review" && underneath === item.id);
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? "step" : undefined}
            title={item.description}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "-mb-px inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 font-semibold whitespace-nowrap focus-visible:outline-offset-[-3px]",
              marked ? "border-lamp-run text-ink" : "border-transparent text-ink2 hover:text-ink",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full border text-label",
                marked ? "border-accent bg-accent text-accent-ink" : "border-line2 text-ink3",
              )}
            >
              {index + 1}
            </span>
            {item.label}
          </button>
        );
      })}
      <span className="flex-1" />
      <button
        type="button"
        aria-current={section === "review" ? "step" : undefined}
        aria-expanded={section === "review"}
        onClick={() => onNavigate("review")}
        className={cn(
          "mb-1 inline-flex min-h-8 shrink-0 items-center rounded-control border px-3 font-semibold whitespace-nowrap",
          section === "review"
            ? "border-accent bg-panel2 text-run-text"
            : "border-line2 text-ink2 hover:border-ink3 hover:text-ink",
        )}
      >
        Review
      </button>
    </nav>
  );
}
