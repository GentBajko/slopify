import { templateNameMax } from "@app/slices/project-templates/schema.js";
import { useApp } from "@/app-context";
import type { Selection } from "@/components/selection";
import { useLibraryBulk } from "@/library/use-library-bulk";
import {
  deleteProjectTemplate,
  readProjectTemplate,
  saveProjectTemplate,
  type TemplateSummary,
  templatesKey,
} from "./api";

// Duplicate selected and Delete selected on Library → Templates: a copy is "<name> copy" in
// the same channel; a delete goes to the trash, and the toast's Undo brings it back.
export function useTemplatesBulk(
  all: readonly TemplateSummary[],
  selection: Selection<string>,
): ReturnType<typeof useLibraryBulk<TemplateSummary>> {
  const { api } = useApp();
  return useLibraryBulk<TemplateSummary>({
    noun: ["template", "templates"],
    listKey: templatesKey,
    all,
    nameMax: templateNameMax,
    duplicate: async (template, name) => {
      const read = await readProjectTemplate(api, template.id);
      if (!read.ok) return read.message;
      const reply = await saveProjectTemplate(api, {
        id: crypto.randomUUID(),
        name,
        document: read.value.document,
      });
      return reply.ok ? null : reply.message;
    },
    remove: async (template) => {
      const reply = await deleteProjectTemplate(api, template);
      if (!reply.ok) throw new Error(reply.message);
    },
    trash: "template",
    selection,
  });
}
