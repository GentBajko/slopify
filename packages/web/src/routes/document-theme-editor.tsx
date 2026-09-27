import { documentThemeNameProblems } from "@app/slices/document/model.js";
import type { DocumentTheme } from "@app/slices/document/theme.js";
import { documentThemeSchema } from "@app/slices/document/theme-schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";
import type { FieldError } from "@/api";
import { previewDocumentTheme, removeDocumentTheme, saveDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { EditorActions } from "@/components/editor-actions";
import { EditorSkeleton } from "@/components/editor-states";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, FileLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { PdfPages } from "@/components/pdf-pages";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import type { HelpId } from "@/help/catalog";
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
import { EditorCrumb, EditorProblem, editorAside, editorSurface } from "@/library/editor-frame";
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
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/document-themes">Documents</Link>
          </EditorCrumb>
        }
        title={themeId === undefined ? "New document theme" : "Edit document theme"}
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

          {themeGroups.map((group, index) => (
            <details
              key={group.title}
              open={index < 2 || group.fields.some((field) => problemFor(problems, field.path))}
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
              </summary>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-4 pb-4 sm:grid-cols-2">
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

// Each setting's info button, by the key a refused save names it with. A setting missing here
// shows none, which the Library walk test (help/walk/library.test.tsx) catches.
const settingTips: Readonly<Record<string, HelpId>> = {
  "values.page.format": "library.theme.page.format",
  "values.page.margin": "library.theme.page.margin",
  "values.page.contentTop": "library.theme.page.content-top",
  "values.background.image": "library.theme.background.image",
  "values.background.color": "library.theme.background.color",
  "values.colors.heading": "library.theme.colors.heading",
  "values.colors.text": "library.theme.colors.text",
  "values.colors.muted": "library.theme.colors.muted",
  "values.colors.faint": "library.theme.colors.faint",
  "values.fonts.body": "library.theme.fonts.body",
  "values.fonts.strong": "library.theme.fonts.strong",
  "values.fonts.emphasis": "library.theme.fonts.emphasis",
  "values.fonts.heading": "library.theme.fonts.heading",
  "values.fonts.dramatic": "library.theme.fonts.dramatic",
  "values.fonts.decorative": "library.theme.fonts.decorative",
  "values.fonts.dropCap": "library.theme.fonts.drop-cap",
  "values.fonts.footer": "library.theme.fonts.footer",
  "values.sizes.title": "library.theme.sizes.title",
  "values.sizes.brand": "library.theme.sizes.brand",
  "values.sizes.section": "library.theme.sizes.section",
  "values.sizes.heading": "library.theme.sizes.heading",
  "values.sizes.subheading": "library.theme.sizes.subheading",
  "values.sizes.body": "library.theme.sizes.body",
  "values.sizes.meta": "library.theme.sizes.meta",
  "values.sizes.footer": "library.theme.sizes.footer",
  "values.spacing.bodyLine": "library.theme.spacing.body-line",
  "values.spacing.headingLine": "library.theme.spacing.heading-line",
  "values.spacing.subheadingLine": "library.theme.spacing.subheading-line",
  "values.spacing.paragraphGap": "library.theme.spacing.paragraph-gap",
  "values.spacing.headingGap": "library.theme.spacing.heading-gap",
  "values.spacing.itemGap": "library.theme.spacing.item-gap",
  "values.spacing.listIndent": "library.theme.spacing.list-indent",
  "values.spacing.quoteIndent": "library.theme.spacing.quote-indent",
  "values.spacing.ruleWidth": "library.theme.spacing.rule-width",
  "values.dropCap.enabled": "library.theme.drop-cap.enabled",
  "values.dropCap.lines": "library.theme.drop-cap.lines",
  "values.dropCap.scale": "library.theme.drop-cap.scale",
  "values.dropCap.gap": "library.theme.drop-cap.gap",
  "values.dropCap.minLength": "library.theme.drop-cap.min-length",
  "values.dropCap.minRoom": "library.theme.drop-cap.min-room",
  "values.titlePage.brandY": "library.theme.title-page.brand-y",
  "values.titlePage.taglineOffset": "library.theme.title-page.tagline-offset",
  "values.titlePage.titleY": "library.theme.title-page.title-y",
  "values.titlePage.titleLine": "library.theme.title-page.title-line",
  "values.titlePage.metaOffset": "library.theme.title-page.meta-offset",
  "values.titlePage.metaLine": "library.theme.title-page.meta-line",
  "values.titlePage.showDate": "library.theme.title-page.show-date",
  "values.titlePage.showWordCount": "library.theme.title-page.show-word-count",
  "values.titlePage.cover.enabled": "library.theme.title-page.cover",
  "values.titlePage.cover.gap": "library.theme.title-page.cover-gap",
  "values.titlePage.cover.maxHeight": "library.theme.title-page.cover-height",
  "values.brand.name": "library.theme.brand.name",
  "values.brand.tagline": "library.theme.brand.tagline",
  "values.brand.url": "library.theme.brand.url",
  "values.brand.linkLabel": "library.theme.brand.link-label",
  "values.contents.enabled": "library.theme.contents.enabled",
  "values.contents.title": "library.theme.contents.title",
  "values.contents.depth": "library.theme.contents.depth",
  "values.contents.titleOffset": "library.theme.contents.title-offset",
  "values.contents.firstEntryOffset": "library.theme.contents.first-entry-offset",
  "values.contents.line": "library.theme.contents.line",
  "values.contents.indent": "library.theme.contents.indent",
  "values.header.enabled": "library.theme.header.enabled",
  "values.header.top": "library.theme.header.top",
  "values.header.maxTitleCharacters": "library.theme.header.max-title",
  "values.footer.enabled": "library.theme.footer.enabled",
  "values.footer.text": "library.theme.footer.text",
  "values.footer.bottom": "library.theme.footer.bottom",
  "values.footer.reserve": "library.theme.footer.reserve",
  "values.sources.enabled": "library.theme.sources.enabled",
  "values.sources.title": "library.theme.sources.title",
  "values.sources.titleOffset": "library.theme.sources.title-offset",
  "values.sources.bodyOffset": "library.theme.sources.body-offset",
  "values.sources.line": "library.theme.sources.line",
  "values.sources.gap": "library.theme.sources.gap",
  "values.endPage.enabled": "library.theme.end-page.enabled",
  "values.endPage.title": "library.theme.end-page.title",
  "values.endPage.lines": "library.theme.end-page.lines",
  "values.endPage.showDocumentDetails": "library.theme.end-page.details",
  "values.endPage.link": "library.theme.end-page.link",
  "values.endPage.closing": "library.theme.end-page.closing",
  "values.endPage.titleOffset": "library.theme.end-page.title-offset",
  "values.endPage.bodyOffset": "library.theme.end-page.body-offset",
  "values.metadata.author": "library.theme.metadata.author",
  "values.metadata.subject": "library.theme.metadata.subject",
  "values.metadata.keywords": "library.theme.metadata.keywords",
  "values.metadata.creator": "library.theme.metadata.creator",
};

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
  const tip = settingTips[fieldKey(field.path)];
  const info =
    tip === undefined ? null : <InfoTip id={tip} label={field.label} className="-my-1" />;
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
        <p id={`${id}-help`} className="sl-field__help m-0">
          {field.help}
        </p>
      )}
      {problem === undefined ? null : (
        <p id={`${id}-error`} className="sl-field__error m-0">
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
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
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
            {info}
          </span>
          {notes}
        </div>
      );
    case "number": {
      const { min, max } = rangeOf(field.path);
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
            <span className="text-small text-ink-2">{field.unit}</span>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
          <span className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${field.label} colour`}
              value={full}
              className="h-8 w-10 cursor-pointer rounded-control border border-line-strong bg-transparent p-0.5"
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
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
        <Labelled id={id} label={field.label} notes={notes} info={info}>
          <Select
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
          </Select>
        </Labelled>
      );
    }
    case "face": {
      const face = value as DocumentTheme["fonts"]["body"];
      const styles = faceStyles(face.family);
      return (
        <Labelled id={id} label={field.label} notes={notes} info={info}>
          <span className="flex flex-wrap items-center gap-2">
            <Select
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
            </Select>
            <Select
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
            </Select>
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
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
          <span className="flex items-center gap-1">
            <label htmlFor={id} className="sl-field__label">
              {field.label}
            </label>
            {info}
          </span>
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
        <div className="flex flex-col gap-1 sm:col-span-2" {...helpScope}>
          <span className="flex items-center gap-1">
            <label
              htmlFor={id}
              className="flex min-h-8 items-center gap-3 text-small font-semibold"
            >
              <input
                id={id}
                type="checkbox"
                checked={link !== null}
                className="size-4 accent-accent"
                onChange={(event) => {
                  set(
                    event.currentTarget.checked ? { text: "Visit the website", url: null } : null,
                  );
                }}
              />
              {field.label}
            </label>
            {info}
          </span>
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
  info,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly notes: ReactNode;
  readonly info: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
      <span className="flex items-center gap-1">
        <label htmlFor={id} className="sl-field__label">
          {label}
        </label>
        {info}
      </span>
      {children}
      {notes}
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
