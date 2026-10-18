import type { ModelAccess } from "../kernel/ports/model.js";

// Whether a provider's failure says the account can't use the chosen model. Read from the
// status and the provider's own words, since only the adapter sees them; it never changes the
// error's kind, so a run fails exactly as before. Undefined: the failure says nothing about
// the model.

// Not-found comes first: OpenAI's "does not exist or you do not have access to it" is about a
// model id, not a plan. The loose phrases count only when the text is about a model, so a
// voice or a file that does not exist is not mistaken for one.
const notFound =
  /model_not_found|not a valid model|model not found|no endpoints found|invalid model|unknown model|is not found for api version|models\/[^ ]+ is not found/i;
const looseNotFound = /does not exist|may not exist|not[_ ]found/i;
const noAccess =
  /not supported when using codex with a chatgpt account|not (?:available|included|supported) (?:on|in|for|with) your (?:current )?(?:plan|account|subscription|tier|region|country)|upgrade your (?:plan|subscription)|must be verified to use the model|does not have access to (?:the )?model|do not have access to (?:this|the) model|not allowed to (?:use|access) (?:this|the) model|requires a paid plan/i;
const mentionsModel = /\bmodel/i;

// `atModel`: the request went to the model's own address (fal.ai's and Replicate's endpoints,
// Google's models/<id>), so a 404 or 403 there is about the model whatever the words say.
export function modelAccessOf(
  status: number | null,
  text: string,
  atModel = false,
): ModelAccess | undefined {
  if (notFound.test(text)) return "not-found";
  // "Upgrade your plan" or "not found" alone is as often about credits, a voice or a feature
  // as about a model.
  if (mentionsModel.test(text)) {
    if (looseNotFound.test(text)) return "not-found";
    if (noAccess.test(text)) return "no-access";
  } else if (!atModel) return undefined;
  if (status === 404) return "not-found";
  if (status === 403) return "no-access";
  return undefined;
}

// Spread into a providerError init.
export function accessField(
  status: number | null,
  text: string,
  atModel = false,
): { readonly access?: ModelAccess } {
  const access = modelAccessOf(status, text, atModel);
  return access === undefined ? {} : { access };
}
