import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { projectById } from "../admission/repo.js";
import { platformLabels } from "../social/model.js";
import { postsIn } from "../social/repo.js";
import type { AttentionEntry } from "./attention.js";

// Posts the extension filled in a site's form, waiting for the person to press Post (or
// Schedule) there, and fills that stopped. Posting is the person's: an agent reports them.
export function postsWaiting(deps: {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}): readonly AttentionEntry[] {
  return postsIn(deps.db, ["filled", "failed"]).flatMap((post) => {
    const project = projectById(deps.db, post.projectId);
    if (project === undefined) return [];
    const site = platformLabels[post.platform];
    const filled = post.state === "filled";
    return [
      {
        kind: filled ? "post-due" : "extension-failure",
        since: (filled ? post.filledAt : post.updatedAt) ?? post.updatedAt ?? "",
        projectId: post.projectId,
        title: project.title,
        stage: "video",
        itemKey: `social:${post.platform}`,
        reason: filled
          ? `The ${site} post is filled in ${site}'s form and waits for the person to press Post there. Posting is the person's: report it.`
          : `Filling the ${site} post failed: ${post.message ?? "the extension gave no reason."} Fixing it is the extension's or the person's: report it.`,
        autoRetryInFlight: false,
        agentCanAct: false,
        ids: { projectId: post.projectId, platform: post.platform },
        tools: ["get_post_packs"],
      } satisfies AttentionEntry,
    ];
  });
}
