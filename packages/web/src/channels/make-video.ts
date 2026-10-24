import { useNavigate } from "@tanstack/react-router";
import { useOptionalPlaySession } from "@/play/draft-context";
import type { TemplateSummary } from "@/templates/api";
import { useTemplateActions } from "@/templates/use-template-actions";
import { useCurrentChannel } from "./current";

// "Make a video" from a channel's page: Create opened on a fresh draft of one of its templates,
// or on the channel itself. Outside the shell (a page rendered on its own in a test) there is
// no Create draft to open, and both are undefined.
export function useMakeVideo(channelId: string): {
  readonly fromTemplate: ((template: TemplateSummary) => Promise<void>) | undefined;
  readonly inChannel: (() => void) | undefined;
} {
  const session = useOptionalPlaySession();
  const navigate = useNavigate();
  const current = useCurrentChannel();
  const { apply } = useTemplateActions({
    onApplied: async (draftId, isCurrent) => {
      if (session === null || !isCurrent()) return false;
      if (!(await session.open(draftId, isCurrent))) return false;
      if (!isCurrent()) return false;
      await navigate({ to: "/play" });
      return isCurrent();
    },
    beforeApply: session?.flush,
    getGeneration: session?.generation,
    blocked:
      session === null ||
      session.review.starting ||
      session.review.uncertain ||
      session.review.created !== null,
  });
  if (session === null) return { fromTemplate: undefined, inChannel: undefined };
  return {
    fromTemplate: apply,
    // Create starts a fresh draft in the channel its page header shows; with another channel
    // showing there, that would win, so this one is shown instead.
    inChannel: () => {
      if (current.channelId !== null && current.channelId !== channelId)
        current.setChannelId(channelId);
      session.adoptChannel?.(channelId);
    },
  };
}
