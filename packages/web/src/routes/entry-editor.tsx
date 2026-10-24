import type { EntryCategory, EntryDraft } from "@app/slices/library/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import type { FieldError } from "@/api";
import { removeEntry, saveEntry } from "@/api";
import { useApp } from "@/app-context";
import { DetectedSlots } from "@/components/detected-slots";
import { EditorActions } from "@/components/editor-actions";
import { EditorSkeleton } from "@/components/editor-states";
import { KeywordInsertBar } from "@/components/keyword-insert-bar";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { LabelledSwitch } from "@/components/labelled-switch";
import { useLeaveWhenSaved } from "@/components/saved-tick";
import { SlotBody } from "@/components/slot-body";
import {
  bodyProblems,
  draftProblems,
  draftWarnings,
  firstProblem,
  nameProblems,
  slotNames,
} from "@/lib/draft-lint";
import {
  bodyLabel,
  bodyPlaceholder,
  categoryAbout,
  categoryLabel,
  categoryOptions,
  modeHint,
  modeOptions,
  noSlotsHint,
} from "@/lib/entry-options";
import {
  EditorCrumb,
  EditorProblem,
  editorAside,
  editorChoice,
  editorSurface,
} from "@/library/editor-frame";
import { entriesQuery } from "@/queries";

// One intro or outro: a name, whether it is spoken before or after the video, whether the
// narrator says these exact words or the AI writes them from instructions, and the text, whose
// `{{keywords}}` are listed beside it as they are typed. Every rule the Save obeys is the shared
// lint of `@/lib/draft-lint`, which is the server's own `lintEntry`, so the editor refuses
// exactly what the server would and says the same sentence about it; a missing name or text is
// said once the name was left empty or Save was pressed, not on arrival.
export function EntryEditorRoute({
  entryId,
  category,
  from,
  onLeave,
}: {
  readonly entryId: string | undefined;
  readonly category: EntryCategory;
  // The entry this one is a copy of, when Duplicate opened the editor.
  readonly from: string | undefined;
  readonly onLeave: (category: EntryCategory) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const entries = useQuery(entriesQuery(api));
  const bodyId = useId();
  const nameBox = useRef<HTMLInputElement>(null);
  const lintId = useId();
  const hintId = useId();

  const [edited, setEdited] = useState<EntryDraft | undefined>(undefined);
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameLeft, setNameLeft] = useState(false);
  const [tried, setTried] = useState(false);

  const rows = entries.data?.entries;
  const wanted = entryId ?? from;
  const found = wanted === undefined ? undefined : rows?.find((entry) => entry.id === wanted);
  const base: EntryDraft =
    found === undefined
      ? { category, mode: "text", name: "", body: "" }
      : {
          category: found.category,
          mode: found.mode,
          name: entryId === undefined ? `${found.name} copy` : found.name,
          body: found.body,
        };
  const draft = edited ?? base;

  const save = useMutation({
    mutationFn: (next: EntryDraft) => saveEntry(api, next, entryId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefused(result.fields);
        return;
      }
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: entriesQuery(api).queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeEntry(api, id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: entriesQuery(api).queryKey });
      onLeave(draft.category);
    },
  });

  useLeaveWhenSaved(saved, () => {
    onLeave(draft.category);
  });

  // A refusal names its field and stands until that field is edited, which is how a
  // collision keeps Save held while the taken name is still on the form.
  const edit = (next: EntryDraft, field: string): void => {
    setEdited(next);
    setRefused((current) => current.filter((problem) => problem.field !== field));
  };

  // The stored entry's own keyword names, which its save lets through, as the server does.
  const grandfathered = entryId !== undefined && found !== undefined ? found.slots : [];
  const problems = draftProblems(draft, refused, grandfathered);
  const nameEmpty = draft.name.trim() === "";
  const bodyEmpty = draft.body.trim() === "";
  // What is said now: an empty name once it was left empty, an empty text once Save was
  // pressed, and every other problem as soon as it is typed.
  const said = problems.filter(
    (problem) =>
      tried ||
      !(
        (problem.field === "name" && nameEmpty && !nameLeft) ||
        (problem.field === "body" && bodyEmpty)
      ),
  );
  const blocked = firstProblem(said);
  const slots = slotNames(draft.body);
  // An untouched text is not an error in the box: its "Enter the text." is the sentence beside
  // Save, not a red mark on a field nobody has typed in yet.
  const lint = bodyEmpty ? [] : bodyProblems(problems);
  const named = nameProblems(said);
  const warnings = bodyEmpty ? [] : draftWarnings(draft);

  if (entries.error !== null) {
    return <Notice category={draft.category}>{entries.error.message}</Notice>;
  }
  if (wanted !== undefined && rows === undefined) {
    return <EditorSkeleton />;
  }
  if (wanted !== undefined && found === undefined) {
    return (
      <Notice category={category}>
        {`That ${category} is gone. It may have been deleted in another tab.`}
      </Notice>
    );
  }

  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/prompts" search={{ kind: "article" }}>
              Prompts
            </Link>
            <Link to="/entries" search={{ category: draft.category }}>
              {`${categoryLabel(draft.category)}s`}
            </Link>
          </EditorCrumb>
        }
        title={`${entryId === undefined ? "New" : "Edit"} ${draft.category}`}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`${editorSurface} flex min-w-0 flex-col gap-4`}>
          <div className="flex max-w-[80ch] flex-wrap items-start gap-4">
            <div className="min-w-[200px] flex-1">
              <Field
                label="Name"
                {...(named.length === 0
                  ? {}
                  : { error: named.map((problem) => problem.message).join(" ") })}
              >
                <Input
                  ref={nameBox}
                  value={draft.name}
                  placeholder={draft.category === "intro" ? "Channel welcome" : "Sign-off"}
                  onChange={(event) => {
                    edit({ ...draft, name: event.target.value }, "name");
                  }}
                  onBlur={() => {
                    if (nameEmpty) setNameLeft(true);
                  }}
                />
              </Field>
            </div>
            {/* The category may change after creation, and a name is only taken
                within its own category, so a collision under the old one is moot. */}
            <div className={editorChoice}>
              <LabelledSwitch
                label="Intro or outro"
                value={draft.category}
                options={categoryOptions}
                onPick={(next) => {
                  edit({ ...draft, category: next }, "name");
                }}
              />
            </div>
          </div>
          <div className={editorChoice}>
            <LabelledSwitch
              label="What the narrator reads"
              value={draft.mode}
              options={modeOptions}
              help={modeHint(draft.mode, draft.category)}
              onPick={(next) => {
                edit({ ...draft, mode: next }, "mode");
              }}
            />
          </div>

          <div className="flex flex-col gap-1" {...helpScope}>
            <label htmlFor={bodyId} className="sl-field__label">
              {bodyLabel(draft.mode)}
            </label>
            <HelpLine className="mb-1">{categoryAbout(draft.category)}</HelpLine>
            <KeywordInsertBar
              place={draft.category}
              targetId={bodyId}
              value={draft.body}
              onChange={(next) => {
                edit({ ...draft, body: next }, "body");
              }}
            />
            <SlotBody
              id={bodyId}
              value={draft.body}
              place={draft.category}
              grandfathered={grandfathered}
              placeholder={bodyPlaceholder(draft.mode, draft.category)}
              invalid={lint.length > 0}
              describedBy={lint.length === 0 ? undefined : lintId}
              onChange={(next) => {
                edit({ ...draft, body: next }, "body");
              }}
            />
          </div>

          <EditorActions
            onDelete={
              entryId === undefined
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
              <ButtonLink to="/entries" search={{ category: draft.category }} variant="secondary">
                Cancel
              </ButtonLink>
            }
            errors={[save.error, remove.error].flatMap((error) =>
              error === null ? [] : [error.message],
            )}
            onSave={() => {
              if (problems.length > 0) {
                setTried(true);
                if (nameProblems(problems).length > 0) nameBox.current?.focus();
                return;
              }
              save.mutate(draft);
            }}
          />
        </div>

        <div className={editorAside}>
          <DetectedSlots
            slots={slots}
            body={draft.body}
            lint={lint}
            lintId={lintId}
            noSlots={noSlotsHint(draft.mode)}
            warnings={warnings}
            place={draft.category}
            bodyId={bodyId}
            onChange={(next) => {
              edit({ ...draft, body: next }, "body");
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete "${draft.name}"?`}
        consequence="Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text."
        confirmLabel={`Delete ${draft.category}`}
        pending={remove.isPending}
        onConfirm={() => {
          if (entryId !== undefined) {
            remove.mutate(entryId);
          }
        }}
        onCancel={() => {
          setDeleting(false);
        }}
      />
    </div>
  );
}

function Notice({
  category,
  children,
}: {
  readonly category: EntryCategory;
  readonly children: string;
}) {
  return (
    <EditorProblem
      back={
        <Link to="/entries" search={{ category }}>
          {`Back to ${categoryLabel(category)}s`}
        </Link>
      }
    >
      {children}
    </EditorProblem>
  );
}
