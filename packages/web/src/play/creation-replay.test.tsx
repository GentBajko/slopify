import { randomUUID } from "node:crypto";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { readDraft, saveDraft } from "@app/slices/play-drafts/service.js";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { type Answer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession } from "./draft-context";
import { DraftList } from "./draft-list";
import { sqliteSessionFixture } from "./draft-sqlite-fixture";
import { playRoutes, SessionProbe } from "./play-test-fixture";

function mountSession(
  capture: (session: PlaySession) => void,
  routes: Readonly<Record<string, Answer>>,
) {
  return renderApp(
    <PlayDraftProvider>
      <SessionProbe capture={capture} />
      <DraftList />
    </PlayDraftProvider>,
    testDeps(playRoutes(routes)),
  );
}

let session: PlaySession;

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

function current(h: ReturnType<typeof sqliteSessionFixture>, id: string) {
  const result = readDraft(h.deps, id);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function otherWriter(h: ReturnType<typeof sqliteSessionFixture>, id: string): void {
  const saved = current(h, id).draft;
  expect(
    saveDraft(h.deps, {
      id,
      baseVersion: saved.version,
      mutationId: randomUUID(),
      document: {
        ...saved.document,
        form: {
          ...saved.document.form,
          provided: { ...saved.document.form.provided, article: "Tab B article" },
        },
      },
    }).ok,
  ).toBe(true);
}

it.each(["reload", "fork", "no other writer"])(
  "recovers lost create acknowledgement: %s",
  async (recovery) => {
    const h = sqliteSessionFixture();
    let lost = false;
    try {
      mountSession(
        (next) => {
          session = next;
        },
        {
          ...h.routes,
          "POST /api/drafts": async (request) => {
            const response = await h.routes["POST /api/drafts"]?.(request);
            if (!lost) {
              lost = true;
              throw new Error("Lost create acknowledgement");
            }
            if (!response) throw new Error("Missing create route");
            return response;
          },
        },
      );
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tab A" } });
      await waitFor(() => expect(session.status).toBe("error"));
      const id = session.activeId ?? "";
      if (recovery !== "no other writer") otherWriter(h, id);
      await act(async () => {
        expect(await session.flush()).toBe(recovery === "no other writer");
      });
      if (recovery === "no other writer") {
        expect(session.status).toBe("saved");
        expect(session.view?.draft.version).toBe(1);
        return;
      }
      expect(session.status).toBe("conflict");
      expect(session.document.form.provided.article).toBe("");
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A newer local edit" } });
      await act(async () => {
        expect(await session.flush()).toBe(false);
      });
      expect(current(h, id).draft.version).toBe(2);
      expect(current(h, id).draft.document.form.provided.article).toBe("Tab B article");
      if (recovery === "reload") {
        fireEvent.click(screen.getByRole("button", { name: "Reload saved draft" }));
        await waitFor(() => expect(session.status).toBe("saved"));
        expect(session.document.form.provided.article).toBe("Tab B article");
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Save as a new draft" }));
        await waitFor(() => expect(session.status).toBe("saved"));
        expect(session.activeId).not.toBe(id);
        expect(session.document.form.title).toBe("A newer local edit");
        expect(session.document.form.provided.article).toBe("");
      }
      expect(session.status).toBe("saved");
    } finally {
      cleanup();
      h.close();
    }
  },
);

it.each(["unchanged", "edited", "starting", "started"])(
  "keeps fork replay edits and attachment ownership with target %s",
  async (targetState) => {
    const intervening = targetState !== "unchanged";
    const h = sqliteSessionFixture();
    const targets: string[] = [];
    let lost = false;
    try {
      mountSession(
        (next) => {
          session = next;
        },
        {
          ...h.routes,
          "POST /api/drafts/:id/fork": async (request) => {
            const body = (await request.clone().json()) as { id: string };
            targets.push(body.id);
            const response = await h.routes["POST /api/drafts/:id/fork"]?.(request);
            if (!lost) {
              lost = true;
              throw new Error("Lost fork acknowledgement");
            }
            if (!response) throw new Error("Missing fork route");
            return response;
          },
        },
      );
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tab A" } });
      await waitFor(() => expect(session.status).toBe("saved"));
      const source = session.activeId ?? "";
      const refs = ["first.png", "second.png"].map((name) => ({
        attachmentId: randomUUID(),
        name,
      }));
      await act(async () => {
        session.edit({
          ...session.document,
          form: {
            ...session.document.form,
            provided: { ...session.document.form.provided, images: refs },
          },
        });
        expect(await session.flush()).toBe(true);
      });
      const stagedIds = refs.map((ref) => h.readyAttachment(ref.attachmentId, ref.name));
      otherWriter(h, source);
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A conflict" } });
      await act(async () => {
        expect(await session.flush()).toBe(false);
        await session.saveAsNew();
      });
      expect(session.status).toBe("error");
      const target = targets[0] ?? "";
      if (targetState === "edited") otherWriter(h, target);
      else if (intervening)
        h.deps.db
          .prepare("UPDATE play_drafts SET state=?,review_id=? WHERE id=?")
          .run(targetState, randomUUID(), target);
      const targetBefore = current(h, target);
      await act(async () => {
        const document: PlayDraftDocument = {
          ...session.document,
          form: {
            ...session.document.form,
            title: "A newer edit",
            provided: { ...session.document.form.provided, images: [...refs].reverse() },
          },
        };
        session.edit(document);
        await session.saveAsNew();
      });
      expect(targets[1]).toBe(target);
      if (intervening) {
        expect(session.status).toBe("conflict");
        expect(session.activeId).toBe(source);
        await act(async () => {
          expect(await session.flush()).toBe(false);
        });
        expect(current(h, target)).toEqual(targetBefore);
        await act(async () => session.saveAsNew());
        expect(session.activeId).not.toBe(target);
        expect(session.activeId).not.toBe(source);
      }
      await act(async () => {
        expect(await session.flush()).toBe(true);
      });
      expect(session.document.form.title).toBe("A newer edit");
      expect(session.document.form.provided.images.map((ref) => ref.name)).toEqual([
        "second.png",
        "first.png",
      ]);
      expect(
        session.document.form.provided.images.every(
          (ref) => !refs.some((old) => old.attachmentId === ref.attachmentId),
        ),
      ).toBe(true);
      const recovered = current(h, session.activeId ?? "");
      expect(recovered.draft.document).toEqual(session.document);
      expect(recovered.attachments.map((file) => file.stagedFileId).sort()).toEqual(
        [...stagedIds].sort(),
      );
      expect(recovered.attachments.every((file) => file.state === "ready")).toBe(true);
      expect(
        current(h, source)
          .attachments.map((file) => file.id)
          .sort(),
      ).toEqual(refs.map((ref) => ref.attachmentId).sort());
      expect(current(h, source).attachments.every((file) => file.state === "ready")).toBe(true);
    } finally {
      cleanup();
      h.close();
    }
  },
);
