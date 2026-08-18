import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./memory.js";
import { PostgresStore } from "./postgres.js";
import type { Store } from "./store.js";

const cfg = loadConfig();
const store: Store = cfg.databaseUrl ? await PostgresStore.connect(cfg.databaseUrl) : new MemoryStore();
if (!cfg.databaseUrl) {
  console.warn("CALENDAR_DATABASE_URL is empty; using in-memory store (not for shared demos)");
}

const app = createApp({ store, clock: systemClock, devAuth: cfg.devAuth });
serve({ fetch: app.fetch, port: cfg.port });
console.log(`calendar-api listening on :${cfg.port}`);
