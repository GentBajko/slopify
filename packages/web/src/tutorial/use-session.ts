import type { TutorialWrite } from "@app/slices/settings/tutorial-schema.js";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { listPrompts, readProject } from "@/api";
import { useApp } from "@/app-context";
import { type TutorialSession, tutorialStepIndex, tutorialSteps } from "./model";
import { readTutorialSession, resetTutorialSession, saveTutorialSession } from "./session-api";

export function useTutorialSession(): {
  readonly session: TutorialSession;
  readonly update: Dispatch<SetStateAction<TutorialSession>>;
  readonly start: () => void;
  readonly retry: () => void;
  readonly restart: () => void;
  readonly error: string | null;
} {
  const { api } = useApp();
  const [session, setSession] = useState<TutorialSession>({ active: false, step: 0 });
  const [error, setError] = useState<string | null>(null);
  const owner = useMemo(() => {
    let current: TutorialSession = { active: false, step: 0 };
    let version = 0;
    let restored = false;
    let restoring = false;
    let generation = 0;
    let readable = true;
    let starting = false;
    let working = false;
    let pending: TutorialWrite | null = null;
    const deferred: SetStateAction<TutorialSession>[] = [];
    const queue: TutorialSession[] = [];
    const fail = (error: unknown) =>
      setError(
        error instanceof Error
          ? error.message
          : "Your tutorial progress wasn't saved. You can keep going; it will try again on the next step.",
      );
    const flush = async (): Promise<void> => {
      if (working || !restored || !readable) return;
      working = true;
      try {
        while (pending || queue.length > 0) {
          if (!pending) {
            const next = queue.shift();
            if (!next) break;
            const step = tutorialSteps[next.step];
            if (!step)
              throw new Error(
                "This tutorial step isn't recognised. Choose Restart tutorial to start over.",
              );
            const { step: _step, ...fields } = next;
            pending = {
              baseVersion: version,
              mutationId: crypto.randomUUID(),
              session: { ...fields, schemaVersion: 1, stepId: step.id },
            };
          }
          const reply = await saveTutorialSession(api, pending);
          version = reply.version;
          pending = null;
        }
        setError(null);
      } catch (error) {
        fail(error);
      } finally {
        working = false;
      }
    };
    const update: Dispatch<SetStateAction<TutorialSession>> = (next) => {
      if (!restored) {
        deferred.push(next);
        return;
      }
      const value = typeof next === "function" ? next(current) : next;
      if (value === current) return;
      current = value;
      setSession(current);
      queue.push(current);
      void flush();
    };
    const start = () => {
      if (!restored) {
        starting = true;
        return;
      }
      if (!readable) {
        setError("Saved tutorial progress cannot be read. Choose Restart tutorial to recover.");
        return;
      }
      update({ active: true, step: 0 });
    };
    const restore = async (): Promise<void> => {
      if (restoring || restored) return;
      restoring = true;
      const selected = generation;
      try {
        const view = await readTutorialSession(api);
        if (selected !== generation) return;
        version = view.version;
        readable = view.readable;
        if (!readable) restored = true;
        if (!readable) {
          setError("Saved tutorial progress cannot be read. Choose Restart tutorial to recover.");
          return;
        }
        const { schemaVersion: _schema, stepId, ...fields } = view.session;
        current = {
          active: fields.active,
          step: tutorialStepIndex(stepId) ?? 0,
          ...(fields.articleId === undefined ? {} : { articleId: fields.articleId }),
          ...(fields.imageId === undefined ? {} : { imageId: fields.imageId }),
          ...(fields.projectId === undefined ? {} : { projectId: fields.projectId }),
        };
        if (current.articleId || current.imageId) {
          const { prompts } = await listPrompts(api);
          const { articleId, imageId, ...base } = current;
          current = {
            ...base,
            ...(articleId !== undefined &&
            prompts.some((p) => p.id === articleId && p.kind === "article")
              ? { articleId }
              : {}),
            ...(imageId !== undefined && prompts.some((p) => p.id === imageId && p.kind === "image")
              ? { imageId }
              : {}),
          };
        }
        if (current.projectId) await readProject(api, current.projectId);
        if (selected !== generation) return;
        restored = true;
        setSession(current);
        for (const next of deferred.splice(0)) update(next);
        if (starting) start();
        setError(null);
      } catch (error) {
        if (selected === generation) fail(error);
      } finally {
        restoring = false;
      }
    };
    const restart = async (): Promise<void> => {
      if (working) return;
      working = true;
      generation++;
      deferred.length = 0;
      starting = false;
      try {
        await resetTutorialSession(api);
        version = 0;
        readable = true;
        restored = true;
        pending = null;
        queue.length = 0;
        current = { active: true, step: 0 };
        setSession(current);
        queue.push(current);
        setError(null);
      } catch (error) {
        fail(error);
      } finally {
        working = false;
      }
      await flush();
    };
    return {
      update,
      start,
      restore,
      retry: () => {
        void (restored ? flush() : restore());
      },
      restart: () => {
        void restart();
      },
    };
  }, [api]);
  useEffect(() => {
    void owner.restore();
  }, [owner]);
  return {
    session,
    update: owner.update,
    start: owner.start,
    retry: owner.retry,
    restart: owner.restart,
    error,
  };
}
