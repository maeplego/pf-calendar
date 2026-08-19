/**
 * Hono cors `origin`. Empty string means do not send ACAO.
 * `*` is explicit opt-in only (tests); Compose defaults to the web origin.
 */
export function honoCorsOrigin(
  raw: string,
): string | ((origin: string) => string | undefined) {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes("*")) {
    return "*";
  }
  return (origin: string) => (parts.includes(origin) ? origin : undefined);
}

export function corsConfigured(raw: string | undefined): raw is string {
  return Boolean(raw?.split(",").map((s) => s.trim()).some(Boolean));
}
