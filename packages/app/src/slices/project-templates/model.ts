import type { z } from "zod";
import type { DraftDeps } from "../play-drafts/model.js";
import type { projectTemplateSchema } from "./schema.js";

export type TemplateDeps = DraftDeps;
export type ProjectTemplate = z.infer<typeof projectTemplateSchema>;
export type TemplateSummary = Omit<ProjectTemplate, "document">;
export type TemplateResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | "not-found"
        | "conflict"
        | "invalid-input"
        | "missing-prompt"
        | "referenced-by-schedule";
    };
