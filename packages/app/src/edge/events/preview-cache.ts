import type { LlmPreviewEvent, ProjectEvent } from "../../kernel/events.js";

// Preview memory is bounded independently from durable outputs. A subscriber joining
// mid-call receives only visible response text, never prompts or provider reasoning.
export function createPreviewCache(): {
  readonly observe: (event: ProjectEvent) => void;
  readonly snapshot: (projectId: string) => readonly LlmPreviewEvent[];
} {
  const projects = new Map<string, Map<string, LlmPreviewEvent>>();
  return {
    observe: (event) => {
      if (event.type === "stage.state") {
        const calls = projects.get(event.projectId);
        if (calls) {
          for (const [id, call] of calls)
            if (
              call.stage === event.stage &&
              call.revisionId === event.revisionId &&
              call.workId === event.workId
            )
              calls.delete(id);
          if (calls.size === 0) projects.delete(event.projectId);
        }
        return;
      }
      if (event.type !== "llm.preview") return;
      const calls = projects.get(event.projectId) ?? new Map<string, LlmPreviewEvent>();
      const identity = JSON.stringify([event.revisionId, event.workId, event.callId]);
      const prior = calls.get(identity);
      const text = (event.reset ? event.text : `${prior?.text ?? ""}${event.text}`).slice(
        -64 * 1024,
      );
      calls.delete(identity);
      calls.set(identity, { ...event, text, reset: true });
      while (calls.size > 8) {
        const id = calls.keys().next().value;
        if (id !== undefined) calls.delete(id);
      }
      projects.delete(event.projectId);
      projects.set(event.projectId, calls);
      while (projects.size > 16) {
        const id = projects.keys().next().value;
        if (id !== undefined) projects.delete(id);
      }
    },
    snapshot: (projectId) => [...(projects.get(projectId)?.values() ?? [])],
  };
}
