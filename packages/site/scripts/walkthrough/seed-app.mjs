// What the walkthrough shows, put in place through the running app's own API so the shapes
// are always the ones this version accepts. Everything is what Slopify ships with: the
// bundled samples (restored if the first launch did not bring them) and the History starter
// pack's prompts and template. On top of those, the default channel gets a name and a series
// brief, and a weekly schedule from the pack's template gets six queued topics.
//
// Nothing here can start a run: the schedule's first run is hours after the recording, and
// its topic generation is off. The data directory is a throwaway one.

async function call(origin, method, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 300)}`);
  return text === "" ? {} : JSON.parse(text);
}

// A whole hour of the day, in UTC, at least `hours` from now: the schedule's runs stay clear
// of the recording.
function later(hours) {
  const at = new Date(Date.now() + (hours + 1) * 3_600_000);
  return `${String(at.getUTCHours()).padStart(2, "0")}:00`;
}

export const packId = "history";
// The template the History pack installs, as Play's Template list names it.
export const packTemplateName = "History starter";
export const channelName = "Ancient History";
export const scheduleName = "History, three a week";
export const queuedTopics = [
  "The Lighthouse of Alexandria",
  "The Roads of Rome",
  "The Lost City of Ubar",
  "The Terracotta Army",
  "The Silk Road Caravans",
  "The Fall of Constantinople",
];

export async function seedApp(origin) {
  let { samples } = await call(origin, "GET", "/api/onboarding/sample");
  if (samples.library === null || samples.podcast === null) {
    await call(origin, "POST", "/api/onboarding/sample/restore");
    ({ samples } = await call(origin, "GET", "/api/onboarding/sample"));
  }
  if (samples.library === null || samples.podcast === null)
    throw new Error("The bundled samples did not restore.");

  const pack = await call(origin, "POST", `/api/onboarding/packs/${packId}`);
  if (pack.templateId === null)
    throw new Error(`The ${packId} starter pack installed no template.`);
  const { templates } = await call(origin, "GET", "/api/project-templates");
  const template = templates.find((one) => one.id === pack.templateId);
  if (template === undefined)
    throw new Error(`The ${packId} starter pack's template is not in the template list.`);

  const { channels } = await call(origin, "GET", "/api/channels");
  const channel = channels.find((one) => one.isDefault) ?? channels[0];
  await call(origin, "PUT", `/api/channels/${channel.id}`, {
    name: channelName,
    brand: channel.brand,
    seriesBrief:
      "Calm documentaries about the ancient world: one place, person or object per video, told from the sources, with what is uncertain said plainly.",
    baseVersion: channel.version,
  });

  await call(origin, "POST", "/api/schedules", {
    id: crypto.randomUUID(),
    name: scheduleName,
    templateId: template.id,
    templateVersion: template.version,
    cadence: { kind: "weekly", time: later(6), days: [1, 3, 5] },
    timezone: "UTC",
    items: queuedTopics.map((title) => ({ title, values: {} })),
  });
  return { samples };
}
