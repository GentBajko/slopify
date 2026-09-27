import type { DatabaseSync } from "node:sqlite";
import type { Stage } from "../admission/model.js";
import { readStageHistory } from "./history.js";
import { type ModelChoices, stageEta } from "./model.js";

// The project's stage rows with each running step's time left. The history is read only when
// something is running, so a finished project's page costs no extra query.
export function stagesWithEta(
  db: DatabaseSync,
  stages: readonly Stage[],
  config: ModelChoices,
  now: Date,
): Stage[] {
  if (!stages.some((stage) => stage.state === "running")) return [...stages];
  const history = readStageHistory(db);
  return stages.map((stage) => {
    if (stage.state !== "running") return stage;
    const typical = history.typicalSeconds(stage.kind, config, stage.progressTotal);
    const eta = stageEta(
      { ...stage, ...(typical === undefined ? {} : { typicalSeconds: typical }) },
      now.valueOf(),
    );
    return {
      ...stage,
      ...(typical === undefined ? {} : { typicalSeconds: Math.round(typical) }),
      ...(eta === undefined
        ? {}
        : {
            etaBasis: eta.basis,
            ...(eta.seconds === undefined ? {} : { etaSeconds: eta.seconds }),
          }),
    };
  });
}
