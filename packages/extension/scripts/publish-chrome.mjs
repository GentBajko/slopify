// Uploads the built Chrome zip to the Chrome Web Store and submits it for review, so installed
// copies update by themselves once Google approves it. Run by the release workflow after the
// extension is built (packages/extension/dist/slopify-studio-chrome.zip).
//
// Needs, as environment variables (GitHub secrets):
//   CWS_SERVICE_ACCOUNT_JSON  the service account's JSON key (added under Account in the
//                             Chrome Web Store Developer Dashboard)
//   CWS_PUBLISHER_ID          the dashboard's Publisher ID
//   CWS_EXTENSION_ID          the item's id
// Without them it says so and stops without failing. A zip whose version the store already has
// is refused by the store; that counts as "nothing new to publish", not a failure.
// Chrome Web Store API v2: https://developer.chrome.com/docs/webstore/using-api

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  CWS_SERVICE_ACCOUNT_JSON: key,
  CWS_PUBLISHER_ID: publisher,
  CWS_EXTENSION_ID: item,
} = process.env;
if (!key || !publisher || !item) {
  console.log("Chrome Web Store secrets aren't set; skipping the store upload.");
  process.exit(0);
}

const account = JSON.parse(key);
const base64url = (value) => Buffer.from(value).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
  JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/chromewebstore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
)}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${unsigned}.${signature}`,
  }),
});
if (!tokenResponse.ok)
  throw new Error(
    `Google refused the service account (${tokenResponse.status}): ${await tokenResponse.text()}`,
  );
const { access_token: token } = await tokenResponse.json();

const name = `publishers/${publisher}/items/${item}`;
const zip = readFileSync(
  fileURLToPath(new URL("../dist/slopify-studio-chrome.zip", import.meta.url)),
);
const upload = await fetch(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/zip" },
  body: zip,
});
const uploaded = await upload.text();
if (!upload.ok) {
  if (/version/i.test(uploaded)) {
    console.log(`The store already has this version; nothing new to publish. (${uploaded.trim()})`);
    process.exit(0);
  }
  throw new Error(`The Chrome Web Store refused the upload (${upload.status}): ${uploaded}`);
}
console.log(`Uploaded: ${uploaded.trim()}`);

const publish = await fetch(`https://chromewebstore.googleapis.com/v2/${name}:publish`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: "{}",
});
const published = await publish.text();
if (!publish.ok)
  throw new Error(`The Chrome Web Store refused to publish (${publish.status}): ${published}`);
console.log(`Submitted for review: ${published.trim()}`);
