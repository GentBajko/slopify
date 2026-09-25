import { readFileSync } from "node:fs";
import type { StageContext } from "../../kernel/runner/index.js";
import { piecesOf } from "../../kernel/runner/piece-repo.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { projectById, stagesOf } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { storeText } from "../storage/staging.js";
import type { SentMessages } from "./continuation.js";
import type { ArticleDeps } from "./run.js";
import { categories, instructionsText, keepSegment, writeSegment } from "./segments.js";

// A provided Article never runs its writer. Prepare its selected entries as part
// of Audio's cancellable work, retaining Article ownership of the resulting text.
export async function prepareProvidedArticleSegments(
  deps: ArticleDeps,
  audioContext: StageContext,
  providers: StageProviders,
): Promise<StageRunResult> {
  const { projectId } = audioContext.stage;
  const project = projectById(deps.db, projectId);
  if (!project)
    throw new Error(
      "This project no longer exists; it may have been deleted while it was running.",
    );
  const { config } = project;
  if (config.sources.article !== "provide" || config.sources.audio !== "generate") return "done";
  if (!config.intro && !config.outro) return "done";
  audioContext.signal.throwIfAborted();
  const article = stagesOf(deps.db, projectId).find((stage) => stage.kind === "article");
  if (!article)
    throw new Error(
      "Slopify hit an internal error (the project has no article stage). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  const outputs = outputsOf(deps.db, projectId);
  const plain = outputs.find((output) => output.role === "article_txt");
  if (!plain)
    throw new Error(
      "The article text you provided is missing, so the intro and outro can't be written from it. Paste the article again in Edit project → Article, then Retry stage.",
    );
  const narration = readFileSync(outputPath(deps.paths, projectId, plain.path), "utf8");
  const saved = outputs.find(
    (output) => output.stageKind === "article" && output.role === "instructions",
  );
  let instructions = saved
    ? readFileSync(outputPath(deps.paths, projectId, saved.path), "utf8")
    : "";
  const completed = piecesOf(deps.db, article.id, "segment");
  for (const [index, category] of categories.entries()) {
    audioContext.signal.throwIfAborted();
    if (completed.some((piece) => piece.idx === index + 1 && piece.state === "done")) continue;
    const sent: SentMessages[] = [];
    const result = await writeSegment(providers, config.llm, config, category, narration, sent);
    audioContext.signal.throwIfAborted();
    if (!result.ok) return "held";
    const segment = result.value;
    if (!segment) continue;
    if (sent.length > 0) {
      instructions += `${instructions === "" ? "" : "\n"}${instructionsText(sent)}`;
      storeText(deps, {
        projectId,
        stageKind: "article",
        role: "instructions",
        text: instructions,
      });
    }
    keepSegment(deps, { stage: article }, segment, index + 1);
    deps.count("stage.completed", {
      stage: "article",
      segment: category,
      ...(segment.mode === "llm" && config.llm
        ? { provider: config.llm.provider, model: config.llm.model }
        : {}),
      ...segment.tokens,
    });
  }
  return "done";
}
