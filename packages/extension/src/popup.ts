import { browserApi } from "./browser.js";
import type { ReadyProject, WorkerAnswer } from "./pack.js";

// The toolbar popup: the finished projects not marked uploaded in Slopify, each opening to its
// video and shorts. Clicking one puts it first in line and opens Studio's upload page, where the
// extension adds the file and fills the details. Pairing is a link in the corner.

const api = browserApi();
const main = document.getElementById("main") as HTMLElement;
const heading = document.getElementById("heading") as HTMLElement;
const back = document.getElementById("back") as HTMLButtonElement;

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
  for (const project of projects) {
    const left = project.items.filter((item) => !item.uploaded).length;
    list.append(
      row(
        project.title,
        left === 0 ? "all on YouTube" : `${String(left)} to upload`,
        () => showItems(project, projects),
        left === 0,
      ),
    );
  }
  main.replaceChildren(list);
}

function showItems(project: ReadyProject, projects: readonly ReadyProject[]): void {
  heading.textContent = project.title;
  back.hidden = false;
  back.onclick = () => showProjects(projects);
  const list = document.createElement("ul");
  for (const item of project.items) {
    const name = item.kind === "video" ? "Video" : `Short ${String(item.short)}`;
    const meta = item.uploaded
      ? "✓ on YouTube"
      : !item.ready
        ? "not rendered"
        : item.started === true
          ? "Upload again"
          : "Upload";
    list.append(
      row(
        `${name} · ${item.title}`,
        meta,
        item.ready ? () => void upload(project.projectId, item.short) : undefined,
        item.uploaded,
        item.ready && !item.uploaded,
      ),
    );
  }
  main.replaceChildren(list);
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
