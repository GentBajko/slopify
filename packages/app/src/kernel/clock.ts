export interface Clock {
  readonly now: () => Date;
}

export const systemClock: Clock = {
  now: (): Date => new Date(),
};
