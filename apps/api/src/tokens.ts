import { createHash, randomBytes } from "node:crypto";

/** 平文トークンは呼び出し側がゲストへ一度だけ返す。ログに出さない。 */
export function newCancelToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashCancelToken(token) };
}

export function hashCancelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
