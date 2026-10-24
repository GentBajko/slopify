import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Fold } from "@/components/kit/fold";
import { FileLink } from "@/components/kit/link";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import { ReadingView } from "@/components/kit/reading-view";
import { Switch } from "@/components/kit/switch";
import { readText } from "@/http";
import { readPostPacks, socialPacksKey } from "@/social/api";
import { PostPreview } from "@/social/post-preview";
import { about, changeFullScript, makeSample, quoteSample, templateStudioKey } from "./api";

type Output = StudioView["paid"]["outputs"][number];

// The sections whose sample a provider makes: what Make sample remakes.
export const paidSections: readonly TemplateSection[] = [
  "subject",
  "script",
  "voice",
  "pictures",
  "thumbnail",
  "shorts",
  "upload",
];

const audioRoles = ["audio_levelled", "audio_body", "audio_mp3", "audio_export"];

// What a section's paid sample made, in the sample project as it is now.
export function PaidBody({
  view,
  section,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement | null {
  const { api } = useApp();
  const at = (url: string) => `${api.origin}${url}`;
  const outputs = view.paid.outputs.filter((output) => output.section === section);
  const format = view.template.document.form.format;
  const aspect = format === "9:16" ? "portrait" : format === "1:1" ? "square" : "landscape";
  const of = (...roles: readonly string[]) => outputs.filter((one) => roles.includes(one.role));
  switch (section) {
    case "script":
      return view.paid.article === null ? null : <ScriptSample markdown={view.paid.article} />;
    case "voice": {
      const audio = audioRoles.map((role) => of(role)[0]).find((one) => one !== undefined);
      return audio === undefined ? null : (
        <AudioPlayer src={at(audio.url)} label={`${view.template.name}: sample narration`} />
      );
    }
    case "pictures": {
      const images = of("image", "reference");
      return images.length === 0 ? null : (
        <MediaGrid density="compact" label="Sample images">
          {images.map((image) => (
            <MediaFrame key={image.url} src={at(image.url)} alt={image.name} aspect={aspect} />
          ))}
        </MediaGrid>
      );
    }
    case "thumbnail": {
      const [thumbnail] = of("thumbnail");
      return thumbnail === undefined ? null : (
        // A phone's home feed shows a thumbnail about this wide, with the title under it.
        <div className="flex max-w-[320px] flex-col gap-2">
          <MediaFrame src={at(thumbnail.url)} alt="Sample thumbnail" aspect="landscape" />
          <p className="m-0 text-body font-semibold">{titleOf(view)}</p>
        </div>
      );
    }
    case "video": {
      const [video] = of("video");
      return video === undefined ? null : (
        <Player
          src={at(video.url)}
          label={`${view.template.name}: sample video`}
          portrait={format === "9:16"}
          square={format === "1:1"}
        />
      );
    }
    case "shorts": {
      const [short] = of("short_video");
      return short === undefined ? null : (
        <div className="max-w-[240px]">
          <Player src={at(short.url)} label={`${view.template.name}: sample short`} portrait />
        </div>
      );
    }
    case "upload":
      return <UploadSample outputs={outputs} projectId={view.paid.projectId} />;
    case "document": {
      // The free sample lays out Slopify's own article; this one is the sample's script.
      const [pdf] = of("document_pdf");
      return pdf === undefined ? null : (
        <FileLink
          href={at(pdf.url)}
          target="_blank"
          rel="noreferrer"
          size="small"
          className="self-start"
        >
          Open the PDF of the sample's article
        </FileLink>
      );
    }
    default:
      return null;
  }
}

// The first lines of the script, plain, for the narrow sample column.
export function excerptOf(markdown: string, limit = 480): string {
  const plain = markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/^#+\s*/u, "")
        .replace(/[*_`>]/gu, "")
        .trim(),
    )
    .filter((line) => line !== "")
    .join(" ");
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 40))}…`;
}

// A script is long text: the narrow column shows its opening, and the whole of it reads in a
// wide drawer at a comfortable measure.
function ScriptSample({ markdown }: { readonly markdown: string }): ReactElement {
  const [reading, setReading] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-small text-ink-2">{excerptOf(markdown)}</p>
      <Button size="small" className="self-start" onClick={() => setReading(true)}>
        Read the whole article
      </Button>
      <Drawer open={reading} title="Sample article" onClose={() => setReading(false)}>
        <ReadingView markdown={markdown} label="Sample article" copyAll={false} />
      </Drawer>
    </div>
  );
}

// The sample's title as its runs fill it: the title's keywords, the topic in each empty one.
function titleOf(view: StudioView): string {
  const { form } = view.template.document;
  return form.title.replace(/\{\{([^{}\n]*)\}\}/g, (_whole, inside: string) => {
    const value = form.values[inside.trim()];
    return value === undefined || value === "" ? view.sample.topic : value;
  });
}

function UploadSample({
  outputs,
  projectId,
}: {
  readonly outputs: readonly Output[];
  // The sample project, whose posts for other sites are shown as each site shows them.
  readonly projectId: string | null;
}): ReactElement | null {
  const { api } = useApp();
  const description = outputs.find((one) => one.role === "youtube_description");
  const text = useQuery({
    queryKey: ["template-studio", "upload", description?.url ?? ""],
    queryFn: async () =>
      description === undefined ? "" : readText(await api.fetch(`${api.origin}${description.url}`)),
    enabled: description !== undefined,
  });
  const posts = useQuery({
    queryKey: socialPacksKey(projectId ?? ""),
    queryFn: () => readPostPacks(api, projectId ?? ""),
    enabled: projectId !== null,
    retry: false,
  });
  const packs = posts.data?.packs ?? [];
  const files = outputs.filter((one) => one.role !== "social_post");
  if (files.length === 0 && packs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {text.data === undefined || text.data === "" ? null : (
        <p className="m-0 whitespace-pre-wrap rounded-media border border-line p-3 text-small">
          {text.data}
        </p>
      )}
      {files.length === 0 ? null : (
        <div className="flex flex-wrap gap-3">
          {files.map((one) => (
            <FileLink
              key={one.url}
              href={`${api.origin}${one.url}`}
              target="_blank"
              rel="noreferrer"
              size="small"
            >
              {one.name}
            </FileLink>
          ))}
        </div>
      )}
      {packs.map((pack) => (
        <PostPreview key={pack.platform} pack={pack} />
      ))}
    </div>
  );
}

// Make sample: the current version's paid sample, at the price on the button. A waiting one
// says its price; any other is priced as a whole new sample, which is the most it can cost. A
// setup no sample can be made of says why instead, and never shows a price.
export function MakeSampleButton({
  view,
  onDone,
}: {
  readonly view: StudioView;
  readonly onDone: (problem: string | null) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const known = view.paid.quotedHigh;
  const whole = useQuery({
    queryKey: [...templateStudioKey(view.template.id), "quote", "whole", view.sample.topic],
    queryFn: () => quoteSample(api, view.template.id, { topic: view.sample.topic }),
    enabled: known === null,
  });
  const high = known ?? whole.data?.high;
  const unknown = known === null ? (whole.data?.unknown ?? 0) > 0 : view.paid.state === "held";
  const refused = known === null ? (whole.data?.problem ?? null) : null;
  async function make(): Promise<void> {
    if (high === undefined) return;
    setAsking(true);
    try {
      const reply = await makeSample(api, view.template.id, {
        version: view.template.version,
        acknowledgedHigh: high,
        acknowledgedUnknown: unknown,
      });
      onDone(reply.ok ? null : reply.message);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      onDone(
        `The sample wasn't asked for: ${error instanceof Error ? error.message : String(error)} Press Make sample again.`,
      );
    } finally {
      setAsking(false);
    }
  }
  if (refused !== null) return <p className="m-0 text-small text-danger">{refused}</p>;
  return (
    <Button
      size="small"
      disabled={asking || high === undefined}
      disabledReason={asking ? "Asking for the sample" : "Pricing the sample"}
      onClick={() => void make()}
    >
      {high === undefined
        ? "Make sample · pricing…"
        : `Make sample · ${known === null && whole.data?.onPlan === true ? "plan usage" : high === 0 ? "free" : about(high)}`}
    </Button>
  );
}

// Article: the whole article, or the outline and first chapter the sample writes by default.
export function FullScriptSwitch({
  view,
  onDone,
}: {
  readonly view: StudioView;
  readonly onDone: (problem: string | null) => void;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const next = !view.sample.fullScript;
  const price = useQuery({
    queryKey: [...templateStudioKey(view.template.id), "quote", "full-script", next],
    queryFn: () => quoteSample(api, view.template.id, { fullScript: next }),
  });
  const [asking, setAsking] = useState(false);
  async function change(): Promise<void> {
    if (price.data === undefined) return;
    setAsking(true);
    try {
      const reply = await changeFullScript(api, view.template.id, {
        fullScript: next,
        acknowledgedHigh: price.data.high,
        acknowledgedUnknown: price.data.unknown > 0,
      });
      onDone(reply.ok ? null : reply.message);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } finally {
      setAsking(false);
    }
  }
  // While no sample can be made of the setup (the panel's fix link says why), the choice has
  // nothing to change and no true price.
  if (price.data !== undefined && price.data.problem !== null) return null;
  return (
    <Switch
      checked={view.sample.fullScript}
      disabled={asking || price.data === undefined}
      onChange={() => void change()}
      className="text-left"
      label={`Write the whole article in the sample${price.data === undefined ? "" : ` (${price.data.onPlan ? "plan usage" : price.data.high === 0 ? "free" : about(price.data.high)})`}`}
      help="Off, the sample writes the outline and the first chapter. Your videos always get the whole article."
    />
  );
}

const versionWord: Readonly<Record<StudioView["paid"]["versions"][number]["state"], string>> = {
  queued: "Queued",
  making: "Being made",
  done: "Made",
  failed: "Failed",
  skipped: "No sample made",
  held: "Waiting",
};

// Each version's sample, newest first: what was made, skipped, waited or failed.
export function EarlierSamples({ view }: { readonly view: StudioView }): ReactElement | null {
  const earlier = view.paid.versions.filter((one) => one.version !== view.template.version);
  if (earlier.length === 0) return null;
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Fold summary="Earlier samples" state={String(earlier.length)}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 pb-3 text-small">
        {earlier.map((one) => (
          <li key={one.version} className="flex justify-between gap-3">
            <span>{`Version ${String(one.version)} · ${versionWord[one.state]}`}</span>
            <span className="text-ink-2">{when.format(new Date(one.updatedAt))}</span>
          </li>
        ))}
      </ul>
    </Fold>
  );
}
