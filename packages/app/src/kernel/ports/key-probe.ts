// The cheapest authenticated call a provider offers to check a key: a read of the account or
// of the model list. Nothing is generated and nothing is billed.
export interface KeyProbe {
  readonly url: string;
  readonly headers: (key: string) => Readonly<Record<string, string>>;
  // A provider that answers a key it does not recognise with something other than 401.
  readonly badKey?: (status: number, body: string) => boolean;
  // Whether a chosen model is reachable with this key: a read of that model, or of the model
  // list, with the same headers. Absent for a provider with no such read.
  readonly model?: ModelProbe;
}

export interface ModelProbe {
  readonly url: (model: string) => string;
  // For a list: whether `model` is in the answer, undefined when the answer can't be read.
  // Absent, a 2xx answer means the model is there and a 404 that it isn't.
  readonly lists?: (body: string, model: string) => boolean | undefined;
}

export type KeyProbes = Readonly<Record<string, KeyProbe>>;
