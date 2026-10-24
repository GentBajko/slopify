import { Button } from "@/components/kit/button";
import { useTutorial } from "./context";

// The tour's invitation on an empty Projects list. Everywhere else the tour starts from the
// rail's Help menu ("Start the tour") or Ctrl+K.
export function TutorialInvite() {
  const tutorial = useTutorial();
  if (!tutorial || tutorial.active) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-media border border-line bg-surface px-4 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">Make your first video</h2>
        <p className="mt-1 text-small text-ink-2">
          A guided tour of keys, your own prompts, keywords and Create. Each step points at the real
          control you will use.
        </p>
      </div>
      <Button variant="secondary" onClick={tutorial.start}>
        Start the tour
      </Button>
    </div>
  );
}
