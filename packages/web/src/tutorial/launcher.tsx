import { CircleHelpIcon } from "lucide-react";
import { Button, IconButton } from "@/components/kit/button";
import { useTutorial } from "./context";

export function TutorialLauncher() {
  const tutorial = useTutorial();
  if (!tutorial) return null;
  return (
    <IconButton
      label="Start interactive tutorial"
      className="shrink-0"
      onClick={tutorial.start}
      disabled={tutorial.active}
      disabledReason="The tutorial is already running"
    >
      <CircleHelpIcon aria-hidden="true" strokeWidth={1.75} />
    </IconButton>
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
      <Button variant="secondary" onClick={tutorial.start}>
        Start tutorial
      </Button>
    </div>
  );
}
