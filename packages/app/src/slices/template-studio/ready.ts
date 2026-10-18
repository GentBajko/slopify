import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { templateById } from "../project-templates/repo.js";
import type { FreeCheckId } from "./checks.js";
import { gateOf } from "./gate.js";
import type { SectionState, StudioRefusal, TemplateSection } from "./model.js";
import { gatesOf, writeGate } from "./repo.js";
import { getStudio, getStudioChecks, type StudioDeps } from "./service.js";
import type { SectionStatus } from "./status.js";

// Mark ready: the newest version passes every free check and every section's sample is
// current (or off, or provided at run time), so its schedules start running it. Only the
// newest version is marked; one already ready is answered again without checking.

export const markReadySchema = z
  .object({ version: z.number().int().positive() })
  .strict()
  .readonly();

export interface ReadyProblem {
  readonly label: string;
  readonly sentence: string;
  readonly fix?: { readonly label: string; readonly href: string };
  // The section whose sample isn't current; absent for a failing check.
  readonly section?: TemplateSection;
}

export type ReadyResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly version: number;
        readonly gate: "ready";
        readonly replayed: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly reason: StudioRefusal;
      readonly message: string;
      readonly problems: readonly ReadyProblem[];
    };

const checkLabel: Readonly<Record<FreeCheckId, string>> = {
  keywords: "Keywords",
  providers: "Providers",
  "release-slots": "Release slots",
  "monthly-cost": "Monthly cost",
  answerers: "Checkpoints answered",
};

// The section states Mark ready accepts: nothing about them is left to look at.
const settled: ReadonlySet<SectionState> = new Set(["current", "off", "provided"]);

// A free check as the studio's view carries it.
interface CheckView {
  readonly id: FreeCheckId;
  readonly ok: boolean;
  readonly sentence: string;
  readonly fix?: { readonly label: string; readonly href: string } | undefined;
}

export function readyProblems(
  checks: readonly CheckView[],
  sections: readonly SectionStatus[],
): readonly ReadyProblem[] {
  return [
    ...checks
      .filter((check) => !check.ok)
      .map(
        (check): ReadyProblem => ({
          label: checkLabel[check.id],
          sentence: check.sentence,
          ...(check.fix === undefined ? {} : { fix: check.fix }),
        }),
      ),
    ...sections
      .filter((section) => !settled.has(section.state))
      .map(
        (section): ReadyProblem => ({
          label: section.label,
          sentence: section.sentence,
          section: section.id,
        }),
      ),
  ];
}

function sentenceOf(problem: ReadyProblem): string {
  const fix = problem.fix === undefined ? "" : ` ${problem.fix.label}.`;
  return `${problem.label}: ${problem.sentence}${fix}`;
}

const missingTemplate =
  "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.";

function notNewest(version: number, head: number): ReadyResult {
  return {
    ok: false,
    reason: "conflict",
    message: `Version ${String(version)} is no longer the newest: the template is at version ${String(head)}. Look over version ${String(head)}'s samples, then press Mark ready.`,
    problems: [],
  };
}

export async function markReady(
  deps: StudioDeps,
  templateId: string,
  raw: unknown,
): Promise<ReadyResult> {
  const parsed = markReadySchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-input",
      message: "The studio sent a request Slopify couldn't read. Reload the page and try again.",
      problems: [],
    };
  const { version } = parsed.data;
  const template = templateById(deps.db, templateId);
  if (template === undefined)
    return { ok: false, reason: "not-found", message: missingTemplate, problems: [] };
  if (version !== template.version) return notNewest(version, template.version);
  if (gateOf(gatesOf(deps.db, templateId), version) === "ready")
    return { ok: true, value: { version, gate: "ready", replayed: true } };
  const [studio, checks] = await Promise.all([
    getStudio(deps, templateId),
    getStudioChecks(deps, templateId),
  ]);
  if (!studio.ok || !checks.ok)
    return { ok: false, reason: "not-found", message: missingTemplate, problems: [] };
  // Read while the providers were looked up: a Save meanwhile made a newer version.
  if (studio.value.template.version !== version || checks.value.version !== version)
    return notNewest(version, Math.max(studio.value.template.version, checks.value.version));
  const problems = readyProblems(checks.value.checks, studio.value.sections);
  if (problems.length > 0)
    return {
      ok: false,
      reason: "not-ready",
      message: `Version ${String(version)} can't be marked ready yet. ${problems.map(sentenceOf).join(" ")}`,
      problems,
    };
  return transact(deps.db, (): ReadyResult => {
    const head = templateById(deps.db, templateId);
    if (head === undefined)
      return { ok: false, reason: "not-found", message: missingTemplate, problems: [] };
    if (head.version !== version) return notNewest(version, head.version);
    writeGate(deps.db, templateId, {
      version,
      state: "ready",
      carriedFrom: null,
      checksJson: JSON.stringify(checks.value.checks),
      markedAt: deps.clock.now().toISOString(),
    });
    return { ok: true, value: { version, gate: "ready", replayed: false } };
  });
}
