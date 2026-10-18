import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { keys } from "@/queries";
import { createDesign, createDesignTemplate, uploadPicture } from "./api";
import { blankDocument, blankTemplate } from "./document";

// The ways a design starts: from a picture of the person's own (Edit a picture), from an
// artwork the AI draws (Design a poster), or as a template to make again. Each opens the new
// design's page at once.

export interface DesignStarts {
  readonly pickPicture: () => void;
  readonly startPoster: () => void;
  readonly startTemplate: () => void;
  readonly busy: boolean;
  readonly problem: string | null;
  // The hidden file input the picture picker opens; render it once.
  readonly input: ReactElement;
}

const pictureName = (file: File): string =>
  file.name
    .replace(/\.[^.]+$/, "")
    .trim()
    .slice(0, 200) || "My picture";

export function useDesignStarts(options: { readonly projectId?: string } = {}): DesignStarts {
  const { api } = useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const open = async (designId: string) => {
    await client.invalidateQueries({ queryKey: keys.designs });
    await navigate({ to: "/designs/$designId", params: { designId } });
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const onFile = (picked: File) =>
    run(async () => {
      const uploaded = await uploadPicture(api, picked);
      if (!uploaded.ok) return setProblem(uploaded.message);
      const made = await createDesign(api, {
        id: crypto.randomUUID(),
        mutationId: crypto.randomUUID(),
        kind: "edit",
        name: pictureName(picked),
        fromStepSha: uploaded.value.sha256,
        ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
      });
      if (!made.ok) return setProblem(made.message);
      await open(made.value.id);
    });
  return {
    busy,
    problem,
    pickPicture: () => file.current?.click(),
    startPoster: () =>
      void run(async () => {
        const made = await createDesign(api, {
          id: crypto.randomUUID(),
          mutationId: crypto.randomUUID(),
          kind: "design",
          name: "New poster",
          document: blankDocument("generate"),
          ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
        });
        if (!made.ok) return setProblem(made.message);
        await open(made.value.id);
      }),
    startTemplate: () =>
      void run(async () => {
        const made = await createDesignTemplate(api, {
          id: crypto.randomUUID(),
          mutationId: crypto.randomUUID(),
          name: "New poster template",
          document: blankTemplate(),
        });
        if (!made.ok) return setProblem(made.message);
        await client.invalidateQueries({ queryKey: keys.designTemplates });
        await navigate({
          to: "/design-templates/$templateId",
          params: { templateId: made.value.id },
        });
      }),
    input: (
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Picture to edit"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked !== undefined) void onFile(picked);
        }}
      />
    ),
  };
}

// Create's one quiet line under the five kinds: a picture is not a project, so it opens a
// design instead.
export function StartFromPicture(): ReactElement {
  const starts = useDesignStarts();
  return (
    <p className="m-0 mt-2 flex flex-wrap items-center gap-x-1 text-small text-ink-2">
      <span>Or start from a picture:</span>
      <Button variant="quiet" size="small" disabled={starts.busy} onClick={starts.pickPicture}>
        Edit a picture
      </Button>
      <span aria-hidden="true">·</span>
      <Button variant="quiet" size="small" disabled={starts.busy} onClick={starts.startPoster}>
        Design a poster
      </Button>
      {starts.input}
      {starts.problem === null ? null : (
        <span role="alert" className="basis-full text-danger">
          {starts.problem}
        </span>
      )}
    </p>
  );
}
