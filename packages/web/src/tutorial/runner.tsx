import { readinessIsUsable } from "@app/kernel/ports/model.js";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { ProviderStatus } from "@/api";
import { useApp } from "@/app-context";
import { usePlaySession } from "@/play/draft-context";
import { finalOutput } from "@/project/summary";
import { noticeQuery, projectQuery, providersQuery, voicesQuery } from "@/queries";
import type { TutorialSession, TutorialStepId } from "./model";
import { appTourStart, playTargetSection, tutorialSteps } from "./model";
import { Spotlight } from "./spotlight";
import { StepContent } from "./step-content";

function ready(provider: ProviderStatus): boolean {
  return readinessIsUsable(provider.readiness);
}

export function TutorialRunner({
  session,
  progress,
  update,
}: {
  readonly session: TutorialSession;
  readonly progress: Readonly<Record<string, boolean>>;
  readonly update: Dispatch<SetStateAction<TutorialSession>>;
}) {
  const { api } = useApp();
  const play = usePlaySession();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = useQuery(noticeQuery(api));
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const project = useQuery({
    ...projectQuery(api, session.projectId ?? ""),
    enabled: session.projectId !== undefined,
  });
  const [revealed, setRevealed] = useState<string | null>(null);
  const entered = useRef<number | null>(null);
  const step = tutorialSteps[session.step];
  const allowed = notice.data?.seen === true;

  useEffect(() => {
    if (!allowed || !step || entered.current === session.step) return;
    entered.current = session.step;
    // Navigate on entry only. In particular, a successful prompt save owns its
    // delayed return to the list; the tutorial must not pull that editor back open.
    if (step.page === "settings") {
      // Keys and voices are separate Settings sections; open the one this step points at.
      const section = step.id === "voice" ? "voices" : "providers";
      if (location.pathname !== "/settings" || !location.searchStr.includes(`section=${section}`)) {
        void navigate({ to: "/settings", search: { section } });
      }
    }
    if (step.page === "article" || step.page === "image") {
      const id = step.page === "article" ? session.articleId : session.imageId;
      const sameDraft =
        location.pathname === "/prompts/new" && location.searchStr.includes(`kind=${step.page}`);
      if (id && location.pathname !== `/prompts/${id}`) {
        void navigate({ to: "/prompts/$promptId", params: { promptId: id } });
      } else if (!id && !sameDraft) {
        void navigate({ to: "/prompts/new", search: { kind: step.page } });
      }
    }
    if (step.page === "play") {
      if (location.pathname !== "/play") void navigate({ to: "/play" });
    }
    // The screens a channel runs on have no parameters; open each by its route.
    const screen = { home: "/", channels: "/channels", calendar: "/calendar" } as const;
    if (step.page === "home" || step.page === "channels" || step.page === "calendar") {
      const to = screen[step.page];
      if (location.pathname !== to) void navigate({ to });
    }
    if (
      step.page === "project" &&
      session.projectId &&
      location.pathname !== `/projects/${session.projectId}`
    ) {
      void navigate({ to: "/projects/$projectId", params: { projectId: session.projectId } });
    }
  }, [
    allowed,
    step,
    session.step,
    session.articleId,
    session.imageId,
    session.projectId,
    location.pathname,
    location.searchStr,
    navigate,
  ]);

  useEffect(() => {
    if (!allowed || step?.page !== "play" || location.pathname !== "/play") return;
    let current = true;
    setRevealed(null);
    void play.navigate(playTargetSection[step.id]).then(() => {
      if (current) setRevealed(step.id);
    });
    return () => {
      current = false;
    };
  }, [allowed, step, location.pathname, play.navigate]);

  // Save callbacks report only confirmed resource IDs. Wait for the editor's normal
  // successful-save navigation before moving to the next page, including when going Back.
  useEffect(() => {
    if (location.pathname !== "/prompts") return;
    if (step?.id === "image-prompt" && session.imageId) {
      update((current) => ({
        ...current,
        step: tutorialSteps.findIndex((one) => one.id === "play-options"),
      }));
    } else if (
      (step?.id === "article-save" && session.articleId) ||
      (step?.id === "image-save" && session.imageId)
    ) {
      update((current) => ({ ...current, step: current.step + 1 }));
    }
  }, [location.pathname, step?.id, session.articleId, session.imageId, update]);

  if (!allowed || !step) return null;
  if (step.page === "play" && (revealed !== step.id || play.section !== playTargetSection[step.id]))
    return null;
  const listed = providers.data?.providers ?? [];
  const familyReady = (family: ProviderStatus["family"]) =>
    listed.some((provider) => provider.family === family && ready(provider));
  const voiceReady = (voices.data?.voices ?? []).some((voice) =>
    listed.some((provider) => provider.id === voice.provider && ready(provider)),
  );
  const canNext: Partial<Record<TutorialStepId, boolean>> = {
    "text-key": familyReady("llm"),
    "audio-key": familyReady("tts"),
    "image-key": familyReady("image"),
    voice: voiceReady,
    "article-name": progress.promptIsArticle === true && progress.promptNamed === true,
    "article-body":
      progress.promptIsArticle === true &&
      progress.promptBodyReady === true &&
      progress.promptHasKeywords === true,
    "article-keywords": progress.promptHasKeywords === true,
    "article-save": false,
    "image-prompt":
      progress.promptIsImage === true &&
      progress.promptSaveReady === true &&
      progress.promptHasKeywords === true,
    "image-save": false,
    "play-article": progress.playArticleReady === true,
    "play-audio": progress.playAudioReady === true,
    "play-images": progress.playImagesReady === true,
    "play-video": progress.playVideoReady === true,
    "play-subtitles": progress.playSubtitlesReady === true,
    "play-options": progress.playOptionsReady === true,
    "play-keywords": progress.playKeywordsReady === true,
    "play-start": false,
  };
  const close = () => update((current) => ({ ...current, active: false }));
  const appTour = tutorialSteps.findIndex((one) => one.id === appTourStart);
  const last = session.step === tutorialSteps.length - 1;
  const advance = () => {
    if (last) close();
    // Without a project there is nothing to follow; the tour goes on to the app's screens.
    else if (step.id === "play-start") update((current) => ({ ...current, step: appTour }));
    else update((current) => ({ ...current, step: current.step + 1 }));
  };
  // Back from the app's screens skips the project steps when no project was made.
  const back = () =>
    update((current) => ({
      ...current,
      step:
        step.id === appTourStart && session.projectId === undefined
          ? tutorialSteps.findIndex((one) => one.id === "play-start")
          : current.step - 1,
    }));
  const output = project.data ? finalOutput(project.data.project.config) : "video";
  const target =
    step.id === "download" && output === "article"
      ? "project-article"
      : step.id === "play-keywords" && progress.playHasKeywords === false
        ? "play-options"
        : // Prepare upload follows a finished video; without one, the project header.
          step.id === "studio-prep" && output !== "video"
          ? "project-controls"
          : step.target;
  const waitingForSave = step.id === "article-save" || step.id === "image-save";
  const saving =
    (step.page === "article" || step.page === "image") && progress.promptSaving === true;

  return (
    <Spotlight
      stepId={step.id}
      target={`[data-tour="${target}"]`}
      title={step.title}
      progress={`${session.step + 1} of ${tutorialSteps.length} · First project`}
      onClose={close}
      {...(session.step === 0 || step.id === "project" || saving ? {} : { onBack: back })}
      onNext={advance}
      nextDisabled={saving || canNext[step.id] === false}
      nextLabel={
        waitingForSave
          ? "Use Save in the editor"
          : step.id === "play-start"
            ? "Use Start run / Queue N on the page"
            : last
              ? "Finish tutorial"
              : "Next"
      }
      {...(saving ? {} : { onSkip: advance })}
      skipLabel={
        step.id === "play-start"
          ? "Skip generating"
          : waitingForSave
            ? "Skip without saving"
            : "Skip this step"
      }
    >
      <StepContent step={step.id} output={output} />
      {providers.error || voices.error ? (
        <p className="text-red">{providers.error?.message ?? voices.error?.message}</p>
      ) : null}
    </Spotlight>
  );
}
