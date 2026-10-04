import { documentThemeNameProblems } from "@app/slices/document/model.js";
import type { DocumentTheme } from "@app/slices/document/theme.js";
import { documentThemeSchema } from "@app/slices/document/theme-schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { FieldError } from "@/api";
import { previewDocumentTheme, removeDocumentTheme, saveDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { EditorActions } from "@/components/editor-actions";
import { EditorSkeleton } from "@/components/editor-states";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, Input } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, FileLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { PdfPages } from "@/components/pdf-pages";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import { fieldKey, themeGroups } from "@/lib/document-theme-fields";
import { EditorCrumb, EditorProblem, editorAside, editorSurface } from "@/library/editor-frame";
import { documentThemesQuery } from "@/queries";
import { GroupJumps, GroupMarks, groupId } from "./document-theme-groups";
import { problemFor, Setting, settingChanged } from "./document-theme-setting";

interface Draft {
  readonly name: string;
  readonly values: DocumentTheme;
}

// One document theme: its name and every setting of the PDF, grouped, beside a live preview
// of a sample article laid out with the values as they are typed. The preview is the
// server's own renderer, so it is exactly the PDF a project would get.
export function DocumentThemeEditorRoute({
  themeId,
  from,
  onLeave,
}: {
  // Undefined for a new theme.
  readonly themeId: string | undefined;
  // What a new theme starts from: a built-in's name or a saved theme's id.
  readonly from: string | undefined;
  readonly onLeave: () => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const listing = useQuery(documentThemesQuery(api));
  const hintId = useId();

  const [edited, setEdited] = useState<Draft | undefined>(undefined);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const data = listing.data;
  const found =
    themeId === undefined ? undefined : data?.themes.find((theme) => theme.id === themeId);
  const source =
    themeId !== undefined
      ? found
      : (data?.themes.find((theme) => theme.id === from) ??
        data?.builtIns.find((theme) => theme.name === (from ?? "plain")) ??
        data?.builtIns[0]);
  const base: Draft | undefined =
    source === undefined
      ? undefined
      : {
          name:
            themeId !== undefined
              ? source.name
              : `${"label" in source ? source.label : source.name} copy`,
          values: source.values,
        };
  const draft = edited ?? base;

  const save = useMutation({
    mutationFn: (next: Draft) => saveDocumentTheme(api, next, themeId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: documentThemesQuery(api).queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeDocumentTheme(api, id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: documentThemesQuery(api).queryKey });
      onLeave();
    },
  });
  useLeaveWhenSaved(saved, onLeave);

  // The same checks the server runs, so a value out of range is marked as it is typed and
  // the preview waits for a theme that can be drawn.
  const checked = useMemo(
    () => (draft === undefined ? undefined : documentThemeSchema.safeParse(draft.values)),
    [draft],
  );
  const problems: readonly FieldError[] = [
    ...(draft === undefined || draft.name.trim() === ""
      ? []
      : documentThemeNameProblems(draft.name)),
    ...(checked === undefined || checked.success
      ? []
      : checked.error.issues.map((issue) => ({
          field: `values.${issue.path.join(".")}`,
          message: issue.message,
        }))),
    ...refused,
  ];

  if (listing.error !== null) return <Notice>{listing.error.message}</Notice>;
  if (data === undefined) return <EditorSkeleton />;
  if (draft === undefined)
    return <Notice>That theme is gone. It may have been deleted in another tab.</Notice>;

  const edit = (next: Draft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };
  const groupStates = themeGroups.map((group) => ({
    title: group.title,
    problems: group.fields.filter((field) => problemFor(problems, field.path) !== undefined).length,
    changed:
      base === undefined
        ? 0
        : group.fields.filter((field) => settingChanged(draft.values, base.values, field.path))
            .length,
  }));
  const flagged = groupStates.filter((group) => group.problems > 0).map((group) => group.title);
  const blocked =
    draft.name.trim() === ""
      ? "Give the theme a name."
      : problems.length > 0
        ? flagged.length === 0
          ? "Fix the highlighted settings first."
          : `Fix the highlighted settings first, in ${flagged.join(", ")}.`
        : undefined;
  const named = problems.filter((problem) => problem.field === "name");

  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/document-themes">Documents</Link>
          </EditorCrumb>
        }
        title={themeId === undefined ? "New PDF theme" : "Edit PDF theme"}
        meta="How a project's PDF looks"
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className={`${editorSurface} flex min-w-0 flex-col gap-4`}>
          <Field
            label="Name"
            tip="library.theme.name"
            {...(named.length === 0
              ? {}
              : { error: named.map((problem) => problem.message).join(" ") })}
          >
            <Input
              value={draft.name}
              onChange={(event) => {
                edit({ ...draft, name: event.target.value }, "name");
              }}
            />
          </Field>

          <GroupJumps
            groups={groupStates}
            onJump={(title) => {
              const group = document.getElementById(groupId(title));
              if (group instanceof HTMLDetailsElement) {
                group.open = true;
                group.scrollIntoView?.({ block: "start", behavior: "smooth" });
                group.querySelector("summary")?.focus();
              }
            }}
          />

          {themeGroups.map((group, index) => {
            const state = groupStates[index];
            return (
              <details
                key={group.title}
                id={groupId(group.title)}
                open={index < 2 || (state?.problems ?? 0) > 0}
                className="group border-t border-line"
              >
                {/* biome-ignore lint/a11y/noStaticElementInteractions: a summary is the native toggle (keyboard included); this only follows its click. */}
                <summary
                  className="flex cursor-pointer list-none items-center gap-2 py-3 text-title-3 font-semibold"
                  // A group opened near the bottom scrolls up out from under the Save bar.
                  onClick={(event) => {
                    const group = event.currentTarget.parentElement;
                    requestAnimationFrame(() => {
                      if (group instanceof HTMLDetailsElement && group.open)
                        group.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
                    });
                  }}
                >
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-[14px] text-ink-2 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  />
                  {group.title}
                  <GroupMarks problems={state?.problems ?? 0} changed={state?.changed ?? 0} />
                </summary>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-4 pb-4 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <Setting
                      key={field.path.join(".")}
                      field={field}
                      theme={draft.values}
                      original={base?.values ?? draft.values}
                      problem={problemFor(problems, field.path)}
                      onChange={(values) => {
                        edit({ ...draft, values }, fieldKey(field.path));
                      }}
                    />
                  ))}
                </div>
              </details>
            );
          })}

          <EditorActions
            onDelete={
              themeId === undefined
                ? undefined
                : () => {
                    setDeleting(true);
                  }
            }
            blocked={blocked}
            blockedId={hintId}
            pending={save.isPending}
            saved={saved}
            cancel={
              <ButtonLink to="/document-themes" variant="secondary">
                Cancel
              </ButtonLink>
            }
            errors={[save.error, remove.error].flatMap((error) =>
              error === null ? [] : [error.message],
            )}
            onSave={() => {
              save.mutate(draft);
            }}
          />
        </div>

        <Preview values={checked?.success === true ? draft.values : undefined} />
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete "${draft.name}"?`}
        consequence="Projects that used it keep their own copy of its settings."
        confirmLabel="Delete theme"
        pending={remove.isPending}
        onConfirm={() => {
          if (themeId !== undefined) remove.mutate(themeId);
        }}
        onCancel={() => {
          setDeleting(false);
        }}
      />
    </div>
  );
}

// The sample article as a PDF, redrawn a moment after the typing stops. The last good pages
// stay up while new ones are made, and while a value is out of range.
function Preview({ values }: { readonly values: DocumentTheme | undefined }) {
  const { api } = useApp();
  const [pdf, setPdf] = useState<{ readonly bytes: Uint8Array; readonly url: string }>();
  const [state, setState] = useState<"idle" | "busy" | "failed">("busy");
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const key = values === undefined ? undefined : JSON.stringify(values);

  useEffect(() => {
    if (key === undefined) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("busy");
      previewDocumentTheme(api, JSON.parse(key) as DocumentTheme, controller.signal)
        .then(async (blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), blob }))
        .then(
          ({ bytes, blob }) => {
            if (controller.signal.aborted) return;
            setPdf({ bytes, url: URL.createObjectURL(blob) });
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            setFailure(error instanceof Error ? error.message : String(error));
            setState("failed");
          },
        );
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, key]);

  // The link to the full-size PDF is let go once a newer one replaces it.
  useEffect(
    () => () => {
      if (pdf !== undefined) URL.revokeObjectURL(pdf.url);
    },
    [pdf],
  );

  const drawn = useCallback((error: Error | undefined) => {
    if (error === undefined) {
      setState("idle");
      return;
    }
    setFailure(error.message);
    setState("failed");
  }, []);

  const status =
    values === undefined
      ? "Paused until the highlighted settings are fixed."
      : state === "busy"
        ? "Updating…"
        : state === "failed"
          ? `The preview couldn't be made: ${failure ?? "unknown error"}`
          : "A sample article with this theme. Your projects use their own text and thumbnail.";

  return (
    <div className={editorAside}>
      <SectionHead title="Preview" info="library.theme.preview" size="small" className="pb-0">
        {pdf === undefined ? null : (
          <FileLink
            href={pdf.url}
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            size="small"
          >
            <ExternalLinkIcon aria-hidden="true" strokeWidth={1.75} />
            Open full size
          </FileLink>
        )}
      </SectionHead>
      <div className="max-h-[calc(100vh-220px)] min-h-[320px] overflow-y-auto rounded-media bg-sunken p-3">
        <PdfPages
          data={pdf?.bytes}
          label="The sample article laid out with this theme"
          onDrawn={drawn}
        />
      </div>
      <p
        role="status"
        className={state === "failed" ? "m-0 text-small text-danger" : "m-0 text-small text-ink-2"}
      >
        {status}
      </p>
    </div>
  );
}

function Notice({ children }: { readonly children: string }) {
  return (
    <EditorProblem back={<Link to="/document-themes">Back to Documents</Link>}>
      {children}
    </EditorProblem>
  );
}
