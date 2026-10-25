import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { keys } from "@/queries";
import { instantiateProjectTemplate, type TemplateSummary, templatesQuery } from "@/templates/api";
import { usePlaySession } from "./draft-context";
import { rememberedDraft } from "./draft-restore";
import { freshDraftDocument } from "./draft-state";
import { outputKindOf, outputNoun } from "./output-kind";

// A person who picked "A blank video" keeps it for the rest of this tab's visit: Create does
// not pick the starter template for them again.
const blankKey = "slopify.create.blank";
export function choseBlank(): boolean {
  try {
    return window.sessionStorage.getItem(blankKey) === "1";
  } catch {
    return false;
  }
}
function rememberBlank(blank: boolean): void {
  try {
    if (blank) window.sessionStorage.setItem(blankKey, "1");
    else window.sessionStorage.removeItem(blankKey);
  } catch {
    // Storage blocked: the starter may be picked again on the next fresh draft.
  }
}

// The first starter template the welcome installed, while it is still saved: what a fresh
// Create starts from, so its voice, prompts and style are set before anything is typed.
// `settled` once both lists have answered (or failed), so nothing waits for it forever.
export function useStarterTemplate(): {
  readonly starter: TemplateSummary | undefined;
  readonly settled: boolean;
} {
  const { api } = useApp();
  const templates = useQuery(templatesQuery(api));
  const onboarding = useQuery({
    queryKey: onboardingKey,
    queryFn: () => readFirstRun(api),
    retry: false,
  });
  const installed = (onboarding.data?.packs ?? []).flatMap((pack) =>
    pack.templateId === null ? [] : [pack.templateId],
  );
  return {
    starter: installed
      .map((id) => templates.data?.find((template) => template.id === id))
      .find((template) => template !== undefined),
    settled: [templates, onboarding].every((query) => query.isSuccess || query.isError),
  };
}

// Whether the page shows this visit's fresh form, which the starter template is about to
// replace: nothing reopened or picked, and nothing but the topic typed in it (the services the
// first launch found may be filled in). Its first save waits meanwhile, so the draft made
// from the starter, with the topic carried into it, is the only one. `fresh` until the
// starter was tried on it; `coming` while a starter is (or may be) there to try.
export function useStarterPick(paused: boolean): {
  readonly fresh: boolean;
  readonly coming: boolean;
  readonly onTried: (generation: number) => void;
} {
  const session = usePlaySession();
  const { starter, settled } = useStarterTemplate();
  const [tried, setTried] = useState<number | null>(null);
  const fresh =
    !paused &&
    !choseBlank() &&
    tried !== session.generation() &&
    session.activeId === null &&
    session.view === null &&
    session.document.templateSource === undefined &&
    rememberedDraft() === null &&
    onlyTopicTyped(session.document);
  const coming = fresh && (!settled || starter !== undefined);
  const { holdFresh } = session;
  useEffect(() => {
    holdFresh?.(coming);
  }, [coming, holdFresh]);
  useEffect(() => () => holdFresh?.(false), [holdFresh]);
  return { fresh, coming, onTried: setTried };
}

// A document is the fresh form with at most the topic typed, a channel and services filled in.
export function onlyTopicTyped(document: PlayDraftDocument): boolean {
  const plain = (one: PlayDraftDocument): string =>
    stable({
      ...one,
      section: "content",
      channelId: undefined,
      form: {
        ...one.form,
        title: "",
        values: {},
        llm: undefined,
        images: undefined,
        audio: { ...one.form.audio, provider: "", model: "", voice: "" },
      },
    });
  return plain(document) === plain(freshDraftDocument);
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

// What was typed for the topic in the draft being left, into the draft made from a template:
// a typed title fills the template's topic when it asks for one, a keyword its namesake. Typed
// as it stands, half a word included, so the next key lands where the person expects.
export function carryTopic(typed: PlayDraftDocument, made: PlayDraftDocument): PlayDraftDocument {
  const { form } = typed;
  const asked = topicKeywords(form.title);
  const said: readonly (readonly [string, string])[] =
    asked.length === 0
      ? form.title.trim() !== "" && !form.title.includes("{{")
        ? [["", form.title]]
        : []
      : asked
          .map((name) => [name, form.values[name] ?? ""] as const)
          .filter(([, value]) => value.trim() !== "");
  const asks = topicKeywords(made.form.title);
  const carried = Object.fromEntries(
    said
      .map(([name, value]) => [name === "" ? (asks[0] ?? "") : name, value] as const)
      .filter(([name]) => name !== "" && (made.form.values[name] ?? "") === ""),
  );
  if (Object.keys(carried).length === 0) return made;
  return { ...made, form: { ...made.form, values: { ...made.form.values, ...carried } } };
}

// "Start from: History starter ▾" above the topic: picking a template opens a fresh draft made
// from it, and what was typed for the topic comes along. A fresh draft starts from the first
// starter template by itself; "A blank video" (or audiobook, …) starts from nothing and stays
// picked.
export function TemplateField({
  fresh,
  onTried,
  onError,
}: {
  // The page's fresh form, which the starter template replaces by itself (see useFreshForm).
  readonly fresh: boolean;
  // Said once the starter was tried on this generation's fresh form, applied or not.
  readonly onTried: (generation: number) => void;
  readonly onError: (message: string | null) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const session = usePlaySession();
  const templates = useQuery(templatesQuery(api));
  const { starter } = useStarterTemplate();
  const [busy, setBusy] = useState(false);
  const id = useId();
  const blocked =
    session.review.starting || session.review.uncertain || session.review.created !== null;
  const source = session.document.templateSource;
  const current = templates.data?.find((template) => template.id === source?.id);
  const pick = async (templateId: string, auto = false): Promise<void> => {
    onError(null);
    if (templateId === "") {
      rememberBlank(true);
      await session.newDraft();
      return;
    }
    const template = templates.data?.find((one) => one.id === templateId);
    if (!template) return;
    setBusy(true);
    try {
      if (!(await session.flush())) {
        if (!auto)
          onError(
            "Your draft wasn't saved, so the template wasn't applied. Press Retry beside the draft, then pick the template again.",
          );
        return;
      }
      const reply = await instantiateProjectTemplate(api, template, crypto.randomUUID());
      if (!reply.ok) {
        if (!auto) onError(`The template "${template.name}" wasn't applied. ${reply.message}`);
        return;
      }
      await client.invalidateQueries({ queryKey: keys.playDrafts });
      // The topic goes with the person into the new draft, up to the last key pressed before
      // it opens.
      if (!(await session.open(reply.value.draft.id, undefined, carryTopic))) {
        if (!auto)
          onError(
            `The draft made from "${template.name}" didn't open. Open it from the draft list.`,
          );
        return;
      }
      rememberBlank(false);
    } catch (error) {
      if (!auto)
        onError(
          error instanceof Error
            ? `The template "${template.name}" wasn't applied. ${error.message}`
            : `The template "${template.name}" wasn't applied. Pick it again.`,
        );
    } finally {
      setBusy(false);
    }
  };
  // The fresh form starts from the starter template, once per fresh form, even when the topic
  // is already being typed: it comes along.
  const tried = useRef<number | null>(null);
  const generation = session.generation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: decided once per fresh draft.
  useEffect(() => {
    if (starter === undefined || !fresh || busy || blocked) return;
    if (tried.current === generation) return;
    tried.current = generation;
    void pick(starter.id, true).finally(() => onTried(generation));
  }, [starter, fresh, generation]);
  const noun = outputNoun(outputKindOf(session.document.form));
  const help = templates.error
    ? `Templates didn't load. ${templates.error.message}`
    : templates.data?.length === 0
      ? `No templates yet. Set this ${noun} up, then Save as template.`
      : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={id} className="shrink-0 text-small text-ink-2">
          Start from
        </label>
        <select
          id={id}
          data-play-field="template"
          className="sl-select sl-select--compact min-w-0 max-w-[320px]"
          value={current?.id ?? ""}
          disabled={busy || blocked}
          onChange={(event) => void pick(event.target.value)}
        >
          <option value="">
            {source && !current ? "A template no longer saved" : `A blank ${noun}`}
          </option>
          {(templates.data ?? []).map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
      {help === undefined ? null : <HelpLine>{help}</HelpLine>}
    </div>
  );
}
