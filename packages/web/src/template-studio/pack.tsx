import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { templatesKey } from "@/templates/api";
import { downloadPack, type ImportedPackView, importTemplatePack, packSamplesQuery } from "./api";

// Template packs: Export pack in a template's studio, Import template pack on Library →
// Templates, and the samples a pack came with in the studio it opens.

function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Why Export pack can't be pressed, or undefined when it can.
export function exportBlocker(view: StudioView): string | undefined {
  return view.runnableVersion === null
    ? "Mark a version ready first: a pack carries the version you checked"
    : undefined;
}

export function ExportPack({
  view,
  onProblem,
}: {
  readonly view: StudioView;
  readonly onProblem: (message: string | undefined) => void;
}): ReactElement {
  const { api } = useApp();
  const [busy, setBusy] = useState(false);
  const blocker = exportBlocker(view);
  async function save(): Promise<void> {
    setBusy(true);
    onProblem(undefined);
    try {
      const reply = await downloadPack(api, view.template.id);
      if (reply.ok) saveBlob(reply.filename, reply.blob);
      else onProblem(reply.message);
    } catch (error) {
      onProblem(
        `The pack wasn't made: ${error instanceof Error ? error.message : String(error)} Press Export pack again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1" {...helpScope}>
      <Button
        size="small"
        variant="quiet"
        disabled={blocker !== undefined || busy}
        disabledReason={blocker ?? "Making the pack"}
        focusableWhenDisabled
        onClick={() => void save()}
      >
        {view.runnableVersion === null || view.runnableVersion === view.template.version
          ? "Export pack"
          : `Export pack (version ${String(view.runnableVersion)})`}
      </Button>
      <InfoTip id="template-studio.export-pack" label="Export pack" />
    </span>
  );
}

// What the import says it did, in one sentence for the toast.
export function importedSentence(value: ImportedPackView): string {
  const renamed =
    value.renamed.length === 0
      ? ""
      : ` ${value.renamed.map((one) => `"${one.from}" came in as "${one.to}"`).join(", ")}, because your Library has other text under ${value.renamed.length === 1 ? "that name" : "those names"}.`;
  const voice = value.voiceKnown
    ? ""
    : " Its voice isn't in your Settings → Voices: the studio's Voice check says what to do.";
  return `Imported ${value.name}. No schedule runs it until you look over its samples and press Mark ready.${renamed}${voice}`;
}

// Library → Templates → Import template pack: choose the .zip, and the new template's studio
// opens.
export function ImportPack(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function send(file: File): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await importTemplatePack(api, file);
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
        `The pack wasn't imported: ${error instanceof Error ? error.message : String(error)} Choose the file again.`,
      );
    } finally {
      setBusy(false);
      if (input.current !== null) input.current.value = "";
    }
  }
  return (
    <span className="flex items-center gap-1">
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void send(file);
        }}
      />
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Importing…" : "Import template pack"}
      </Button>
      <InfoTip id="templates.import-pack" label="Import template pack" />
      {problem === null ? null : (
        <span role="alert" className="text-small text-danger">
          {problem}
        </span>
      )}
    </span>
  );
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
    <section aria-label="Samples from the pack" className="flex flex-col gap-3">
      <SectionHead
        title="Samples from the pack"
        as="h3"
        size="small"
        info="template-studio.pack-samples"
        meta="Made by whoever exported it. Your own samples replace these once you press Save."
      />
      {pictures.length === 0 ? null : (
        <MediaGrid density="compact" list label="Pictures from the pack">
          {pictures.map((sample) => (
            <li key={sample.url}>
              <MediaFrame
                src={url(sample.url)}
                alt={
                  sample.role === "thumbnail"
                    ? "The pack's thumbnail"
                    : `A picture from the pack: ${sample.name}`
                }
                title={sample.role === "thumbnail" ? "Thumbnail" : "Picture"}
              />
            </li>
          ))}
        </MediaGrid>
      )}
      {narration === undefined ? null : (
        <AudioPlayer src={url(narration.url)} label="The pack's narration" compact />
      )}
    </section>
  );
}
