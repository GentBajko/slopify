import type { VoicesSettings } from "@app/slices/voices/model.js";
import { parseScript } from "@app/slices/voices/script.js";
import { type ReactElement, useMemo } from "react";

// The script as the speakers read it: each turn under its speaker's name, marked in the
// speaker's colour, with the sections that become chapters as headings. A script that does
// not parse says why, in the same words the narration would refuse it with.
export function ScriptView({
  script,
  voices,
}: {
  readonly script: string;
  readonly voices: VoicesSettings;
}): ReactElement {
  const parsed = useMemo(() => parseScript(script, voices.speakers), [script, voices.speakers]);
  if (!parsed.ok)
    return (
      <p className="text-small text-red">
        This script can't be narrated yet: {parsed.reason} Fix it in Edit project → Article.
      </p>
    );
  const place = new Map(voices.speakers.map((speaker, index) => [speaker.id, index]));
  const names = new Map(voices.speakers.map((speaker) => [speaker.id, speaker.name.trim()]));
  return (
    <ol aria-label="Script" className="space-y-3">
      {parsed.script.turns.map((turn) => {
        const section = parsed.script.sections.find((one) => one.firstTurn === turn.index);
        const colour = `var(--color-speaker-${String(((place.get(turn.speaker) ?? 0) % 6) + 1)})`;
        return (
          <li key={turn.index} className="space-y-2">
            {section === undefined ? null : (
              <h3 className="pt-2 text-row font-semibold text-ink">{section.title}</h3>
            )}
            <div className="border-l-4 pl-3" style={{ borderColor: colour }}>
              <p className="text-label font-semibold text-ink2">
                {names.get(turn.speaker) ?? turn.speaker}
              </p>
              <p className="text-body text-ink">{turn.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
