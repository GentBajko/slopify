export type TutorialEvent =
  | {
      readonly type: "prompt-saved";
      readonly id: string;
      readonly kind: "article" | "image" | "thumbnail";
    }
  | { readonly type: "project-created"; readonly id: string };

export interface TutorialSession {
  readonly active: boolean;
  readonly step: number;
  readonly articleId?: string;
  readonly imageId?: string;
  readonly projectId?: string;
}

export const tutorialSteps = [
  { id: "text-key", title: "1. Connect a text provider", target: "keys-llm", page: "settings" },
  { id: "audio-key", title: "2. Connect a voice provider", target: "keys-tts", page: "settings" },
  {
    id: "image-key",
    title: "3. Connect an image provider",
    target: "keys-image",
    page: "settings",
  },
  { id: "voice", title: "4. Add a narration voice", target: "voices", page: "settings" },
  {
    id: "article-name",
    title: "5. Name your article prompt",
    target: "prompt-name",
    page: "article",
  },
  {
    id: "article-body",
    title: "6. Write instructions with keywords",
    target: "prompt-body",
    page: "article",
  },
  {
    id: "article-keywords",
    title: "7. Check the detected keywords",
    target: "prompt-slots",
    page: "article",
  },
  {
    id: "article-save",
    title: "8. Save your article prompt",
    target: "prompt-save",
    page: "article",
  },
  {
    id: "image-prompt",
    title: "9. Create an image prompt",
    target: "prompt-editor",
    page: "image",
  },
  { id: "image-save", title: "10. Save your image prompt", target: "prompt-save", page: "image" },
  {
    id: "play-options",
    title: "11. Name the project and choose text generation",
    target: "play-options",
    page: "play",
  },
  { id: "play-article", title: "12. Choose your article", target: "play-article", page: "play" },
  {
    id: "play-keywords",
    title: "13. Fill in your keywords",
    target: "play-keywords",
    page: "play",
  },
  { id: "play-audio", title: "14. Choose narration", target: "play-audio", page: "play" },
  { id: "play-images", title: "15. Choose images", target: "play-images", page: "play" },
  { id: "play-video", title: "16. Choose video output", target: "play-video", page: "play" },
  {
    id: "play-subtitles",
    title: "17. Style optional subtitles",
    target: "play-subtitles",
    page: "play",
  },
  { id: "play-start", title: "18. Review and start your run", target: "play-start", page: "play" },
  {
    id: "project",
    title: "19. Follow and control the run",
    target: "project-controls",
    page: "project",
  },
  { id: "download", title: "20. Download your results", target: "project-video", page: "project" },
] as const;

export type TutorialStep = (typeof tutorialSteps)[number];
export type TutorialStepId = TutorialStep["id"];

export function receiveTutorialEvent(
  session: TutorialSession,
  event: TutorialEvent,
): TutorialSession {
  if (!session.active) return session;
  if (event.type === "project-created") {
    return {
      ...session,
      projectId: event.id,
      step: tutorialSteps.findIndex((step) => step.id === "project"),
    };
  }
  if (event.kind === "article") return { ...session, articleId: event.id };
  if (event.kind === "image") return { ...session, imageId: event.id };
  return session;
}

export function tutorialStepIndex(stepId: string): number | undefined {
  const index = tutorialSteps.findIndex((step) => step.id === stepId);
  return index < 0 ? undefined : index;
}

export const playTargetSection = {
  "play-options": "content",
  "play-article": "content",
  "play-keywords": "content",
  "play-audio": "outputs",
  "play-images": "outputs",
  "play-video": "outputs",
  "play-subtitles": "style",
  "play-start": "review",
} as const;
