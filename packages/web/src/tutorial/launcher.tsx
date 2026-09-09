import { CircleHelpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "./context";

export function TutorialLauncher() {
  const tutorial = useTutorial();
  if (!tutorial) return null;
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-[6px] whitespace-nowrap text-ink2 hover:text-ink"
      onClick={tutorial.start}
      disabled={tutorial.active}
      aria-label="Start interactive tutorial"
      title="Start interactive tutorial"
    >
      <CircleHelpIcon className="size-4" aria-hidden="true" />
      <span className="sr-only min-[1280px]:not-sr-only">Tutorial</span>
    </button>
  );
}

export function TutorialInvite() {
  const tutorial = useTutorial();
  if (!tutorial || tutorial.active) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-panel border border-line bg-panel px-4 py-[14px]">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">Make your first video</h2>
        <p className="mt-1 text-small text-ink2">
          An interactive walkthrough of API keys, reusable prompts, keywords, and Play. Each step
          highlights the real controls you will use.
        </p>
      </div>
      <Button variant="accent" onClick={tutorial.start}>
        Start tutorial
      </Button>
    </div>
  );
}
