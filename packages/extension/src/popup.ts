import { browserApi } from "./browser.js";
import type { ReadyProject, WorkerAnswer } from "./pack.js";

// The toolbar popup: the finished projects not marked uploaded in Slopify, each opening to its
// video and shorts. Clicking one puts it first in line and opens Studio's upload page, where the
// extension adds the file and fills the details. Pairing is a link in the corner.

const api = browserApi();
const main = document.getElementById("main") as HTMLElement;
const heading = document.getElementById("heading") as HTMLElement;
const back = document.getElementById("back") as HTMLButtonElement;

// Reads each known video's numbers from Studio now, one background tab after another, instead
// of waiting for the daily sweep.
const statsButton = document.getElementById("stats") as HTMLButtonElement | null;
statsButton?.addEventListener("click", () => {
  statsButton.disabled = true;
  void (api.runtime.sendMessage({ type: "stats-now" }) as Promise<WorkerAnswer<number>>).then(
    (answer) => {
      statsButton.textContent = !answer.ok
        ? answer.message
        : answer.value <= 0
          ? "No video on YouTube is known to Slopify yet."
          : `Reading ${String(answer.value)} videos in background tabs…`;
    },
  );
});

document.getElementById("pairing")?.addEventListener("click", () => {
  void api.runtime.openOptionsPage();
});

function note(text: string, error = false): void {
  const p = document.createElement("p");
  p.className = error ? "note error" : "note";
  p.textContent = text;
  main.replaceChildren(p);
}

function row(
  title: string,
  meta: string,
  run?: () => void,
  done = false,
  action = false,
): HTMLLIElement {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.className = "row";
  button.disabled = run === undefined;
  const name = document.createElement("span");
  name.className = "title";
  name.textContent = title;
  const side = document.createElement("span");
  side.className = done ? "meta done" : action ? "meta action" : "meta";
  side.textContent = meta;
  button.append(name, side);
  if (run !== undefined) button.addEventListener("click", run);
  li.append(button);
  return li;
}

function showProjects(projects: readonly ReadyProject[]): void {
  heading.textContent = "Ready to upload";
  back.hidden = true;
  if (projects.length === 0) {
    note("Nothing is waiting: every finished project is marked uploaded in Slopify.");
    return;
  }
  const list = document.createElement("ul");
  // Soonest due first: the earliest time a not-uploaded item must be scheduled by.
  const due = (project: ReadyProject): number =>
    Math.min(
      ...project.items
        .filter((item) => !item.uploaded && item.uploadBy !== undefined)
        .map((item) => Date.parse(item.uploadBy ?? "")),
    );
  for (const project of projects.toSorted((left, right) => due(left) - due(right))) {
    const left = project.items.filter((item) => !item.uploaded).length;
    const by = due(project);
    list.append(
      row(
        project.title,
        left === 0
          ? "all on YouTube"
          : Number.isFinite(by) && by < Date.now()
            ? `${String(left)} late`
            : `${String(left)} to upload`,
        () => showItems(project, projects),
        left === 0,
      ),
    );
  }
  main.replaceChildren(list);
}

// "Sun 5 Oct, 20:00", the plan's time for an upload, in this browser's time zone.
function when(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function showItems(project: ReadyProject, projects: readonly ReadyProject[]): void {
  heading.textContent = project.title;
  back.hidden = false;
  back.onclick = () => showProjects(projects);
  const list = document.createElement("ul");
  const shortsLeft = project.items.filter(
    (item) => item.kind === "short" && item.ready && !item.uploaded,
  ).length;
  if (shortsLeft > 1)
    list.append(
      row(
        `Upload all ${String(shortsLeft)} shorts`,
        "one after another",
        () => void uploadAll(project.projectId),
        false,
        true,
      ),
    );
  for (const item of project.items) {
    const name = item.kind === "video" ? "Video" : `Short ${String(item.short)}`;
    // When it goes public; flagged late once it is too near that to upload in time.
    const time = when(item.scheduleAt);
    const late = item.uploadBy !== undefined && Date.parse(item.uploadBy) < Date.now();
    const meta = item.uploaded
      ? item.kind === "video" && item.videoId !== undefined
        ? "A/B test…"
        : "✓ on YouTube"
      : !item.ready
        ? "not rendered"
        : `${item.started === true ? "Upload again" : "Upload"}${
            time === undefined ? "" : late ? ` · late, public ${time}` : ` · public ${time}`
          }`;
    const videoId = item.videoId;
    const run =
      item.uploaded && item.kind === "video" && videoId !== undefined
        ? () => showAbChoices(project, projects, videoId)
        : item.ready && !item.uploaded
          ? () => void upload(project.projectId, item.short)
          : undefined;
    list.append(
      row(
        `${name} · ${item.title}`,
        meta,
        run,
        item.uploaded && item.kind !== "video",
        !item.uploaded && item.ready,
      ),
    );
  }
  main.replaceChildren(list);
}

// A/B test on the uploaded video: Studio opens it with A/B Testing set up for the chosen part;
// the person presses Set test and Save there.
function showAbChoices(
  project: ReadyProject,
  projects: readonly ReadyProject[],
  videoId: string,
): void {
  heading.textContent = "A/B test";
  back.hidden = false;
  back.onclick = () => showItems(project, projects);
  const list = document.createElement("ul");
  for (const [mode, label] of [
    ["both", "Titles and thumbnails"],
    ["titles", "Titles"],
    ["thumbnails", "Thumbnails"],
  ] as const)
    list.append(
      row(
        label,
        "Open in Studio",
        () => {
          void api.tabs?.create({
            url: `https://studio.youtube.com/video/${videoId}/edit#slopify-ab=${mode}&p=${encodeURIComponent(project.projectId)}&s=0`,
            active: true,
          });
          window.close();
        },
        false,
        true,
      ),
    );
  const hint = document.createElement("p");
  hint.className = "note";
  hint.textContent =
    "Studio opens with A/B Testing filled in. Check it, press Set test, then Save.";
  main.replaceChildren(list, hint);
}

async function uploadAll(projectId: string): Promise<void> {
  note("Opening YouTube Studio…");
  const answer = (await api.runtime.sendMessage({
    type: "upload-all",
    projectId,
  })) as WorkerAnswer<number>;
  if (!answer.ok) {
    note(answer.message, true);
    return;
  }
  window.close();
}

async function upload(projectId: string, short: number | null): Promise<void> {
  note("Opening YouTube Studio…");
  const answer = (await api.runtime.sendMessage({
    type: "upload",
    projectId,
    short,
  })) as WorkerAnswer<string>;
  if (!answer.ok) {
    note(answer.message, true);
    return;
  }
  window.close();
}

async function start(): Promise<void> {
  const status = (await api.runtime.sendMessage({ type: "status" })) as WorkerAnswer<string | null>;
  if (!status.ok || status.value === null) {
    note("Pair the extension with Slopify first.");
    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "Pair with Slopify";
    button.addEventListener("click", () => void api.runtime.openOptionsPage());
    main.append(button);
    return;
  }
  const ready = (await api.runtime.sendMessage({ type: "ready" })) as WorkerAnswer<
    readonly ReadyProject[]
  >;
  if (!ready.ok) note(ready.message, true);
  else showProjects(ready.value);
}

void start();
