-- A channel's accounts on other sites (`slices/social`): the X subscription, which only changes
-- a post's warnings, and the account names the extension reads a published post's link from.
-- Never a login.
ALTER TABLE channels ADD COLUMN x_tier TEXT NOT NULL DEFAULT 'free' CHECK (x_tier IN ('free','premium','premium_plus'));
ALTER TABLE channels ADD COLUMN social_accounts TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(social_accounts));
