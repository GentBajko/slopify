import type {
  BrandKit,
  CastImage,
  CastKind,
  CastMember,
  CastVoice,
  Channel,
  ChannelSummary,
} from "@app/slices/channels/model.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export { castKinds, defaultChannelId } from "@app/slices/channels/model.js";
export type { BrandKit, CastImage, CastKind, CastMember, CastVoice, Channel, ChannelSummary };

export const castKindLabels: Readonly<Record<CastKind, string>> = {
  character: "Character",
  creature: "Creature",
  place: "Place",
  object: "Object",
};

export const channelsKey = ["channels"] as const;
export const channelKey = (id: string) => ["channels", id] as const;
const root = (api: Api): string => `${api.origin}/api/channels`;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function channelsQuery(api: Api) {
  return queryOptions({
    queryKey: channelsKey,
    queryFn: async () =>
      (await read<{ readonly channels: readonly ChannelSummary[] }>(await api.fetch(root(api))))
        .channels,
  });
}

// While a picture is being made the channel is read again every few seconds, so it appears
// without a reload.
export function channelQuery(api: Api, id: string) {
  return queryOptions({
    queryKey: channelKey(id),
    queryFn: async () =>
      read<{ readonly channel: Channel; readonly cast: readonly CastMember[] }>(
        await api.fetch(`${root(api)}/${id}`),
      ),
    refetchInterval: (query) =>
      query.state.data?.cast.some((member) =>
        member.images.some((image) => image.state === "generating"),
      )
        ? 3000
        : false,
  });
}

export async function createChannel(api: Api, id: string, name: string): Promise<Channel> {
  return read(await api.fetch(root(api), json("POST", { id, name })));
}

export async function saveChannel(
  api: Api,
  id: string,
  body: {
    readonly name: string;
    readonly brand: BrandKit;
    readonly seriesBrief: string;
    readonly baseVersion: number;
  },
): Promise<Channel> {
  return read(await api.fetch(`${root(api)}/${id}`, json("PUT", body)));
}

export async function deleteChannel(api: Api, id: string): Promise<void> {
  const response = await api.fetch(`${root(api)}/${id}`, { method: "DELETE" });
  if (!response.ok) await read(response);
}

export interface CastMemberInput {
  readonly kind: CastKind;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  // Absent keeps the saved voice; null removes it.
  readonly voice?: CastVoice | null;
  // One of the channel's hosts; absent keeps what is saved.
  readonly host?: boolean;
}

export async function createCastMember(
  api: Api,
  channelId: string,
  id: string,
  input: CastMemberInput,
): Promise<CastMember> {
  return read(await api.fetch(`${root(api)}/${channelId}/cast`, json("POST", { id, ...input })));
}

export async function saveCastMember(
  api: Api,
  id: string,
  input: CastMemberInput & { readonly baseVersion: number },
): Promise<CastMember> {
  return read(await api.fetch(`${root(api)}/cast/${id}`, json("PUT", input)));
}

export async function deleteCastMember(api: Api, id: string): Promise<void> {
  const response = await api.fetch(`${root(api)}/cast/${id}`, { method: "DELETE" });
  if (!response.ok) await read(response);
}

// Moves a member to a place in the cast's order (0 is first); answers with the cast in order.
export async function moveCastMember(
  api: Api,
  channelId: string,
  memberId: string,
  to: number,
): Promise<readonly CastMember[]> {
  return (
    await read<{ readonly cast: readonly CastMember[] }>(
      await api.fetch(`${root(api)}/${channelId}/cast/move`, json("POST", { memberId, to })),
    )
  ).cast;
}

export async function uploadCastImage(api: Api, memberId: string, file: File): Promise<CastImage> {
  return read(
    await api.fetch(`${root(api)}/cast/${memberId}/images`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    }),
  );
}

export async function generateCastImage(
  api: Api,
  memberId: string,
  body: { readonly prompt: string; readonly provider: string; readonly model: string },
): Promise<CastImage> {
  return read(await api.fetch(`${root(api)}/cast/${memberId}/generate`, json("POST", body)));
}

export async function deleteCastImage(api: Api, memberId: string, imageId: string): Promise<void> {
  const response = await api.fetch(`${root(api)}/cast/${memberId}/images/${imageId}`, {
    method: "DELETE",
  });
  if (!response.ok) await read(response);
}

export async function moveTemplate(api: Api, templateId: string, channelId: string): Promise<void> {
  await read(await api.fetch(`${root(api)}/templates/${templateId}`, json("PUT", { channelId })));
}

// Automatic, Always Yes or Always No for YouTube's AI disclosure; saved on its own.
export async function saveAiDisclosure(
  api: Api,
  id: string,
  aiDisclosure: Channel["aiDisclosure"],
): Promise<Channel> {
  return read(await api.fetch(`${root(api)}/${id}/ai-disclosure`, json("PUT", { aiDisclosure })));
}

export function pictureUrl(api: Api, sha256: string): string {
  return `${root(api)}/pictures/${sha256}`;
}
