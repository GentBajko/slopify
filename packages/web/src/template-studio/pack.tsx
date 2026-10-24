import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { templatesKey } from "@/templates/api";
import { downloadPack, type ImportedPackView, importTemplatePack, packSamplesQuery } from "./api";

// Templates as files to share: Export as a file (.zip) in Edit template, Import a template file
// (.zip) on Templates, and the samples a file came with, shown until the template makes its
// own.

function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Export as a file (.zip): the version its schedules run, as one file to share. Undefined
// `blocker` when it can be made now; the label names an older version when that is the one.
export function useExportFile(
  view: StudioView,
  onProblem: (message: string | undefined) => void,
): {
  readonly label: string;
  readonly blocker: string | undefined;
  readonly save: () => Promise<void>;
} {
  const { api } = useApp();
  const [busy, setBusy] = useState(false);
  const runs = view.runnableVersion;
  const label =
    runs === null || runs === view.template.version
      ? "Export as a file (.zip)"
      : `Export version ${String(runs)} as a file (.zip)`;
  const blocker = busy ? "making it" : runs === null ? "approve a version first" : undefined;
  async function save(): Promise<void> {
    setBusy(true);
    onProblem(undefined);
    try {
      const reply = await downloadPack(api, view.template.id);
      if (reply.ok) saveBlob(reply.filename, reply.blob);
      else onProblem(reply.message);
    } catch (error) {
      onProblem(
        `The file wasn't made: ${error instanceof Error ? error.message : String(error)} Choose Export as a file again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return { label, blocker, save };
}

// What the import says it did, in one sentence for the toast.
export function importedSentence(value: ImportedPackView): string {
  const renamed =
    value.renamed.length === 0
      ? ""
      : ` ${value.renamed.map((one) => `"${one.from}" came in as "${one.to}"`).join(", ")}, because Prompts already has other text under ${value.renamed.length === 1 ? "that name" : "those names"}.`;
  const voice = value.voiceKnown
    ? ""
    : " Its voice isn't in your Settings → Voices: its Narration check says what to do.";
  return `Imported ${value.name}. Look over its samples, then press Make a video.${renamed}${voice}`;
}

// Templates → More → Import a template file (.zip): choose the file, and the new template
// opens in Edit template. `input` is the hidden file picker to render once; `choose` opens it.
export function useImportFile(): {
  readonly choose: () => void;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly input: ReactElement;
} {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function send(picked: File): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await importTemplatePack(api, picked);
      if (!reply.ok) {
        setProblem(reply.message);
        return;
      }
      await client.invalidateQueries({ queryKey: templatesKey });
      notify(importedSentence(reply.value), "success");
      await navigate({
        to: "/templates/$templateId",
        params: { templateId: reply.value.templateId },
        search: {},
      });
    } catch (error) {
      setProblem(
        `The template wasn't imported: ${error instanceof Error ? error.message : String(error)} Choose the file again.`,
      );
    } finally {
      setBusy(false);
      if (file.current !== null) file.current.value = "";
    }
  }
  return {
    choose: () => file.current?.click(),
    busy,
    problem,
    input: (
      <input
        ref={file}
        type="file"
        accept=".zip,application/zip"
        aria-hidden="true"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked !== undefined) void send(picked);
        }}
      />
    ),
  };
}

// The samples the template's pack came with, until its own are made.
export function PackSamples({ templateId }: { readonly templateId: string }): ReactElement | null {
  const { api } = useApp();
  const query = useQuery(packSamplesQuery(api, templateId));
  const samples = query.data?.samples ?? [];
  if (samples.length === 0) return null;
  const url = (path: string) => `${api.origin}${path}`;
  const pictures = samples.filter((sample) => sample.role !== "narration");
  const narration = samples.find((sample) => sample.role === "narration");
  return (
    <section aria-label="Samples it came with" className="flex flex-col gap-3">
      <SectionHead
        title="Samples it came with"
        as="h3"
        size="small"
        meta="Made by whoever shared it. Your own samples replace these once you make them."
      />
      {pictures.length === 0 ? null : (
        <MediaGrid density="compact" list label="Images it came with">
          {pictures.map((sample) => (
            <li key={sample.url}>
              <MediaFrame
                src={url(sample.url)}
                alt={
                  sample.role === "thumbnail"
                    ? "The thumbnail it came with"
                    : `An image it came with: ${sample.name}`
                }
                title={sample.role === "thumbnail" ? "Thumbnail" : "Image"}
              />
            </li>
          ))}
        </MediaGrid>
      )}
      {narration === undefined ? null : (
        <AudioPlayer src={url(narration.url)} label="The narration it came with" compact />
      )}
    </section>
  );
}
