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

export function pictureUrl(api: Api, sha256: string): string {
  return `${root(api)}/pictures/${sha256}`;
}
