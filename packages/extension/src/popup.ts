import { browserApi } from "./browser.js";
import type { ReadyProject, WorkerAnswer } from "./pack.js";

// The toolbar popup: the finished projects not marked uploaded in Slopify, soonest first, each
// with a dot per upload (filled once it is on YouTube) and when its next one goes public. A
// project opens to its video and shorts, each with its own Upload button, and Upload all for
// its shorts. Pairing shows as a chip in the header; the footer reads Studio's numbers now and
// opens Slopify.

type Item = ReadyProject["items"][number];

const api = browserApi();
const main = document.getElementById("main") as HTMLElement;
const heading = document.getElementById("heading") as HTMLElement;
const back = document.getElementById("back") as HTMLButtonElement;
const mark = document.getElementById("mark") as HTMLElement;
const paired = document.getElementById("paired") as HTMLElement;
const status = document.getElementById("status") as HTMLElement;
let base: string | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

document.getElementById("settings")?.addEventListener("click", () => {
  void api.runtime.openOptionsPage();
});
document.getElementById("open")?.addEventListener("click", () => {
  if (base !== null) void api.tabs?.create({ url: base, active: true });
  window.close();
});

// Exports the Analytics view and reads A/B results now, instead of waiting for the day.
const statsButton = document.getElementById("stats") as HTMLButtonElement;
statsButton.addEventListener("click", () => {
  statsButton.disabled = true;
  status.textContent = "Reading Studio in background tabs…";
  void (api.runtime.sendMessage({ type: "stats-now" }) as Promise<WorkerAnswer<number>>).then(
    (answer) => {
      statsButton.disabled = false;
      status.textContent = answer.ok
        ? "Reading Studio in background tabs; Channels → YouTube fills in within a minute."
        : answer.message;
    },
  );
});

function note(text: string, error = false): void {
  main.replaceChildren(el("p", error ? "note error" : "note", text));
}

// "Tue 6 Oct, 17:00", in this browser's time zone.
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

const late = (item: Item): boolean =>
  !item.uploaded && item.uploadBy !== undefined && Date.parse(item.uploadBy) < Date.now();

// The next upload of a project to go public that isn't on YouTube yet.
function nextUp(project: ReadyProject): Item | undefined {
  return project.items
    .filter((item) => !item.uploaded && item.scheduleAt !== undefined)
    .toSorted((a, b) => Date.parse(a.scheduleAt ?? "") - Date.parse(b.scheduleAt ?? ""))[0];
}

function dots(project: ReadyProject): HTMLElement {
  const box = el("span", "dots");
  box.setAttribute("aria-hidden", "true");
  for (const item of project.items) {
    const dot = el(
      "i",
      [item.kind === "video" ? "long" : "", item.uploaded ? "up" : late(item) ? "late" : ""]
        .join(" ")
        .trim(),
    );
    box.append(dot);
  }
  return box;
}

const chevron = (): HTMLElement => {
  const span = el("span", "chev");
  span.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  return span;
};

function showProjects(projects: readonly ReadyProject[]): void {
  heading.textContent = "Ready to upload";
  back.hidden = true;
  mark.hidden = false;
  if (projects.length === 0) {
    const empty = el("div", "empty");
    empty.append(
      el("strong", undefined, "Nothing waits to be uploaded"),
      document.createTextNode(
        "Every finished project is on YouTube or marked uploaded in Slopify.",
      ),
    );
    main.replaceChildren(empty);
    return;
  }
  const soonest = (project: ReadyProject): number => {
    const next = nextUp(project);
    return next === undefined ? Number.POSITIVE_INFINITY : Date.parse(next.scheduleAt ?? "");
  };
  const list = el("ul");
  for (const project of projects.toSorted((a, b) => soonest(a) - soonest(b))) {
    const total = project.items.length;
    const up = project.items.filter((item) => item.uploaded).length;
    const next = nextUp(project);
    const lateCount = project.items.filter(late).length;
    const button = el("button", "project");
    button.type = "button";
    const sub = el("span", "sub");
    sub.append(
      dots(project),
      el(
        "span",
        lateCount > 0 ? "state late" : undefined,
        up === total
          ? "All on YouTube"
          : lateCount > 0
            ? `${String(lateCount)} late`
            : next !== undefined
              ? `${String(up)} of ${String(total)} up · next ${when(next.scheduleAt) ?? ""}`
              : `${String(up)} of ${String(total)} up`,
      ),
    );
    button.append(el("span", "name", project.title), chevron(), sub);
    button.setAttribute(
      "aria-label",
      `${project.title}: ${String(up)} of ${String(total)} on YouTube`,
    );
    button.addEventListener("click", () => showItems(project, projects));
    const li = el("li");
    li.append(button);
    list.append(li);
  }
  main.replaceChildren(el("div", "section", `${String(projects.length)} projects`), list);
}

function showItems(project: ReadyProject, projects: readonly ReadyProject[]): void {
  heading.textContent = project.title;
  heading.title = project.title;
  back.hidden = false;
  mark.hidden = true;
  back.onclick = () => showProjects(projects);
  const parts: HTMLElement[] = [];
  const shortsLeft = project.items.filter(
    (item) => item.kind === "short" && item.ready && !item.uploaded,
  ).length;
  if (shortsLeft > 1) {
    const all = el(
      "button",
      "btn primary wide",
      `Upload all ${String(shortsLeft)} shorts, one at a time`,
    );
    all.type = "button";
    all.addEventListener("click", () => void uploadAll(project.projectId));
    parts.push(all);
  }
  const list = el("ul");
  for (const item of project.items) {
    const li = el("li", "upload");
    const time = when(item.scheduleAt);
    const state = item.uploaded
      ? { text: "✓ On YouTube", tone: "done" }
      : !item.ready
        ? { text: "Not rendered yet", tone: "muted" }
        : late(item)
          ? { text: `Late · goes public ${time ?? ""}`, tone: "late" }
          : {
              text: time === undefined ? "Ready · no release time" : `Ready · goes public ${time}`,
              tone: "",
            };
    li.append(
      el("span", "kind", item.kind === "video" ? "Video" : `Short ${String(item.short)}`),
      el("span", "name", item.title),
      el("span", `state ${state.tone}`.trim(), state.text),
    );
    const videoId = item.videoId;
    if (item.uploaded && item.kind === "video" && videoId !== undefined) {
      const ab = el("button", "btn act", "A/B test");
      ab.type = "button";
      ab.addEventListener("click", () => showAbChoices(project, projects, videoId));
      li.append(ab);
    } else if (item.ready && !item.uploaded) {
      const up = el("button", "btn act", item.started === true ? "Upload again" : "Upload");
      up.type = "button";
      up.addEventListener("click", () => void upload(project.projectId, item.short));
      li.append(up);
    }
    list.append(li);
  }
  parts.push(list);
  main.replaceChildren(...parts);
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
  mark.hidden = true;
  back.onclick = () => showItems(project, projects);
  const list = el("ul");
  for (const [mode, label] of [
    ["both", "Titles and thumbnails"],
    ["titles", "Titles"],
    ["thumbnails", "Thumbnails"],
  ] as const) {
    const li = el("li", "upload");
    li.append(el("span", "name", label));
    const open = el("button", "btn act", "Open in Studio");
    open.type = "button";
    open.addEventListener("click", () => {
      void api.tabs?.create({
        url: `https://studio.youtube.com/video/${videoId}/edit#slopify-ab=${mode}&p=${encodeURIComponent(project.projectId)}&s=0`,
        active: true,
      });
      window.close();
    });
    li.append(open);
    list.append(li);
  }
  main.replaceChildren(
    list,
    el(
      "p",
      "note",
      "Studio opens with A/B Testing filled in. Check it, press Set test, then Save.",
    ),
  );
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
  const reply = (await api.runtime.sendMessage({ type: "status" })) as WorkerAnswer<string | null>;
  base = reply.ok ? reply.value : null;
  if (base === null) {
    paired.className = "chip off";
    paired.textContent = "Not paired";
    const empty = el("div", "empty");
    const pair = el("button", "btn primary", "Pair with Slopify");
    pair.type = "button";
    pair.addEventListener("click", () => void api.runtime.openOptionsPage());
    empty.append(
      el("strong", undefined, "Pair the extension first"),
      document.createTextNode("Copy the pairing token from Slopify's Settings → YouTube Studio."),
      el("br"),
      el("br"),
      pair,
    );
    main.replaceChildren(empty);
    return;
  }
  paired.className = "chip on";
  paired.textContent = "Paired";
  paired.title = base;
  const ready = (await api.runtime.sendMessage({ type: "ready" })) as WorkerAnswer<
    readonly ReadyProject[]
  >;
  if (!ready.ok) note(ready.message, true);
  else showProjects(ready.value);
}

void start();
