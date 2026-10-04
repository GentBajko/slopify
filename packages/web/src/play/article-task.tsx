import { applyAliases } from "@app/kernel/ports/narration-aliases.js";
import { plainText } from "@app/slices/article/plain.js";
import { splitEndMatter } from "@app/slices/article/split.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useMemo } from "react";
import { useApp } from "@/app-context";
import { Fold } from "@/components/kit/fold";
import { narrationAliasesQuery } from "@/queries";
import { articleOff } from "./rail-frame";
import type { PlayFormState } from "./state";
import { InlineSwitch } from "./switches";

// Where the text comes from, said as the task: written for you, your text read as written, or
// your text rewritten by the article prompt. Adapting is the article written from notes you
// paste (research Provide), so the pasted text stays the source and the narration reads only
// what the prompt makes of it.
export type ArticleTask = "write" | "as-written" | "adapt" | "none";

export const articleTaskLabels: Readonly<Record<ArticleTask, string>> = {
  write: "Write it for me",
  "as-written": "Use my text as written",
  adapt: "Adapt my text",
  none: "No text",
};

export function articleTaskOf(form: Pick<PlayFormState, "sources">): ArticleTask {
  const { article, research } = form.sources;
  if (article === "off") return "none";
  if (article === "provide") return "as-written";
  return research === "provide" ? "adapt" : "write";
}

export function articleTaskPatch(form: PlayFormState, task: ArticleTask): Partial<PlayFormState> {
  const sources = form.sources;
  switch (task) {
    case "none":
      return articleOff(form);
    case "as-written":
      return { sources: { ...sources, article: "provide", research: "off" } };
    case "adapt":
      return {
        sources: { ...sources, article: "generate", research: "provide" },
        // What was pasted to be read as written is what gets adapted.
        ...(form.provided.research.trim() === "" && form.provided.article.trim() !== ""
          ? { provided: { ...form.provided, research: form.provided.article } }
          : {}),
      };
    case "write":
      return {
        sources: {
          ...sources,
          article: "generate",
          research: sources.research === "provide" ? "off" : sources.research,
        },
      };
  }
}

export function ArticleTaskSwitch({
  form,
  update,
}: {
  readonly form: PlayFormState;
  readonly update: (patch: Partial<PlayFormState>) => void;
}): ReactElement {
  return (
    <InlineSwitch<ArticleTask>
      field="sources.article"
      label="article source"
      hideLabel
      tip="play.source.article"
      className="max-[700px]:col-span-3 max-[700px]:justify-self-start [&_[data-slot=toggle-group]]:flex-wrap"
      value={articleTaskOf(form)}
      options={(["write", "as-written", "adapt", "none"] as const).map((value) => ({
        value,
        label: articleTaskLabels[value],
      }))}
      onPick={(task) => update(articleTaskPatch(form, task))}
    />
  );
}

// The words the narrator will say for text read as written: the article without its end matter
// (sources and the Pronunciation Glossary are never read), flattened, with Library → Aliases
// applied while Use narration aliases is on. Folded; it is there to check, not to edit.
export function spokenText(
  article: string,
  aliases: Parameters<typeof applyAliases>[1] | undefined,
): { readonly text: string; readonly glossary: boolean } {
  const parts = splitEndMatter(article);
  let text: string;
  try {
    text = plainText(parts.body);
  } catch {
    text = parts.body;
  }
  return {
    text: aliases === undefined ? text : applyAliases(text, aliases),
    glossary: parts.glossary.trim() !== "",
  };
}

export function SpokenText({ form }: { readonly form: PlayFormState }): ReactElement | null {
  const { api } = useApp();
  const narrated = form.sources.audio === "generate";
  const useAliases = narrated && form.audio.useNarrationAliases === true;
  const aliases = useQuery({ ...narrationAliasesQuery(api), enabled: useAliases });
  const article = form.provided.article;
  const spoken = useMemo(
    () => spokenText(article, useAliases ? aliases.data?.aliases : undefined),
    [article, useAliases, aliases.data],
  );
  if (!narrated || article.trim() === "") return null;
  const notes = [
    useAliases ? "Library → Narration aliases are applied." : undefined,
    spoken.glossary ? "The Pronunciation Glossary at the end is used, not read." : undefined,
    form.narrationPrompt
      ? "Narration Preparation adds delivery cues; the words stay as shown."
      : undefined,
  ].filter((note) => note !== undefined);
  return (
    <Fold className="mt-3" summary={<>Show the text that will be spoken</>}>
      <div className="pb-3">
        <p className="m-0 py-2 text-small text-ink-2">
          Read word for word; nothing is rewritten. {notes.join(" ")}
        </p>
        <section aria-label="Text that will be spoken">
          <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-body text-ink">
            {spoken.text}
          </pre>
        </section>
      </div>
    </Fold>
  );
}
