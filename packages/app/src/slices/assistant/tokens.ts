import { createHash, randomBytes } from "node:crypto";
import type { AssistantTurnAccess, AssistantTurnTokens } from "./access.js";

// Each turn's token: 32 random bytes, made when the turn starts and revoked when it ends, so
// a CLI left running, or anything that read its environment, opens nothing afterwards. The
// token itself is never stored or logged: only its hash is kept, which also means a lookup
// compares no secret byte by byte.

export interface TurnTokens extends AssistantTurnTokens {
  readonly mint: (access: AssistantTurnAccess) => string;
  readonly revoke: (token: string) => void;
}

function keyOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createTurnTokens(): TurnTokens {
  const live = new Map<string, AssistantTurnAccess>();
  return {
    mint: (access) => {
      const token = randomBytes(32).toString("base64url");
      live.set(keyOf(token), access);
      return token;
    },
    revoke: (token) => {
      live.delete(keyOf(token));
    },
    resolve: (token) => live.get(keyOf(token)),
  };
}
