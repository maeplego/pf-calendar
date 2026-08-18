export type Config = {
  port: number;
  databaseUrl: string;
  devAuth: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.CALENDAR_HTTP_PORT ?? "8095", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("CALENDAR_HTTP_PORT must be a positive integer");
  }
  return {
    port,
    databaseUrl: env.CALENDAR_DATABASE_URL ?? "",
    devAuth: env.CALENDAR_DEV_AUTH !== "false",
  };
}
