import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { readProjectTemplate } from "@/templates/api";
import { rowFields, type SetupRowId } from "./setup-rows";

// Where a setup row's values come from on a draft made from a template: still the template's,
// or changed for this project only. A row is compared on the fields it holds, in the saved
// draft's own shape; the title row compares the title pattern, never the topic typed for
// this one video.
export type RowOrigin = "template" | "changed";

type Form = PlayDraftDocument["form"];

function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key))
      return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

// Key order differs between a saved and a parsed copy, so values compare by sorted JSON.
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

// The services a template may leave empty, for Create to fill from what this computer has.
const services = new Set(["llm", "audio", "images"]);

// A service the template left empty, or picked but can't use here (no key saved), that the
// draft filled (from the first launch, or a key saved in Settings) is still the template's:
// the person changed nothing. Its other settings (a voice's glossary switches) still count.
function serviceOf(
  field: string,
  form: Form,
  template: Form,
  unusable: (service: string) => boolean,
): unknown {
  const value = at(form, [field]);
  const left = at(template, [field, "provider"]);
  const filled = left === undefined || left === "" || (typeof left === "string" && unusable(left));
  if (!services.has(field) || !filled) return value;
  if (typeof value !== "object" || value === null) return value;
  const {
    provider: _provider,
    model: _model,
    voice: _voice,
    ...rest
  } = value as Readonly<Record<string, unknown>>;
  return rest;
}

export function rowOrigin(
  row: SetupRowId,
  draft: { readonly form: Form; readonly channelId?: string | undefined },
  template: { readonly form: Form; readonly channelId?: string | undefined },
  // Whether a service can't be used on this computer, as Create's rows say it.
  unusable: (service: string) => boolean = () => false,
): RowOrigin {
  const fields = row === "title" ? ["title"] : rowFields(row);
  const same = fields.every((field) => {
    if (field === "channelId") return draft.channelId === template.channelId;
    if (services.has(field))
      return (
        stable(serviceOf(field, draft.form, template.form, unusable)) ===
        stable(serviceOf(field, template.form, template.form, unusable))
      );
    const path = field.split(".");
    return stable(at(draft.form, path)) === stable(at(template.form, path));
  });
  return same ? "template" : "changed";
}

// The template version the open draft was made from, read once and kept: a template saved
// again later is a new version, and this draft still came from the old one.
export function useTemplateOrigin(
  source: PlayDraftDocument["templateSource"],
): PlayDraftDocument | undefined {
  const { api } = useApp();
  const query = useQuery({
    queryKey: ["template-version", source?.id, source?.version],
    queryFn: async () => {
      if (source === undefined) return null;
      const reply = await readProjectTemplate(api, source.id, source.version);
      return reply.ok ? reply.value.document : null;
    },
    enabled: source !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return query.data ?? undefined;
}
