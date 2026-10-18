import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import type { ProviderStatus } from "../settings/model.js";
import { writeSetting } from "../settings/repo.js";
import { getStudio, type StudioDeps } from "./service.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function studio(statuses: readonly ProviderStatus[] = []) {
  const h = draftFixture();
  open.push(h.close);
  const deps: StudioDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    providerStatuses: async () => statuses,
  };
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document: h.document });
  if (!created.ok) throw new Error(created.reason);
  return { h, deps, id };
}

describe("getStudio", () => {
  it("refuses a template that doesn't exist, saying where to look", async () => {
    const { deps } = studio();
    expect(await getStudio(deps, randomUUID())).toEqual({
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    });
  });

  it("shows a new template as unchecked, on the default sample topic, with its sections and checks", async () => {
    const { deps, id } = studio();
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.gate).toBe("unchecked");
    expect(result.value.runnableVersion).toBeNull();
    expect(result.value.sample).toEqual({
      topic: "The history of the lighthouse",
      topicSource: "fixed",
      fullScript: false,
    });
    expect(result.value.sections.map((section) => [section.id, section.state])).toEqual([
      ["subject", "off"],
      ["script", "stale"],
      ["voice", "stale"],
      ["pictures", "stale"],
      ["video", "stale"],
      ["thumbnail", "off"],
      ["shorts", "off"],
      ["document", "off"],
      ["reviews", "off"],
      ["upload", "stale"],
      ["schedule", "stale"],
    ]);
    expect(result.value.checks.find((check) => check.id === "providers")?.ok).toBe(false);
  });

  it("reads the legacy gate a template saved before the studio has, and keeps it runnable after an unchecked edit", async () => {
    const { h, deps, id } = studio();
    h.deps.db
      .prepare("INSERT INTO template_gates (template_id,version,state) VALUES (?,1,'legacy')")
      .run(id);
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document: h.document,
    });
    expect(saved.ok).toBe(true);
    const result = await getStudio(deps, id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.template.version).toBe(2);
    expect(result.value.gate).toBe("unchecked");
    expect(result.value.runnableVersion).toBe(1);
  });

  it("uses the sample topic set in Settings, and a template's own once it has one", async () => {
    const { h, deps, id } = studio();
    writeSetting(h.deps.db, "templateStudio.sampleTopic.default", JSON.stringify("Tea clippers"));
    const first = await getStudio(deps, id);
    expect(first.ok && first.value.sample.topic).toBe("Tea clippers");
    h.deps.db
      .prepare(
        "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,'p9','Salt roads','queued',1,'a')",
      )
      .run(id);
    const second = await getStudio(deps, id);
    expect(second.ok && second.value.sample).toEqual({
      topic: "Salt roads",
      topicSource: "queued",
      fullScript: true,
    });
  });

  it("falls back to the lighthouse when the Settings topic is blank or unreadable", async () => {
    const { h, deps, id } = studio();
    writeSetting(h.deps.db, "templateStudio.sampleTopic.default", "{not json");
    const result = await getStudio(deps, id);
    expect(result.ok && result.value.sample.topic).toBe("The history of the lighthouse");
  });

  it("passes the providers check once the template's providers are set up", async () => {
    const statuses: readonly ProviderStatus[] = (
      [
        ["openrouter", "llm"],
        ["openai-tts", "tts"],
        ["openai-image", "image"],
      ] as const
    ).map(([id, family]) => ({
      id,
      family,
      displayName: id,
      readiness: { kind: "keyed", hasKey: true },
    }));
    const { h, deps, id } = studio(statuses);
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        llm: { provider: "openrouter", model: "gpt" },
        audio: { ...h.document.form.audio, provider: "openai-tts", model: "tts", voice: "alloy" },
        images: { provider: "openai-image", model: "img" },
      },
    };
    updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Show",
      document,
    });
    const result = await getStudio(deps, id);
    expect(result.ok && result.value.checks.find((check) => check.id === "providers")?.ok).toBe(
      true,
    );
  });
});
