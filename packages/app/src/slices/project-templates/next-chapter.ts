import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { projectById } from "../admission/repo.js";
import { projectChannelId } from "../channels/repo.js";
import type { DraftView } from "../play-drafts/model.js";
import { draftRow } from "../play-drafts/repo.js";
import { createDraft, readDraft } from "../play-drafts/service.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { type Book, bookChapterMax, bookLabel, bookTitleMax } from "../voices/model.js";
import { documentFromProject } from "./from-project.js";
import type { TemplateDeps } from "./model.js";

// Books: an audiobook is written chapter by chapter, one project each. "Make the next chapter"
// on a chapter opens a new Play draft with everything the book shares - format, speakers and
// their voices, channel (and so its cast), prompts and settings - and the chapter number one
// higher. The chapter's own words are left empty: the new chapter is written or pasted fresh,
// and files the last one was given are listed to attach again, as a template's are.

export const nextChapterSchema = z
  .object({ id: z.uuid(), projectId: z.string().min(1).max(64) })
  .strict()
  .readonly();

export type NextChapterResult =
  | { readonly ok: true; readonly value: DraftView }
  | {
      readonly ok: false;
      readonly reason: "not-found" | "conflict" | "not-an-audiobook";
      readonly message: string;
    };

// The book a project's next chapter belongs to: its own book one chapter on, or, for an
// audiobook made on its own, a book named after it whose second chapter comes next.
export function nextBook(title: string, book: Book | undefined): Book {
  return book === undefined
    ? { title: title.trim().slice(0, bookTitleMax) || "Untitled book", chapter: 2 }
    : { title: book.title, chapter: Math.min(bookChapterMax, book.chapter + 1) };
}

export function makeNextChapter(deps: TemplateDeps, input: unknown): NextChapterResult {
  const parsed = nextChapterSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      reason: "not-found",
      message: "That project could not be found. Open it again from Projects, then try again.",
    };
  const { id, projectId } = parsed.data;
  return transact(deps.db, (): NextChapterResult => {
    // Pressed twice (a retry after a dropped answer): the draft it made the first time.
    if (draftRow(deps.db, id) !== undefined) {
      const made = readDraft(deps, id);
      if (made.ok) return { ok: true, value: made.value };
    }
    const project = projectById(deps.db, projectId);
    const current = project === undefined ? undefined : currentRevisionId(deps.db, project.id);
    const revision =
      project === undefined || current === undefined
        ? undefined
        : revisionById(deps.db, project.id, current);
    if (project === undefined || revision === undefined)
      return {
        ok: false,
        reason: "not-found",
        message:
          "That project could not be found; it may have been deleted. Open Projects and pick another chapter.",
      };
    const voices = revision.config.voices;
    if (voices?.format !== "audiobook")
      return {
        ok: false,
        reason: "not-an-audiobook",
        message:
          "Only an audiobook has chapters. Pick Audiobook under Speakers (Play → Audio) to start a book.",
      };
    const book = nextBook(revision.config.title, voices.book);
    const document = documentFromProject(deps, revision);
    const form = document.form;
    const result = createDraft(deps, {
      id,
      document: {
        ...document,
        channelId: projectChannelId(deps.db, project.id),
        form: {
          ...form,
          title: bookLabel(book),
          voices: { ...voices, book },
          provided: {
            ...form.provided,
            // The new chapter's own words, written or pasted fresh.
            research: "",
            article: "",
          },
        },
      },
    });
    if (!result.ok)
      return {
        ok: false,
        reason: "conflict",
        message:
          "The next chapter's draft could not be made. Press Make the next chapter again; if it keeps failing, use Download diagnostics in Settings and report it.",
      };
    // Files the last chapter was given are attached again on Play, as with a template.
    deps.db.prepare("UPDATE play_draft_attachments SET status='reattach' WHERE draft_id=?").run(id);
    const made = readDraft(deps, id);
    if (!made.ok) throw new Error("The next chapter's draft could not be read back");
    return { ok: true, value: made.value };
  });
}
