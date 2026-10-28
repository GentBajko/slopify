// The model a service starts with when Slopify picks it for the person (a first short, the
// writer and voice Create fills in): a fast, capable default rather than the first listed,
// which can be the slowest or the smallest. One rule, so a service names the same model
// wherever it was picked for the person.
const preferred: Readonly<Record<string, RegExp>> = {
  "claude-code": /sonnet/i,
  "openai-tts": /^gpt-4o-mini-tts$/,
};

export function isPreferredModel(provider: string, model: string): boolean {
  return preferred[provider]?.test(model) === true;
}

export function preferredModel<T extends { readonly id: string }>(
  provider: string,
  models: readonly T[],
): T | undefined {
  return models.find((model) => isPreferredModel(provider, model.id)) ?? models[0];
}
