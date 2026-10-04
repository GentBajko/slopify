import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Field, Select } from "@/components/kit/field";
import { instantiateProjectTemplate, templatesQuery } from "@/templates/api";
import { usePlaySession } from "./draft-context";
import { outputKindOf, outputNoun } from "./output-kind";

// Template first: picking one opens a fresh draft made from it, and what was typed for the
// topic comes along.
export function TemplateField({
  topics,
  onError,
}: {
  readonly topics: readonly string[];
  readonly onError: (message: string | null) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const session = usePlaySession();
  const templates = useQuery(templatesQuery(api));
  const channels = useQuery(channelsQuery(api));
  const [busy, setBusy] = useState(false);
  const blocked =
    session.review.starting || session.review.uncertain || session.review.created !== null;
  const source = session.document.templateSource;
  const current = templates.data?.find((template) => template.id === source?.id);
  const channelName = (id: string): string | undefined =>
    channels.data?.find((channel) => channel.id === id)?.name;
  const pick = async (id: string): Promise<void> => {
    onError(null);
    if (id === "") {
      await session.newDraft();
      return;
    }
    const template = templates.data?.find((one) => one.id === id);
    if (!template) return;
    setBusy(true);
    try {
      if (!(await session.flush())) {
        onError(
          "Your draft wasn't saved, so the template wasn't applied. Press Retry beside Drafts, then pick the template again.",
        );
        return;
      }
      // The topic typed so far goes with the person into the new draft.
      const typed = Object.fromEntries(
        topics
          .map((name) => [name, session.document.form.values[name] ?? ""] as const)
          .filter(([, value]) => value.trim() !== ""),
      );
      const reply = await instantiateProjectTemplate(api, template, crypto.randomUUID());
      if (!reply.ok) {
        onError(`The template "${template.name}" wasn't applied. ${reply.message}`);
        return;
      }
      await client.invalidateQueries({ queryKey: ["play-drafts"] });
      if (!(await session.open(reply.value.draft.id))) {
        onError(`The draft made from "${template.name}" didn't open. Open it from Drafts.`);
        return;
      }
      const made = reply.value.draft.document;
      const carried = Object.fromEntries(
        Object.entries(typed).filter(([name]) => (made.form.values[name] ?? "") === ""),
      );
      if (Object.keys(carried).length > 0)
        session.edit({
          ...made,
          form: { ...made.form, values: { ...made.form.values, ...carried } },
        });
    } catch (error) {
      onError(
        error instanceof Error
          ? `The template "${template.name}" wasn't applied. ${error.message}`
          : `The template "${template.name}" wasn't applied. Pick it again.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const help = templates.error
    ? `Templates didn't load. ${templates.error.message}`
    : current
      ? [
          channelName(channelOfTemplate(current)),
          `version ${String(current.version)}`,
          "changes here stay in this project",
        ]
          .filter(Boolean)
          .join(" · ")
      : templates.data?.length === 0
        ? `No templates yet. Set this ${outputNoun(outputKindOf(session.document.form))} up, then Save as template.`
        : undefined;
  return (
    <Field label="Template" tip="play.template" help={help}>
      <Select
        data-play-field="template"
        value={current?.id ?? ""}
        disabled={busy || blocked}
        onChange={(event) => void pick(event.target.value)}
      >
        <option value="">{source && !current ? "Template no longer saved" : "No template"}</option>
        {(templates.data ?? []).map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
