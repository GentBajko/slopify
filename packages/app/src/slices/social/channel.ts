import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { accountPatterns } from "./limits.js";
import {
  platformLabels,
  type SocialAccounts,
  type SocialPlatform,
  socialPlatforms,
  type XTier,
  xTiers,
} from "./model.js";

// A channel's accounts on other sites: the X subscription (warnings only) and the account
// names the extension finds a published post's link with. Never a login.
export interface ChannelSocial {
  readonly xTier: XTier;
  readonly accounts: SocialAccounts;
}

const accountsSchema = z.partialRecord(z.enum(socialPlatforms), z.string().max(260));

export function channelSocial(db: DatabaseSync, channelId: string): ChannelSocial {
  const row = db.prepare("SELECT x_tier, social_accounts FROM channels WHERE id=?").get(channelId);
  const xTier = xTiers.find((one) => one === row?.x_tier) ?? "free";
  let accounts: SocialAccounts = {};
  try {
    const parsed = accountsSchema.safeParse(JSON.parse(String(row?.social_accounts ?? "{}")));
    if (parsed.success) accounts = parsed.data;
  } catch {
    accounts = {};
  }
  return { xTier, accounts };
}

// An account name a site wouldn't take, as the sentence the Posting block shows; undefined
// when every name fits. A blank name is no account.
export function accountsProblem(accounts: SocialAccounts): string | undefined {
  for (const platform of socialPlatforms) {
    const name = accounts[platform]?.trim() ?? "";
    if (name !== "" && !accountPatterns[platform].test(name))
      return `"${name}" isn't a ${platformLabels[platform]} account name. Type it the way ${platformLabels[platform]} shows it, without the site's address, then Save.`;
  }
  return undefined;
}

export function tidyAccounts(accounts: SocialAccounts): SocialAccounts {
  const tidy: Partial<Record<SocialPlatform, string>> = {};
  for (const platform of socialPlatforms) {
    const name = accounts[platform]?.trim() ?? "";
    if (name !== "") tidy[platform] = name;
  }
  return tidy;
}

export function writeChannelSocial(
  db: DatabaseSync,
  channelId: string,
  change: { readonly xTier?: XTier | undefined; readonly accounts?: SocialAccounts | undefined },
): void {
  if (change.xTier !== undefined)
    db.prepare("UPDATE channels SET x_tier=? WHERE id=?").run(change.xTier, channelId);
  if (change.accounts !== undefined)
    db.prepare("UPDATE channels SET social_accounts=? WHERE id=?").run(
      JSON.stringify(tidyAccounts(change.accounts)),
      channelId,
    );
}
