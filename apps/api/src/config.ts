export type Config = {
  port: number;
  databaseUrl: string;
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
  corsOrigin: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.CALENDAR_HTTP_PORT ?? "8095", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("CALENDAR_HTTP_PORT must be a positive integer");
  }
  const oidcIssuer = env.OIDC_ISSUER?.trim() ?? "";
  return {
    port,
    databaseUrl: env.CALENDAR_DATABASE_URL ?? "",
    devAuth: env.CALENDAR_DEV_AUTH !== "false",
    oidcIssuer,
    oidcInternalBase: env.OIDC_INTERNAL_BASE?.trim() ?? oidcIssuer,
    oidcAudience: env.OIDC_AUDIENCE?.trim() ?? "",
    corsOrigin: env.CALENDAR_CORS_ORIGIN?.trim() || "*",
  };
}
