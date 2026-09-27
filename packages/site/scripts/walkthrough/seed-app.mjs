// What the running app needs for the steps past the demo project, added through its own API
// so the shapes are always the ones this version accepts: the bundled samples (restored if
// the first launch did not bring them), a template saved from the Library of Alexandria
// sample, and a weekly schedule with queued topics for the calendar.
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

export const scheduleName = "Sleep lore, three a week";
export const queuedTopics = [
  "The Sunken Archive",
  "The Bell Under the Lake",
  "The Map That Drew Itself",
  "The Last Lamplighter",
  "The Orchard of Glass",
  "The Tide Clock",
];

export async function seedApp(origin) {
  let { samples } = await call(origin, "GET", "/api/onboarding/sample");
  if (samples.library === null || samples.audiobook === null) {
    await call(origin, "POST", "/api/onboarding/sample/restore");
    ({ samples } = await call(origin, "GET", "/api/onboarding/sample"));
  }
  if (samples.library === null)
    throw new Error("The bundled Library of Alexandria sample did not restore.");

  const library = await call(origin, "GET", `/api/projects/${samples.library}`);
  if (library.revisionId === null)
    throw new Error("The Library of Alexandria sample has no revision to save a template from.");
  const template = await call(
    origin,
    "POST",
    `/api/project-templates/from-project/${samples.library}`,
    { id: crypto.randomUUID(), name: "Sleep lore", revisionId: library.revisionId },
  );

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
