import { detectSlots } from "@app/slices/admission/substitute.js";
import { slopifySceneKeywords } from "@app/slices/images/scenes.js";
import type { ReactElement } from "react";
import { Switch } from "@/components/kit/switch";

// A picked picture prompt and its text, named as the screen names it.
export interface PictureBody {
  readonly label: string;
  readonly body: string | null | undefined;
}

export interface SceneKeywordUse {
  readonly label: string;
  readonly keyword: string;
}

// The pictures whose prompt uses {{Slopify_Scene}}, {{Slopify_Setting}} or {{Slopify_Mood}}, each
// with the first of them it uses: those get their scene whatever Scenes from the article says.
export function sceneKeywordUses(pictures: readonly PictureBody[]): readonly SceneKeywordUse[] {
  return pictures.flatMap(({ label, body }) => {
    const names = body == null ? [] : detectSlots(body).names;
    const keyword = names.find((name) =>
      (slopifySceneKeywords as readonly string[]).includes(name),
    );
    return keyword === undefined ? [] : [{ label, keyword }];
  });
}

// Under Scenes from the article when it is off: one switch per picture that gets its scene
// anyway, on and unchangeable here, naming the keyword that does it. The stored switch is left
// as it is.
export function SceneKeywordRows({
  uses,
}: {
  readonly uses: readonly SceneKeywordUse[];
}): ReactElement | null {
  if (uses.length === 0) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      {uses.map((use) => (
        <Switch
          key={use.label}
          checked
          disabled
          label={`On for ${use.label}: it uses {{${use.keyword}}}`}
          tip="play.image-scenes.keyword"
          tipLabel="Scenes on for one picture"
          onChange={() => {}}
        />
      ))}
    </div>
  );
}
