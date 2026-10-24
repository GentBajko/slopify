import { accountExamples, accountPatterns } from "@app/slices/social/limits.js";
import {
  platformLabels,
  type SocialAccounts,
  type SocialPlatform,
  socialPlatforms,
  type XTier,
  xTierLabels,
  xTiers,
} from "@app/slices/social/model.js";
import type { ReactElement } from "react";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";

export interface PostingDraft {
  readonly xTier: XTier;
  readonly accounts: SocialAccounts;
}

// An account name the site wouldn't take, as the field's error; undefined when it fits or is
// blank (no account).
export function accountProblem(platform: SocialPlatform, name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "" || accountPatterns[platform].test(trimmed)) return undefined;
  return `Type it the way ${platformLabels[platform]} shows it, like ${accountExamples[platform]}, without the site's address.`;
}

export function postingBlocked(draft: PostingDraft): boolean {
  return socialPlatforms.some(
    (platform) => accountProblem(platform, draft.accounts[platform] ?? "") !== undefined,
  );
}

// How many accounts are filled in, for the Posting fold's line: "2 accounts".
export function accountCount(draft: PostingDraft): number {
  return socialPlatforms.filter((platform) => (draft.accounts[platform] ?? "").trim() !== "")
    .length;
}

// Brand → Posting: the channel's X subscription (it only changes a post's warnings) and its
// account on each site, which the extension uses to find a published post's link. Saved with
// the Brand form.
export function PostingBlock({
  value,
  onChange,
}: {
  readonly value: PostingDraft;
  readonly onChange: (next: PostingDraft) => void;
}): ReactElement {
  return (
    <section aria-label="Posting" className="flex flex-col gap-4">
      <Segmented
        label="X subscription"
        tip="planning.channel.x-tier"
        help="Only changes which warnings a post on X gets."
        value={value.xTier}
        options={xTiers.map((tier) => ({ value: tier, label: xTierLabels[tier] }))}
        onChange={(xTier) => onChange({ ...value, xTier })}
      />
      <div className="flex flex-col gap-2" {...helpScope}>
        <div className="sl-fields">
          {socialPlatforms.map((platform) => {
            const name = value.accounts[platform] ?? "";
            const problem = accountProblem(platform, name);
            return (
              <Field
                key={platform}
                label={`${platformLabels[platform]} account`}
                {...(problem === undefined ? {} : { error: problem })}
              >
                <Input
                  value={name}
                  maxLength={260}
                  placeholder={accountExamples[platform]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      accounts: { ...value.accounts, [platform]: event.target.value },
                    })
                  }
                />
              </Field>
            );
          })}
        </div>
        <span className="flex items-center gap-1">
          <HelpLine>
            Your name on each site, so the browser extension can find a published post's link. Never
            used to sign in.
          </HelpLine>
          <InfoTip id="planning.channel.accounts" label="Accounts" className="-my-1" />
        </span>
      </div>
    </section>
  );
}
