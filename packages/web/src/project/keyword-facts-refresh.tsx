import { usesFacts } from "@app/slices/keywords/rules.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { type ReactElement, useState } from "react";
import { readKeywordFacts } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

// Whether the project's prompts use a fact Slopify copied when the run started (the channel,
// its links, the neighbouring videos…), or the project already holds such facts.
export function wantsKeywordFacts(edit: RevisionEdit): boolean {
  const bodies = Object.values(edit.content.promptTemplates).flatMap((raw) =>
    raw == null ? [] : [raw],
  );
  return edit.config.keywordFacts !== undefined || usesFacts(bodies);
}

// Edit project → Prompts: copy the keyword facts again from the channel as it is now. They land
// in the edit like any other change, so nothing is remade until Save, and the save remakes only
// what uses a changed fact. The read is applied to the edit as it is when it answers.
export function KeywordFactsRefresh({
  projectId,
  edit,
  getEdit,
  onChange,
}: {
  readonly projectId: string;
  readonly edit: RevisionEdit;
  readonly getEdit: () => RevisionEdit;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement | null {
  const { api } = useApp();
  const [state, setState] = useState<
    { readonly kind: "idle" | "busy" | "done" } | { readonly kind: "failed"; readonly why: string }
  >({ kind: "idle" });
  if (!wantsKeywordFacts(edit)) return null;
  const refresh = async (): Promise<void> => {
    setState({ kind: "busy" });
    try {
      const { keywordFacts } = await readKeywordFacts(api, projectId);
      const latest = getEdit();
      onChange({ ...latest, config: { ...latest.config, keywordFacts } });
      setState({ kind: "done" });
    } catch (error) {
      setState({ kind: "failed", why: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1" {...helpScope}>
        <Button
          variant="quiet"
          size="small"
          disabled={state.kind === "busy"}
          onClick={() => {
            void refresh();
          }}
        >
          {state.kind === "busy" ? "Refreshing keyword facts…" : "Refresh keyword facts"}
        </Button>
        <InfoTip id="project.prompts.keyword-facts" />
      </span>
      {state.kind === "done" ? (
        <p role="status" className="m-0 text-small text-ink-2">
          Keyword facts copied again. Save to remake only the steps whose prompts use a fact that
          changed.
        </p>
      ) : state.kind === "failed" ? (
        <p role="alert" className="m-0 text-small text-danger">
          {`Couldn't refresh the keyword facts: ${state.why} Press Refresh keyword facts to try again.`}
        </p>
      ) : null}
    </div>
  );
}
