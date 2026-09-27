// The cheapest authenticated call a provider offers to check a key: a read of the account or
// of the model list. Nothing is generated and nothing is billed.
export interface KeyProbe {
  readonly url: string;
  readonly headers: (key: string) => Readonly<Record<string, string>>;
  // A provider that answers a key it does not recognise with something other than 401.
  readonly badKey?: (status: number, body: string) => boolean;
}
export type KeyProbes = Readonly<Record<string, KeyProbe>>;
