import type { LlmDocument } from "../../kernel/ports/llm-documents.js";
import type { Finding } from "./synthesis.js";

export function researchDocuments(findings: readonly Finding[]): LlmDocument[] {
  return findings.map((finding, index) => ({
    id: `research-${index + 1}`,
    title: finding.title,
    content: finding.notes,
  }));
}
