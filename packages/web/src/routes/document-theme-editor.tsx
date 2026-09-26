import { documentThemeNameProblems } from "@app/slices/document/model.js";
import type { DocumentTheme } from "@app/slices/document/theme.js";
import { documentThemeSchema } from "@app/slices/document/theme-schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";
import type { FieldError } from "@/api";
import { previewDocumentTheme, removeDocumentTheme, saveDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { EditorActions } from "@/components/editor-actions";
import { backLink, EditorNotice, EditorSkeleton, sheet } from "@/components/editor-states";
import { PageBar } from "@/components/kit/page-bar";
import { PdfPages } from "@/components/pdf-pages";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import {
  type FieldPath,
  faceFamilies,
  faceStyles,
  fieldKey,
  rangeOf,
  type ThemeField,
  themeGroups,
  valueAt,
  withValue,
} from "@/lib/document-theme-fields";
import { documentThemesQuery } from "@/queries";

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
  const nameId = useId();
  const nameErrorId = useId();
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
  const blocked =
    draft.name.trim() === ""
      ? "Give the theme a name."
      : problems.length > 0
        ? "Fix the highlighted settings first."
        : undefined;
  const named = problems.filter((problem) => problem.field === "name");

  return (
    <div>
      <PageBar
        back={{ to: "/document-themes", label: "Documents" }}
        title={themeId === undefined ? "New document theme" : "Edit document theme"}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className={`${sheet} flex min-w-0 flex-col gap-[14px]`}>
          <div>
            <Label htmlFor={nameId} className="mb-[5px]">
              Name
            </Label>
            <Input
              id={nameId}
              value={draft.name}
              aria-invalid={named.length > 0}
              aria-describedby={named.length === 0 ? undefined : nameErrorId}
              onChange={(event) => {
                edit({ ...draft, name: event.target.value }, "name");
              }}
            />
            {named.length === 0 ? null : (
              <p id={nameErrorId} className="mt-1 text-label text-red">
                {named.map((problem) => problem.message).join(" ")}
              </p>
            )}
          </div>

          {themeGroups.map((group, index) => (
            <details
              key={group.title}
              open={index < 2 || group.fields.some((field) => problemFor(problems, field.path))}
              className="group rounded-control border border-line"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-[10px] font-semibold">
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-[14px] text-ink2 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                />
                {group.title}
              </summary>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-3 border-t border-line px-3 py-3 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <Setting
                    key={field.path.join(".")}
                    field={field}
                    theme={draft.values}
                    problem={problemFor(problems, field.path)}
                    onChange={(values) => {
                      edit({ ...draft, values }, fieldKey(field.path));
                    }}
                  />
                ))}
              </div>
            </details>
          ))}

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
              <Button asChild>
                <Link to="/document-themes">Cancel</Link>
              </Button>
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
        verb="Delete"
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

function problemFor(problems: readonly FieldError[], path: FieldPath): string | undefined {
  const key = fieldKey(path);
  const found = problems.filter(
    (problem) => problem.field === key || problem.field.startsWith(`${key}.`),
  );
  return found.length === 0 ? undefined : found.map((problem) => problem.message).join(" ");
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
    <div className={`${sheet} flex flex-col gap-3 lg:sticky lg:top-16`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Preview</h2>
        {pdf === undefined ? null : (
          <a
            href={pdf.url}
            target="_blank"
            rel="noreferrer"
            className="text-small text-run-text underline"
          >
            Open full size
          </a>
        )}
      </div>
      <div className="max-h-[calc(100vh-220px)] min-h-[320px] overflow-y-auto rounded-control border border-line bg-panel2 p-3">
        <PdfPages
          data={pdf?.bytes}
          label="The sample article laid out with this theme"
          onDrawn={drawn}
        />
      </div>
      <p
        role="status"
        className={state === "failed" ? "text-small text-red" : "text-small text-ink2"}
      >
        {status}
      </p>
    </div>
  );
}

function Setting({
  field,
  theme,
  problem,
  onChange,
}: {
  readonly field: ThemeField;
  readonly theme: DocumentTheme;
  readonly problem: string | undefined;
  readonly onChange: (values: DocumentTheme) => void;
}) {
  const id = useId();
  const value = valueAt(theme, field.path);
  const set = (next: unknown): void => {
    onChange(withValue(theme, field.path, next));
  };
  const described = [
    field.help === undefined ? "" : `${id}-help`,
    problem === undefined ? "" : `${id}-error`,
  ]
    .filter((one) => one !== "")
    .join(" ");
  const notes = (
    <>
      {field.help === undefined ? null : (
        <p id={`${id}-help`} className="text-label text-ink2">
          {field.help}
        </p>
      )}
      {problem === undefined ? null : (
        <p id={`${id}-error`} className="text-label text-red">
          {problem}
        </p>
      )}
    </>
  );
  const common = {
    id,
    "aria-invalid": problem !== undefined,
    "aria-describedby": described === "" ? undefined : described,
  };

  switch (field.kind) {
    case "toggle":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={id} className="flex min-h-8 items-center gap-3 text-small font-semibold">
            <input
              {...common}
              type="checkbox"
              checked={value === true}
              className="size-4 accent-accent"
              onChange={(event) => {
                set(event.currentTarget.checked);
              }}
            />
            {field.label}
          </label>
          {notes}
        </div>
      );
    case "number": {
      const { min, max } = rangeOf(field.path);
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <span className="flex items-center gap-2">
            <Input
              {...common}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={field.step}
              className="w-28"
              value={typeof value === "number" && Number.isFinite(value) ? value : ""}
              onChange={(event) => {
                set(event.target.value === "" ? Number.NaN : Number(event.target.value));
              }}
            />
            <span className="text-small text-ink2">{field.unit}</span>
          </span>
        </Labelled>
      );
    }
    case "color": {
      const hex = typeof value === "string" ? value : "";
      const full = /^#?[0-9a-f]{6}$/i.test(hex)
        ? `#${hex.replace("#", "")}`
        : /^#?[0-9a-f]{3}$/i.test(hex)
          ? `#${[...hex.replace("#", "")].map((digit) => digit + digit).join("")}`
          : "#000000";
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <span className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${field.label} colour`}
              value={full}
              className="h-8 w-10 cursor-pointer rounded-control border border-line2 bg-panel2 p-[2px]"
              onChange={(event) => {
                set(event.target.value);
              }}
            />
            <Input
              {...common}
              className="w-28 font-mono"
              value={hex}
              onChange={(event) => {
                set(event.target.value);
              }}
            />
          </span>
        </Labelled>
      );
    }
    case "text":
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <Input
            {...common}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => {
              set(event.target.value);
            }}
          />
        </Labelled>
      );
    case "optional-text":
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <Input
            {...common}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => {
              set(event.target.value === "" ? null : event.target.value);
            }}
          />
        </Labelled>
      );
    case "choice": {
      const index = field.options.findIndex((option) => option.value === value);
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <Picker
            {...common}
            value={String(index)}
            onChange={(event) => {
              const picked = field.options[Number(event.target.value)];
              if (picked !== undefined) set(picked.value);
            }}
          >
            {field.options.map((option, at) => (
              <option key={option.label} value={String(at)}>
                {option.label}
              </option>
            ))}
          </Picker>
        </Labelled>
      );
    }
    case "face": {
      const face = value as DocumentTheme["fonts"]["body"];
      const styles = faceStyles(face.family);
      return (
        <Labelled id={id} label={field.label} notes={notes}>
          <span className="flex flex-wrap items-center gap-2">
            <Picker
              {...common}
              aria-label={`${field.label} font`}
              value={face.family}
              onChange={(event) => {
                const family = faceFamilies.find((one) => one.value === event.target.value);
                if (family === undefined) return;
                const keep = faceStyles(family.value).some((one) => one.value === face.style);
                set({ ...face, family: family.value, style: keep ? face.style : "normal" });
              }}
            >
              {faceFamilies.map((family) => (
                <option key={family.value} value={family.value}>
                  {family.label}
                </option>
              ))}
            </Picker>
            <Picker
              aria-label={`${field.label} style`}
              value={face.style}
              onChange={(event) => {
                set({ ...face, style: event.target.value });
              }}
            >
              {styles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </Picker>
            <Input
              type="number"
              aria-label={`${field.label} letter spacing in millimetres`}
              title="Letter spacing (mm)"
              step={0.01}
              className="w-20"
              value={Number.isFinite(face.letterSpacing) ? face.letterSpacing : ""}
              onChange={(event) => {
                set({
                  ...face,
                  letterSpacing:
                    event.target.value === "" ? Number.NaN : Number(event.target.value),
                });
              }}
            />
          </span>
        </Labelled>
      );
    }
    case "lines":
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={id}>{field.label}</Label>
          <Textarea
            {...common}
            rows={8}
            value={Array.isArray(value) ? value.join("\n") : ""}
            onChange={(event) => {
              set(event.target.value.split("\n"));
            }}
          />
          {notes}
        </div>
      );
    case "link": {
      const link = value as DocumentTheme["endPage"]["link"];
      return (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={id} className="flex min-h-8 items-center gap-3 text-small font-semibold">
            <input
              id={id}
              type="checkbox"
              checked={link !== null}
              className="size-4 accent-accent"
              onChange={(event) => {
                set(event.currentTarget.checked ? { text: "Visit the website", url: null } : null);
              }}
            />
            {field.label}
          </label>
          {link === null ? null : (
            <span className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              <Input
                aria-label="Link text"
                placeholder="Link text"
                value={link.text}
                onChange={(event) => {
                  set({ ...link, text: event.target.value });
                }}
              />
              <Input
                aria-label="Link address"
                placeholder="https://"
                value={link.url ?? ""}
                onChange={(event) => {
                  set({ ...link, url: event.target.value === "" ? null : event.target.value });
                }}
              />
            </span>
          )}
          {notes}
        </div>
      );
    }
  }
}

function Labelled({
  id,
  label,
  notes,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly notes: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {notes}
    </div>
  );
}

function Notice({ children }: { readonly children: string }) {
  return (
    <EditorNotice
      back={
        <Link to="/document-themes" className={backLink}>
          Back to Documents
        </Link>
      }
    >
      {children}
    </EditorNotice>
  );
}
