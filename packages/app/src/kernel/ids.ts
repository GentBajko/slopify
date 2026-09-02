import { ulid } from "ulid";

export interface Ids {
  readonly next: () => string;
}

export const ulidIds: Ids = {
  next: (): string => ulid(),
};
