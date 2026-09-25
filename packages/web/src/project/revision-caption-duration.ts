import type { RevisionView } from "@app/slices/revisions/model.js";

export function captionNarrationDuration(view: RevisionView): number | undefined {
  const { config, fingerprints } = view.revision;
  if (config.sources.audio === "off") return undefined;
  const segments =
    config.sources.audio === "provide"
      ? [{ key: "audio:provided", role: "audio_body" }]
      : [
          ...(config.intro === undefined ? [] : [{ key: "audio:intro", role: "audio_intro" }]),
          { key: "audio:body:concat", role: "audio_body" },
          ...(config.outro === undefined ? [] : [{ key: "audio:outro", role: "audio_outro" }]),
        ];
  const selected = view.outputs.filter(
    (row) =>
      row.selected &&
      row.state === "ready" &&
      row.available &&
      row.fingerprint === fingerprints[row.workKey],
  );
  const narration = segments.map(({ key, role }) =>
    selected.find((row) => row.workKey === key && row.output.role === role),
  );
  if (narration.some((row) => row === undefined)) return undefined;
  const durations = narration.map((row) => row?.output.durationMs);
  if (durations.every(knownDuration))
    return (
      durations.reduce((sum, milliseconds) => sum + milliseconds, 0) / 1000 +
      Math.max(0, segments.length - 1) * config.silenceGapSeconds +
      // The quiet lead-in and tail around the narration (`slices/video/plan.ts`).
      2 * config.edgeSilenceSeconds
    );
  // Older narration descriptors may predate duration inspection. Only a current
  // final export can supply that missing measurement, never incomplete narration.
  const exported = selected.find(
    (row) =>
      (row.output.role === "audio_export" || row.output.role === "video") &&
      knownDuration(row.output.durationMs),
  );
  const milliseconds = exported?.output.durationMs;
  return knownDuration(milliseconds) ? milliseconds / 1000 : undefined;
}
function knownDuration(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}
