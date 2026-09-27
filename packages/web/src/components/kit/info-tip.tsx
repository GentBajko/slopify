import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRightIcon, InfoIcon } from "lucide-react";
import type { ReactElement } from "react";
import { type HelpId, helpEntry, type TutorialRef } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { tutorialHref } from "@/tutorials/links";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover.js";

// Help hides until asked. A press (not a hover) opens it, so touch and keyboard reach the same
// text a pointer does, and nothing below the control moves when it opens. Esc closes it. The
// words come from the help catalogue (src/help/catalog.ts), never from the call site, so one
// thing is explained the same way on every screen. An entry with a tutorial section ends in
// Learn more, which opens Help → Tutorials there and closes the popover.
export function InfoTip({
  id,
  label,
  vars,
  className,
}: {
  readonly id: HelpId;
  // Names the subject when the catalogue title is too general for this spot: the button
  // reads "About {label}".
  readonly label?: string | undefined;
  // Fills `{name}` in the entry, for the few that name a provider or a count.
  readonly vars?: Readonly<Record<string, string>>;
  readonly className?: string;
}): ReactElement {
  const entry = helpEntry(id, vars);
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`About ${label ?? entry.title}`}
        data-help-id={id}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink",
          className,
        )}
      >
        <InfoIcon aria-hidden="true" className="size-[15px]" />
      </PopoverTrigger>
      <PopoverContent className="space-y-2 leading-[1.45]">
        <p className="m-0 font-semibold text-ink">{entry.title}</p>
        {entry.body.split("\n\n").map((paragraph) => (
          <p key={paragraph} className="m-0">
            {paragraph}
          </p>
        ))}
        {entry.tutorial === undefined ? null : <LearnMore tutorial={entry.tutorial} />}
      </PopoverContent>
    </Popover>
  );
}

// Learn more: the tutorial section, in the app. A router link that closes the popover; a plain
// link where no router is mounted (a component drawn on its own).
function LearnMore({ tutorial }: { readonly tutorial: TutorialRef }): ReactElement {
  const router = useRouter({ warn: false });
  const look = "sl-link inline-flex items-center gap-1 text-small";
  const words = (
    <>
      Learn more
      <ArrowRightIcon aria-hidden="true" className="size-[13px]" />
    </>
  );
  if (!router)
    return (
      <a href={tutorialHref(tutorial.page, tutorial.anchor)} className={look}>
        {words}
      </a>
    );
  return (
    <PopoverClose asChild>
      <Link
        to="/help/tutorials/$page"
        params={{ page: tutorial.page }}
        {...(tutorial.anchor === undefined ? {} : { hash: tutorial.anchor })}
        className={look}
      >
        {words}
      </Link>
    </PopoverClose>
  );
}

// Marks the element a control and its info button share. The coverage test (help/coverage.ts)
// looks for a tip inside the nearest such element around every labelled control, so a row that
// lays out its own control and InfoTip spreads this on the row.
export const helpScope = { "data-help-scope": "" } as const;
