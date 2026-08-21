export type Config = {
  env: "development" | "staging" | "production";
  port: number;
  databaseUrl: string;
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
  corsOrigin: string;
  internalToken: string;
};

function normalizeEnv(v: string | undefined): Config["env"] {
  switch ((v ?? "").trim().toLowerCase()) {
    case "":
    case "dev":
    case "development":
    case "local":
    case "demo":
      return "development";
    case "staging":
    case "stage":
      return "staging";
    case "production":
    case "prod":
      return "production";
    default:
      throw new Error(
        `unsupported CALENDAR_ENV ${JSON.stringify(v)} (use development, staging, or production)`,
      );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.CALENDAR_HTTP_PORT ?? "8095", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("CALENDAR_HTTP_PORT must be a positive integer");
  }
  const profile = normalizeEnv(env.CALENDAR_ENV);
  const oidcIssuer = env.OIDC_ISSUER?.trim() ?? "";
  const devAuth = env.CALENDAR_DEV_AUTH !== "false";
  if ((profile === "staging" || profile === "production") && devAuth) {
    throw new Error(`CALENDAR_DEV_AUTH must be false when CALENDAR_ENV=${profile}`);
  }
  if ((profile === "staging" || profile === "production") && !oidcIssuer) {
    throw new Error(`OIDC_ISSUER is required when CALENDAR_ENV=${profile}`);
  }
  return {
    env: profile,
    port,
    databaseUrl: env.CALENDAR_DATABASE_URL ?? "",
    devAuth,
    oidcIssuer,
    oidcInternalBase: env.OIDC_INTERNAL_BASE?.trim() ?? oidcIssuer,
    oidcAudience: env.OIDC_AUDIENCE?.trim() ?? "",
    corsOrigin: env.CALENDAR_CORS_ORIGIN?.trim() || "http://localhost:3005",
    internalToken: env.CALENDAR_INTERNAL_TOKEN?.trim() ?? "",
  };
}
