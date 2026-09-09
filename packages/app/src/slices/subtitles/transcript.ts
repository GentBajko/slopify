import { readFileSync } from "node:fs";
import { z } from "zod";
import { piecesOf } from "../../kernel/runner/piece-repo.js";
import { stagesOf } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import type { AudioKind } from "../video/plan.js";
import type { VideoDeps } from "../video/run.js";

const textPayload = z.object({ text: z.string(), category: z.string().optional() });

export function spokenText(
  deps: VideoDeps,
  projectId: string,
  kind: Exclude<AudioKind, "gap">,
  outputs: readonly Output[],
): string {
  const stages = stagesOf(deps.db, projectId);
  if (kind === "body") {
    const audio = stages.find((stage) => stage.kind === "audio");
    if (audio?.source === "generate") {
      const chunks = piecesOf(deps.db, audio.id, "chunk");
      if (chunks.length > 0) return chunks.map((piece) => payload(piece.payload).text).join("\n");
    }
    const article = outputs.find((output) => output.role === "article_txt");
    if (article !== undefined)
      return readFileSync(outputPath(deps.paths, projectId, article.path), "utf8");
  } else {
    const article = stages.find((stage) => stage.kind === "article");
    if (article !== undefined) {
      const segment = piecesOf(deps.db, article.id, "segment")
        .map((piece) => payload(piece.payload))
        .find((piece) => piece.category === kind);
      if (segment !== undefined) return segment.text;
    }
  }
  throw new Error(
    `The saved ${kind} narration text is missing. Subtitles need the text spoken in the audio.`,
  );
}
function payload(raw: string | null): z.infer<typeof textPayload> {
  return textPayload.parse(JSON.parse(raw ?? "null"));
}
