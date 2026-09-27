import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { KeywordList } from "@/components/keyword-list";
import { keywordOrigins } from "@/play/admission";
import { readProjectTemplate, type TemplateSummary, templatesKey } from "./api";

// A saved template's keywords with what each feeds, read-only: the same list Play and Edit
// project draw. The topic keywords are saved empty; the settings-like ones keep their values.
export function TemplateKeywords({
  template,
}: {
  readonly template: Pick<TemplateSummary, "id" | "version" | "name">;
}): ReactElement {
  const { api } = useApp();
  const read = useQuery({
    queryKey: [...templatesKey, template.id, template.version],
    queryFn: async () => {
      const reply = await readProjectTemplate(api, template.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  });
  if (read.error)
    return (
      <p role="alert" className="m-0 text-small text-danger">
        The keywords of {template.name} didn't load. {read.error.message} Press Keywords again.
      </p>
    );
  if (!read.data)
    return (
      <p role="status" className="m-0 text-small text-ink-2">
        Reading the keywords…
      </p>
    );
  const { form, librarySnapshot } = read.data.document;
  const origins = keywordOrigins({
    form,
    prompts: librarySnapshot?.prompts ?? [],
    entries: librarySnapshot?.entries ?? [],
  });
  const topics = topicKeywords(form.title);
  const names = [...new Set([...origins.keys(), ...Object.keys(form.values)])];
  return (
    <KeywordList
      keywords={names.map((name) => ({
        name,
        value: form.values[name] ?? "",
        feeds: origins.get(name) ?? [],
        topic: topics.includes(name),
      }))}
      empty="No keywords: the prompts and the title name none."
    />
  );
}
