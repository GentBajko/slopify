import type { DatabaseSync } from "node:sqlite";
import type { SpeechInstall } from "../../kernel/ports/system-speech.js";
import { templateById } from "../project-templates/repo.js";
import type { ProviderStatus } from "../settings/model.js";
import { listVoices } from "../settings/repo.js";
import { notTemplateSample } from "../template-studio/repo.js";
import type { FirstRunView } from "./model.js";
import { starterPacks, starterSet } from "./packs.js";
import { shortReadiness } from "./quick-short.js";
import { sampleProjectIds } from "./sample.js";
import { firstRunDismissed, readPackRecords } from "./state.js";

// The first-run screen shows on a fresh install and never again once it is skipped or a real
// project (anything but the samples and the template studio's hidden projects) exists. Reading it writes nothing: a real project that
// exists before the screen was recorded as done is reported as `settle`, and the client
// records it with POST /dismiss, so deleting every project later does not bring it back.
export function firstRunView(
  db: DatabaseSync,
  statuses: readonly ProviderStatus[],
  // How to install the computer's voice here, for the checklist's voice line.
  install?: SpeechInstall,
): FirstRunView {
  const samples = sampleProjectIds(db);
  const real =
    db
      .prepare(
        `SELECT 1 FROM projects WHERE id IS NOT ? AND id IS NOT ? AND id IS NOT ? AND ${notTemplateSample()} LIMIT 1`,
      )
      .get(samples.library, samples.audiobook, samples.podcast) !== undefined;
  const dismissed = firstRunDismissed(db);
  const packs = readPackRecords(db);
  return {
    show: !real && !dismissed,
    settle: real && !dismissed,
    // Every starter pack suggests the same voice, so the starter set's stands for all of them.
    needs: shortReadiness({
      statuses,
      voices: listVoices(db),
      suggested: starterSet.voice,
      install,
    }),
    sampleProjectId: samples.library,
    samples,
    // A pack counts as added only with its template: the first short adds a pack's prompts and
    // voice but no template, and Add pack must still be able to add that template later (or
    // again, after it was deleted).
    packs: starterPacks.map((pack) => {
      const template = packs[pack.id]?.template;
      const kept = template !== undefined && templateById(db, template) !== undefined;
      return {
        id: pack.id,
        name: pack.name,
        summary: pack.summary,
        installed: kept,
        templateId: kept ? template : null,
      };
    }),
  };
}
