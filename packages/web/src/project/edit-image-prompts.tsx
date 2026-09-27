import type { ImagePromptChoice } from "@app/slices/admission/model.js";
import { replanImagePrompts, sameImagePrompts } from "@app/slices/revisions/image-plan.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import type { Prompt } from "@/api";
import { ImagePrompts } from "@/play/image-prompts";

// Which image prompts the project's images come from and how many each makes (its Number),
// with Play's own control. The images themselves are planned again when the change is saved
// (`slices/revisions/image-plan.ts`): a prompt left as it was keeps its images; a raised
// Number adds images, a lowered one drops its last ones, and an unticked prompt's images go.
export function EditImagePrompts({
  edit,
  saved,
  prompts,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  // The prompts the project was saved with: the numbering its images are in until saving.
  readonly saved: readonly ImagePromptChoice[];
  readonly prompts: readonly Prompt[];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement | null {
  const { config } = edit;
  // Only generated images come from prompts; uploaded ones are replaced one at a time.
  if (config.sources.images !== "generate") return null;
  const images = prompts.filter((prompt) => prompt.kind === "image");
  return (
    <section aria-label="Image prompts" className="space-y-3">
      <ImagePrompts
        prompts={images}
        picked={config.imagePrompts}
        problem={problem}
        onPick={(next) => onChange({ ...edit, config: { ...config, imagePrompts: next } })}
      />
      <Outcome edit={edit} saved={saved} prompts={images} problem={problem} />
    </section>
  );
}

// What saving will do to the images, worked out as the server will.
function Outcome({
  edit,
  saved,
  prompts,
  problem,
}: {
  readonly edit: RevisionEdit;
  readonly saved: readonly ImagePromptChoice[];
  readonly prompts: readonly Prompt[];
  readonly problem: (field: string) => string | undefined;
}): ReactElement | null {
  const to = edit.config.imagePrompts;
  const refused = problem("imagePrompts");
  if (sameImagePrompts(saved, to))
    return refused === undefined ? null : <Problem>{refused}</Problem>;
  let next = 0;
  const plan = replanImagePrompts({
    from: saved,
    to,
    content: edit.content,
    rendered: edit.config.rendered,
    values: edit.config.values,
    body: (name) => prompts.find((prompt) => prompt.name === name)?.body,
    key: () => `planned-${String(++next)}`,
  });
  if (!plan.ok) return <Problem>{plan.fields.map((field) => field.message).join(" ")}</Problem>;
  const count = (n: number) => `${String(n)} ${n === 1 ? "image" : "images"}`;
  const parts = [
    ...(plan.added.length > 0 ? [`adds ${count(plan.added.length)} to make`] : []),
    ...(plan.removed.length > 0 ? [`removes ${count(plan.removed.length)}`] : []),
  ];
  return (
    <>
      {refused === undefined ? null : <Problem>{refused}</Problem>}
      <p role="status" className="m-0 text-small text-ink-2">
        {parts.length === 0
          ? "Saving keeps every image as it is."
          : `Saving ${parts.join(" and ")}. The other images are kept; the new ones are made when you remake outdated outputs.`}
      </p>
    </>
  );
}

function Problem({ children }: { readonly children: string }): ReactElement {
  return (
    <p role="alert" className="m-0 text-small text-danger">
      {children}
    </p>
  );
}
