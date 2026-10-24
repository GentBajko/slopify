import type { ReactElement } from "react";
import { Rail, RailButton } from "@/components/kit/rail";
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

// The theme's sections down the left, as Settings lists its own: a press opens the section and
// brings it into view. A section with settings to fix says how many in red beside its name, and
// one with changes says how many changed.
export function GroupJumps({
  groups,
  current,
  onJump,
}: {
  readonly groups: readonly GroupState[];
  readonly current: string | undefined;
  readonly onJump: (title: string) => void;
}): ReactElement {
  return (
    <Rail label="Theme sections">
      {groups.map((group) => {
        const changed = group.changed === 0 ? undefined : `${String(group.changed)} changed`;
        return group.problems === 0 ? (
          <RailButton
            key={group.title}
            current={group.title === current}
            meta={changed}
            onClick={() => onJump(group.title)}
          >
            {group.title}
          </RailButton>
        ) : (
          <RailButton
            key={group.title}
            current={group.title === current}
            tone="failed"
            state={`${String(group.problems)} to fix`}
            meta={changed}
            onClick={() => onJump(group.title)}
          >
            {group.title}
          </RailButton>
        );
      })}
    </Rail>
  );
}
