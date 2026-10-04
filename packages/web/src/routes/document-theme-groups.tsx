import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Badge } from "@/components/kit/status";

export interface GroupState {
  readonly title: string;
  readonly problems: number;
  readonly changed: number;
}

export function groupId(title: string): string {
  return `theme-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

// What a folded group holds that needs a look: its problems, then its changes since the theme
// the editor started from. Shown on the group's summary, so a closed group still says it.
export function GroupMarks({
  problems,
  changed,
}: {
  readonly problems: number;
  readonly changed: number;
}): ReactElement | null {
  if (problems === 0 && changed === 0) return null;
  return (
    <span className="ml-auto flex items-center gap-2 text-small font-normal">
      {problems === 0 ? null : <Badge tone="failed">{`${String(problems)} to fix`}</Badge>}
      {changed === 0 ? null : <Badge>{`${String(changed)} changed`}</Badge>}
    </span>
  );
}

// The theme's groups in one row above them: a press opens the group and brings it into view,
// and each names how many settings in it changed or need fixing.
export function GroupJumps({
  groups,
  onJump,
}: {
  readonly groups: readonly GroupState[];
  readonly onJump: (title: string) => void;
}): ReactElement {
  return (
    <nav aria-label="Theme groups" className="flex flex-wrap gap-1 border-t border-line pt-3">
      {groups.map((group) => {
        const marks = [
          group.problems === 0 ? "" : `${String(group.problems)} to fix`,
          group.changed === 0 ? "" : `${String(group.changed)} changed`,
        ].filter((one) => one !== "");
        return (
          <Button
            key={group.title}
            variant="quiet"
            size="small"
            className={group.problems === 0 ? undefined : "text-danger"}
            onClick={() => onJump(group.title)}
          >
            {marks.length === 0 ? group.title : `${group.title} · ${marks.join(" · ")}`}
          </Button>
        );
      })}
    </nav>
  );
}
