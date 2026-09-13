import type { ReactElement } from "react";
import { type PlaySection, playSections } from "./sections";
export function SectionNavigation({
  section,
  onNavigate,
}: {
  readonly section: PlaySection;
  readonly onNavigate: (section: PlaySection) => void;
}): ReactElement {
  return (
    <nav
      aria-label="Run setup"
      className="mb-7 grid grid-cols-2 border-b border-line min-[700px]:grid-cols-4"
    >
      {playSections.map((item, index) => (
        <div
          key={item.id}
          className={`border-b-2 py-4 ${section === item.id ? "border-accent" : "border-transparent"}`}
        >
          <button
            type="button"
            aria-current={section === item.id ? "step" : undefined}
            onClick={() => onNavigate(item.id)}
            className={`min-h-11 w-full text-left font-semibold ${section === item.id ? "text-accent" : "text-ink"}`}
          >
            <span
              aria-hidden="true"
              className={`mr-3 inline-flex size-7 items-center justify-center rounded-full border text-small ${section === item.id ? "border-accent bg-accent text-accent-ink" : "border-line"}`}
            >
              {index + 1}
            </span>
            {item.label}
          </button>
          <p className="pl-10 text-small text-ink3">{item.description}</p>
        </div>
      ))}
    </nav>
  );
}
