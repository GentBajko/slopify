import { render } from "@app/slices/admission/substitute.js";
import { similarTopics } from "@app/slices/schedules/similar.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { videosQuery } from "@/channels/memory-api";
import { projectsQuery } from "@/queries";
import { useDraftChannelId } from "./channel-picker";
import { usePlaySession } from "./draft-context";

export interface SeenTitle {
  readonly title: string;
  readonly where: "project" | "video";
}

// The first title this channel already has for the typed topic: a project made here, or one
// of the channel's existing uploads (Channel → Existing videos). The same near-duplicate rule
// the schedules use for suggested topics.
export function seenBefore(
  typed: readonly string[],
  projects: readonly string[],
  videos: readonly string[],
): SeenTitle | undefined {
  const asked = typed.map((one) => one.trim()).filter((one) => one !== "");
  if (asked.length === 0) return undefined;
  const hit = (title: string) => asked.some((one) => similarTopics(one, title));
  const project = projects.find(hit);
  if (project !== undefined) return { title: project, where: "project" };
  const video = videos.find(hit);
  return video === undefined ? undefined : { title: video, where: "video" };
}

// A quiet note under the topic on Play: nothing is refused, the person decides.
export function SeenBefore({
  topics,
}: {
  readonly topics: readonly string[];
}): ReactElement | null {
  const { api } = useApp();
  const session = usePlaySession();
  const { document } = session;
  const channelId = useDraftChannelId();
  const projects = useQuery(projectsQuery(api));
  const videos = useQuery(videosQuery(api, channelId));
  const { form } = document;
  const title = render(form.title, form.values);
  const typed =
    topics.length === 0 ? [form.title] : [title, ...topics.map((name) => form.values[name] ?? "")];
  const seen = seenBefore(
    typed,
    (projects.data?.projects ?? [])
      .filter((one) => one.channelId === channelId)
      .map((one) => one.title),
    (videos.data ?? []).map((one) => one.title),
  );
  // Once Start made it, the match is the video just queued.
  if (seen === undefined || session.review.created !== null) return null;
  return (
    <p role="status" className="m-0 text-small text-ink-2">
      {seen.where === "project"
        ? `This channel already has a video on this: "${seen.title}" (in Projects). Start anyway if you want another take.`
        : `This channel already uploaded "${seen.title}" (Channel → Existing videos). Start anyway if you want another take.`}
    </p>
  );
}
