export interface RequestMemory {
  readonly payload: string;
  readonly idempotencyKey: string;
}
export function requestFor(
  previous: RequestMemory | undefined,
  payload: unknown,
  newId: () => string,
): RequestMemory {
  const serialized = JSON.stringify(payload);
  return previous?.payload === serialized
    ? previous
    : { payload: serialized, idempotencyKey: newId() };
}
