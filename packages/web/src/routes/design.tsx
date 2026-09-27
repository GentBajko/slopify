import {
  CopyIcon,
  DownloadIcon,
  FolderOpenIcon,
  Maximize2Icon,
  PlayIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button, ButtonRow, IconButton, PlayKey } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand, useCommandPalette } from "@/components/kit/command-palette";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Code, Field, Input, Select, Textarea } from "@/components/kit/field";
import { ListDetail, PageHeader, Rule, Workspace } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { Lightbox, type LightboxItem, MediaFrame, MediaGrid } from "@/components/kit/media";
import { NextAction } from "@/components/kit/next-action";
import { Player } from "@/components/kit/player";
import { Rail, RailButton } from "@/components/kit/rail";
import { ReadingView } from "@/components/kit/reading-view";
import { SectionHead } from "@/components/kit/section-head";
import { DataTable, Meter, Stat, Stats } from "@/components/kit/stats";
import { Badge, Chip, Lamp, Status, type Tone } from "@/components/kit/status";
import { Steps } from "@/components/kit/steps";
import { Segmented, Switch } from "@/components/kit/switch";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { useToast } from "@/components/kit/toast";

// Dev only (router.tsx mounts it under `import.meta.env.DEV`): every kit component in every
// state, in the theme picked at the top, so a screen can be checked against the design system
// by eye. Not linked from the app.

// Stand-in media: gradients drawn as SVG, so the gallery needs no files and no network.
function art(hue: number, label: string, w = 1600, h = 900): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${String(hue)} 45% 28%)"/><stop offset="1" stop-color="hsl(${String((hue + 60) % 360)} 50% 12%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${String(w * 0.7)}" cy="${String(h * 0.35)}" r="${String(h * 0.18)}" fill="hsl(${String(hue)} 60% 60% / .35)"/><text x="48" y="${String(h - 56)}" font-family="sans-serif" font-size="${String(h / 12)}" fill="#ece9e2">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const images: readonly LightboxItem[] = [
  { src: art(20, "Tiamat over Avernus"), alt: "Tiamat over Avernus", caption: "0:00–4:10" },
  { src: art(200, "The five heads"), alt: "The five heads", caption: "4:10–9:32" },
  { src: art(120, "The Well of Dragons"), alt: "The Well of Dragons", caption: "9:32–15:05" },
  { src: art(280, "Bahamut"), alt: "Bahamut", caption: "15:05–21:40" },
];

const article = `The Queen of Evil Dragons has five heads and one patience.

## Origins

In the Nine Hells, **Tiamat** waits. Search for "Tiamat" to see highlighting.

## The five heads

Each head breathes its own ruin: fire, frost, lightning, acid and poison.

- White for frost
- Red for fire

## Her return

Every cult of the dragon has one goal: to open the way for \`{{Topic}}\` to return.
`;

type Theme = "system" | "dark" | "light";

function useGalleryTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const now = document.documentElement.getAttribute("data-theme");
    return now === "light" || now === "dark" ? now : "system";
  });
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => {
      if (before === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", before);
    };
  }, [theme]);
  return [theme, setTheme];
}

function Specimen({
  title,
  meta,
  children,
}: {
  readonly title: string;
  readonly meta?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="min-w-0">
      <SectionHead title={title} meta={meta} />
      <div className="flex flex-col gap-5">{children}</div>
      <Rule />
    </section>
  );
}

const tones: readonly Tone[] = ["running", "done", "waiting", "failed", "info", "off"];
const toneWord: Readonly<Record<Tone, string>> = {
  running: "Running",
  done: "Done",
  waiting: "Waiting for you",
  failed: "Failed",
  info: "Flagged by review",
  off: "Not started",
};

export function DesignRoute(): ReactElement {
  const [theme, setTheme] = useGalleryTheme();
  const notify = useToast();
  const palette = useCommandPalette();
  const [tab, setTab] = useState<"article" | "images" | "video" | "shorts">("images");
  const [switchOn, setSwitchOn] = useState(true);
  const [seg, setSeg] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [section, setSection] = useState("images");
  const [selected, setSelected] = useState("tiamat");

  useCommand({
    id: "design.toast",
    title: "Show a sample toast",
    group: "Design gallery",
    context: "Design",
    run: () => notify("Template saved.", "success"),
  });
  useCommand({
    id: "design.theme",
    title: "Switch the gallery to the light theme",
    group: "Design gallery",
    context: "Design",
    keywords: ["appearance"],
    run: () => setTheme("light"),
  });

  return (
    <div>
      <PageHeader
        crumb="Development"
        title="Design system"
        meta="Every kit component in every state. Pick a theme to check both."
        actions={
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        }
      />

      <Specimen
        title="Type"
        meta="display, title-1, title-2, title-3, body, small, label, counter, code"
      >
        <p className="sl-display">Lore To Sleep To</p>
        <p className="sl-title-1">D&amp;D Lore: Tiamat</p>
        <p className="m-0 text-title-2 font-semibold">Images</p>
        <p className="m-0 text-title-3 font-semibold">Establishing image</p>
        <p className="m-0 text-body">
          Every other image follows it for characters, palette and style.
        </p>
        <p className="m-0 text-small text-ink-2">Codex · GPT-6 Sol · Ultra · 4 min 12 s</p>
        <span className="sl-kicker">Images · 8</span>
        <span className="sl-stat__value">$4.12</span>
        <span>
          Keywords like <Code>{"{{Topic}}"}</Code> and commands like <Code>codex login</Code>.
        </span>
      </Specimen>

      <Specimen
        title="Buttons"
        meta="primary, secondary, quiet, destructive, icon; small; disabled; the Play key"
      >
        <ButtonRow>
          <Button variant="primary">
            <SparklesIcon aria-hidden="true" strokeWidth={1.75} />
            Remake 3 outdated images
          </Button>
          <Button>Edit settings</Button>
          <Button variant="quiet">
            <FolderOpenIcon aria-hidden="true" strokeWidth={1.75} />
            Open folder
          </Button>
          <Button variant="destructive">
            <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
            Delete project
          </Button>
          <IconButton label="Copy description">
            <CopyIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </ButtonRow>
        <ButtonRow>
          <Button variant="primary" size="small">
            Queue 3 videos
          </Button>
          <Button size="small">Duplicate</Button>
          <Button variant="quiet" size="small">
            Copy
          </Button>
          <Button variant="destructive" size="small">
            Delete
          </Button>
          <Button
            variant="primary"
            disabled
            disabledReason="Codex is signed out. Sign in to Codex first."
          >
            Start the run
          </Button>
          <Button disabled disabledReason="Nothing changed yet">
            Save
          </Button>
        </ButtonRow>
        <div className="max-w-[320px]">
          <PlayKey>
            <PlayIcon aria-hidden="true" strokeWidth={1.75} />
            Make the video
          </PlayKey>
        </div>
      </Specimen>

      <Specimen title="Fields" meta="label, help, error; input, select, textarea">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" help="Shown on YouTube and in the library.">
            <Input defaultValue="D&D Lore: Tiamat" />
          </Field>
          <Field
            label="Topic"
            error="The topic is empty, so the prompt has nothing to fill {{Topic}} with. Type a topic."
          >
            <Input placeholder="Tiamat" />
          </Field>
          <Field label="Image model">
            <Select
              defaultValue="sol"
              options={[
                { value: "sol", label: "Codex · GPT-6 Sol" },
                { value: "flux", label: "Flux 2" },
              ]}
            />
          </Field>
          <Field label="Notes" help="One short line at most.">
            <Textarea placeholder="Anything the article should mention" />
          </Field>
        </div>
      </Specimen>

      <Specimen title="Switch and segmented">
        <Switch checked={switchOn} onChange={setSwitchOn} label="Review images before export" />
        <Switch checked={false} onChange={() => {}} label="Upload captions" disabled />
        <Segmented
          label="Aspect"
          className="self-start"
          value={seg}
          onChange={setSeg}
          options={[
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "1:1", label: "1:1" },
          ]}
        />
      </Specimen>

      <Specimen title="Tabs" meta="arrow keys, Home and End move">
        <Tabs
          label="Project"
          idPrefix="design-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { id: "article", label: "Article" },
            { id: "images", label: "Images", badge: "9" },
            { id: "video", label: "Video" },
            { id: "shorts", label: "Shorts", badge: "3", disabled: true },
          ]}
        />
        {(["article", "images", "video", "shorts"] as const).map((id) => (
          <TabPanel key={id} idPrefix="design-tabs" id={id} active={tab === id}>
            <p className="m-0 text-small text-ink-2">{`The ${id} panel.`}</p>
          </TabPanel>
        ))}
      </Specimen>

      <Specimen title="Section head">
        <SectionHead
          kicker="Reference · not in the video"
          title="Establishing image"
          meta="Every image below follows it for Tiamat's look, palette and style"
          info="play.reference"
        >
          <Button variant="primary">Regenerate</Button>
          <Button variant="quiet">Replace with upload</Button>
        </SectionHead>
      </Specimen>

      <Specimen title="Lamp, status, badge, chip">
        <div className="flex flex-wrap gap-5">
          {tones.map((tone) => (
            <Status key={tone} tone={tone}>
              {toneWord[tone]}
            </Status>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {tones.map((tone) => (
            <Lamp key={tone} tone={tone} />
          ))}
          <Badge>Draft</Badge>
          <Badge tone="running">Generating</Badge>
          <Badge tone="waiting">Waiting for limits</Badge>
          <Badge tone="failed">Failed</Badge>
          <Badge tone="info">Outdated</Badge>
          <Chip>Tiamat</Chip>
          <Chip onRemove={() => {}} removeLabel="Remove keyword Bahamut">
            Bahamut
          </Chip>
        </div>
      </Specimen>

      <Specimen
        title="Media"
        meta="aspect boxes, captions, badges, hover and focus actions, generating; click opens the lightbox"
      >
        <MediaGrid label="Images">
          {images.map((image, index) => (
            <MediaFrame
              key={image.src}
              src={image.src}
              alt={image.alt}
              title={image.alt}
              meta={image.caption}
              onOpen={() => setLightbox(index)}
              {...(index === 1 ? { badge: <Badge tone="info">Redone after review</Badge> } : {})}
              actions={
                <>
                  <Button size="small">
                    <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
                    Regenerate
                  </Button>
                  <IconButton
                    label="Open full size"
                    size="small"
                    onClick={() => setLightbox(index)}
                  >
                    <Maximize2Icon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                </>
              }
            />
          ))}
          <MediaFrame
            alt="Tiamat's return"
            title="Tiamat's return"
            meta="27:12–33:40"
            generating="Codex is refining the image · 3 so far"
          />
          <MediaFrame alt="Empty" title="Not made yet" meta="—" />
        </MediaGrid>
        <MediaGrid shorts label="Shorts">
          {[40, 160, 300].map((hue, i) => (
            <MediaFrame
              key={hue}
              aspect="portrait"
              src={art(hue, `Short ${String(i + 1)}`, 900, 1600)}
              alt={`Short ${String(i + 1)}`}
              title={`Short ${String(i + 1)}`}
              meta="1:04"
              actionsShown={i === 0}
              actions={
                <IconButton label="Download" size="small">
                  <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                </IconButton>
              }
            />
          ))}
          <MediaFrame
            aspect="square"
            src={art(90, "Thumb", 900, 900)}
            alt="Square thumbnail"
            title="Square"
          />
        </MediaGrid>
        <Lightbox
          items={images}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      </Specimen>

      <Specimen title="Player" meta="poster, own controls, chapter marks; 9:16 for shorts">
        <div className="flex flex-wrap items-start gap-6">
          <Player
            className="w-full max-w-[640px]"
            src=""
            poster={art(20, "Poster")}
            label="Sample player with no video loaded"
            chapters={[
              { start: 0, title: "Tiamat over Avernus" },
              { start: 1.5, title: "The five heads" },
              { start: 3.2, title: "The Well of Dragons" },
            ]}
          />
          <Player
            className="w-[200px]"
            portrait
            src=""
            poster={art(200, "Short", 900, 1600)}
            label="Sample short with no video loaded"
          />
        </div>
      </Specimen>

      <Specimen title="Workspace" meta="section rail, main, action rail">
        <Workspace
          sections={
            <Rail label="Sections">
              {["article", "narration", "images", "video", "shorts"].map((id) => (
                <RailButton
                  key={id}
                  current={section === id}
                  onClick={() => setSection(id)}
                  {...(id === "images" ? { meta: "9" } : {})}
                >
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </RailButton>
              ))}
            </Rail>
          }
          aside={
            <>
              <NextAction
                tone="waiting"
                status="Waiting for you"
                title="The review before the export is ready."
                why="Approve to render the 2 h video and 3 shorts. About 25 min."
                action={<Button variant="primary">Approve and render</Button>}
              />
              <div>
                <div className="sl-kicker mb-2">Run</div>
                <Steps
                  label="Run steps"
                  steps={[
                    {
                      id: "a",
                      name: "Article",
                      tone: "done",
                      state: "Done",
                      time: "6 min",
                      detail: "17,240 words · review passed",
                    },
                    {
                      id: "n",
                      name: "Narration",
                      tone: "done",
                      state: "Done",
                      time: "41 min",
                      detail: "2 h 04 min",
                    },
                    {
                      id: "i",
                      name: "Images",
                      tone: "running",
                      state: "Running",
                      time: "24 min",
                      detail: "8 of 9 · 4 at once",
                    },
                    {
                      id: "r",
                      name: "Review",
                      tone: "waiting",
                      state: "Waiting for you",
                      detail: "Held for you",
                    },
                    { id: "v", name: "Video", tone: "off", state: "Not started" },
                  ]}
                />
              </div>
            </>
          }
        >
          <SectionHead title="Images" meta="8 in the video · reviewed by Codex" />
          <p className="m-0 text-ink-2">{`The ${section} section.`}</p>
        </Workspace>
      </Specimen>

      <Specimen title="Callouts" meta="danger, waiting, info; the fix is a button">
        <Callout
          tone="danger"
          title="Codex is signed out, so the images can't start."
          actions={<Button variant="primary">Sign in to Codex</Button>}
        >
          Run codex login on the machine running Slopify, then continue the run.
        </Callout>
        <Callout tone="waiting" title="Waiting for Codex limits.">
          Your weekly limit resets Tuesday 09:00. The run continues by itself.
        </Callout>
        <Callout title="Regenerating it marks 9 images outdated.">
          They keep their current version until you remake them.
        </Callout>
      </Specimen>

      <Specimen title="List and detail" meta="rows with visible actions">
        <ListDetail
          list={
            <List label="Prompts">
              {[
                ["tiamat", "D&D Lore article", "Article · edited today"],
                ["sheet", "D&D Character Sheet", "Image · used by 14 projects"],
                ["short", "Shorts hook", "Short · never used"],
              ].map(([id, title, meta]) => (
                <ListRow
                  key={id}
                  title={title}
                  meta={meta}
                  selected={selected === id}
                  onSelect={() => setSelected(id ?? "")}
                  actions={
                    <>
                      <Button variant="quiet" size="small">
                        Duplicate
                      </Button>
                      <IconButton label={`Delete ${title ?? ""}`} size="small">
                        <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                    </>
                  }
                />
              ))}
            </List>
          }
          detail={
            <div>
              <SectionHead title="Edit prompt" meta={`Selected: ${selected}`}>
                <Button variant="primary">Save prompt</Button>
              </SectionHead>
              <Field label="Name">
                <Input defaultValue={selected} />
              </Field>
            </div>
          }
        />
      </Specimen>

      <Specimen title="Board" meta="Home and the calendar: columns of sections, stacked on phones">
        <Board split="main-side">
          <BoardColumn>
            <SectionHead title="Needs you" meta="2 things are waiting for a decision" />
            <SectionHead title="Running now" meta="1 video" />
          </BoardColumn>
          <BoardColumn>
            <SectionHead title="Coming up" meta="Next 7 days" />
            <SectionHead title="This week" />
          </BoardColumn>
        </Board>
      </Specimen>

      <Specimen title="Stats, meter, table">
        <Stats>
          <Stat value="$4.12" label="This run" />
          <Stat value="18%" label="Weekly Codex limit">
            <Meter
              value={0.18}
              label="Weekly Codex limit"
              valueText="18% of your weekly Codex limit"
            />
          </Stat>
          <Stat value="82%" label="Claude session">
            <Meter value={0.82} tone="waiting" label="Claude session" />
          </Stat>
          <Stat value="14" label="Projects" />
        </Stats>
        <DataTable
          caption="Cost by stage"
          rowKey={(row) => row.stage}
          columns={[
            { id: "stage", header: "Stage", cell: (row) => row.stage },
            { id: "model", header: "Model", cell: (row) => row.model },
            { id: "cost", header: "Cost", numeric: true, cell: (row) => row.cost },
          ]}
          rows={[
            { stage: "Article", model: "Claude Code · Opus", cost: "$0 on your plan" },
            { stage: "Images", model: "Codex · GPT-6 Sol", cost: "~$3.40 via API" },
          ]}
        />
      </Specimen>

      <Specimen
        title="Overlays"
        meta="Ctrl+K opens the palette anywhere; dialogs confirm with named buttons"
      >
        <ButtonRow>
          <Button onClick={() => palette.setOpen(true)}>Open the command palette</Button>
          <Button onClick={() => setDialog(true)}>Open a dialog</Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            Delete project
          </Button>
          <Button variant="quiet" onClick={() => notify("Template saved.", "success")}>
            Show a toast
          </Button>
          <Button
            variant="quiet"
            onClick={() =>
              notify("Could not save: the disk is full. Free space and press Save again.", "error")
            }
          >
            Show an error toast
          </Button>
        </ButtonRow>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Rename project"
          description="The folder on disk keeps its name."
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Rename project
              </Button>
            </>
          }
        >
          <Field label="Name">
            <Input defaultValue="D&D Lore: Tiamat" />
          </Field>
        </Dialog>
        <ConfirmDialog
          open={confirm}
          title="Delete 'D&D Lore: Tiamat'?"
          consequence="The project and its 9 images are removed from disk."
          confirmLabel="Delete project"
          cancelLabel="Keep it"
          onConfirm={() => setConfirm(false)}
          onCancel={() => setConfirm(false)}
        />
      </Specimen>

      <Specimen title="Empty state">
        <EmptyState title="No projects yet" actions={<Button variant="primary">New video</Button>}>
          A project appears here when you start a run from Play.
        </EmptyState>
      </Specimen>

      <Specimen title="Reading view" meta="contents, search, copy section or all as Markdown">
        <ReadingView markdown={article} label="Article" />
      </Specimen>
    </div>
  );
}
