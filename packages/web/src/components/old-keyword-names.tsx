import type { KeywordPlace } from "@app/slices/keywords/model.js";
import { upgradeLegacy } from "@app/slices/keywords/rules.js";
import { type ReactElement, useId } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { oldNamesIn } from "@/lib/draft-lint";

// Update to new names: a picture prompt still using {{Scene}} or {{Appearance}}. Both keep
// working. Appearance means the same under its new name, so its button just renames it; Scene's
// new name gives the picture its scene even with the Images switch off, so its button says so.
export function OldKeywordNames({
  body,
  place,
  onChange,
}: {
  readonly body: string;
  readonly place: KeywordPlace;
  readonly onChange: (next: string) => void;
}): ReactElement | null {
  const sceneId = useId();
  const old = oldNamesIn(body, place);
  if (old.length === 0) return null;
  const appearance = old.includes("Appearance");
  const scene = old.includes("Scene");
  return (
    <Callout
      tone="info"
      title="Update to new names"
      actions={
        <>
          {appearance ? (
            <Button size="small" onClick={() => onChange(upgradeLegacy(body, "Appearance"))}>
              {"Update {{Appearance}}"}
            </Button>
          ) : null}
          {scene ? (
            <Button
              size="small"
              aria-describedby={sceneId}
              onClick={() => onChange(upgradeLegacy(body, "Scene"))}
            >
              {"Update {{Scene}}"}
            </Button>
          ) : null}
        </>
      }
    >
      {appearance ? (
        <p className="m-0">{"{{Appearance}} means exactly the same as {{Slopify_Appearance}}."}</p>
      ) : null}
      {scene ? (
        <p id={sceneId} className="m-0">
          {
            "With {{Slopify_Scene}} this picture gets its scene even with Images → Scenes from the article off, which adds one AI call per run."
          }
        </p>
      ) : null}
    </Callout>
  );
}
