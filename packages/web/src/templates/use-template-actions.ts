import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import {
  instantiateProjectTemplate,
  readProjectTemplate,
  saveProjectTemplate,
  type TemplateSummary,
  templatesKey,
} from "./api";

// Use in Play and Duplicate for a Templates row. Each press of one template version reuses
// its id, so a retry after a lost reply never makes a second draft or copy; a press that
// outlives the screen (or a newer Play draft) stops before it opens anything.
export function useTemplateActions({
  onApplied,
  beforeApply,
  getGeneration,
  blocked,
}: {
  readonly onApplied: (draftId: string, isCurrent: () => boolean) => unknown | Promise<unknown>;
  readonly beforeApply?: (() => Promise<boolean>) | undefined;
  readonly getGeneration?: (() => number) | undefined;
  readonly blocked: boolean;
}): {
  readonly apply: (template: TemplateSummary) => Promise<void>;
  readonly duplicate: (template: TemplateSummary) => Promise<void>;
} {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const duplicates = useRef(new Map<string, string>());
  const applications = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function apply(template: TemplateSummary): Promise<void> {
    const startGeneration = getGeneration?.();
    if (blocked || (beforeApply && !(await beforeApply())))
      throw new Error(
        "Save or discard the draft open in Play first, then apply the template again.",
      );
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    const key = `${template.id}:${template.version}`;
    let id = applications.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      applications.current.set(key, id);
    }
    const reply = await instantiateProjectTemplate(api, template, id);
    if (!reply.ok) {
      applications.current.delete(key);
      throw new Error(reply.message);
    }
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    await client.invalidateQueries({ queryKey: ["play-drafts"] });
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    const opened = await onApplied(reply.value.draft.id, () => mounted.current);
    if (opened !== false) applications.current.delete(key);
    else
      throw new Error(
        "The template's draft was created but didn't open. Press Use in Play again to open it.",
      );
  }
  // The copy is "<name> copy" in the same channel; pressed twice for one version it is made once.
  async function duplicate(template: TemplateSummary): Promise<void> {
    const key = `${template.id}:${template.version}`;
    let id = duplicates.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      duplicates.current.set(key, id);
    }
    const read = await readProjectTemplate(api, template.id);
    if (!read.ok) throw new Error(read.message);
    const reply = await saveProjectTemplate(api, {
      id,
      name: `${template.name} copy`,
      document: read.value.document,
    });
    if (!reply.ok) throw new Error(reply.message);
    duplicates.current.delete(key);
    notify(`Duplicated as ${reply.value.name}.`, "success");
    await client.invalidateQueries({ queryKey: templatesKey });
  }
  return { apply, duplicate };
}
