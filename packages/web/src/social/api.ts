import type {
  FillResponse,
  ProjectPostChoice,
  RedditFields,
  SocialPacksResponse,
  SocialPlatform,
} from "@app/slices/social/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

// A project's posts on other sites (`edge/http/social.ts`). Every change answers the packs as
// they now read, so the page shows the server's own counting and warnings.

export const socialPacksKey = (projectId: string) => ["social", "packs", projectId] as const;

export async function readPostPacks(api: Api, projectId: string): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"].$get({ param: { projectId } }),
  );
}

// The project's own pick for one site; null goes back to the template's settings.
export async function savePostChoice(
  api: Api,
  projectId: string,
  platform: SocialPlatform,
  choice: ProjectPostChoice | null,
): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"][":platform"].choice.$put({
      param: { projectId, platform },
      json: { choice: sent(choice) },
    }),
  );
}

// The route's schema takes plain arrays; the model's are read-only.
function sent(choice: ProjectPostChoice | null) {
  if (choice === null || "off" in choice) return choice;
  const { designs, ...media } = choice.media;
  return { ...choice, media: designs === undefined ? media : { ...media, designs: [...designs] } };
}

// The person's own words; `base` is the written text they started from.
export async function savePostText(
  api: Api,
  projectId: string,
  platform: SocialPlatform,
  text: string,
  base: string,
): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"][":platform"].text.$put({
      param: { projectId, platform },
      json: { text, base },
    }),
  );
}

export async function resetPostText(
  api: Api,
  projectId: string,
  platform: SocialPlatform,
): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"][":platform"].text.$delete({
      param: { projectId, platform },
    }),
  );
}

export async function saveRedditFields(
  api: Api,
  projectId: string,
  reddit: RedditFields,
): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"][":platform"].reddit.$put({
      param: { projectId, platform: "reddit" },
      json: { reddit },
    }),
  );
}

// The post's link, pasted by the person; null removes it so the post can be filled again.
export async function savePostLink(
  api: Api,
  projectId: string,
  platform: SocialPlatform,
  url: string | null,
): Promise<SocialPacksResponse> {
  return read<SocialPacksResponse>(
    await api.client.social.packs[":projectId"][":platform"].link.$put({
      param: { projectId, platform },
      json: { url },
    }),
  );
}

export async function fillPost(
  api: Api,
  projectId: string,
  platform: SocialPlatform,
): Promise<FillResponse> {
  return read<FillResponse>(
    await api.client.social.packs[":projectId"][":platform"].fill.$post({
      param: { projectId, platform },
    }),
  );
}
