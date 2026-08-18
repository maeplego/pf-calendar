import {
  InvalidSlotInputError,
  RangeTooLongError,
  generateSlotStartsIso,
} from "@pf-calendar/slot-engine";
import { Hono } from "hono";
import { z } from "zod";
import type { Clock } from "./clock.js";
import { ConflictError, NotFoundError, type EventType, type Host } from "./domain.js";
import type { Store } from "./store.js";

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

const ruleSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
});

const overrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocked: z.boolean(),
});

const createSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive(),
  bufferMinutes: z.number().int().min(0).default(0),
  minNoticeMinutes: z.number().int().min(0).default(0),
  hostTimeZone: z.string().min(1),
  rules: z.array(ruleSchema).default([]),
});

const rulesBodySchema = z.object({ rules: z.array(ruleSchema) });
const overridesBodySchema = z.object({ overrides: z.array(overrideSchema) });

type Env = {
  Variables: {
    host: Host;
  };
};

export type AppDeps = {
  store: Store;
  clock: Clock;
  devAuth: boolean;
};

export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/ready", async (c) => {
    try {
      await deps.store.ping();
      return c.json({ ok: true });
    } catch (err) {
      console.error("ready check failed", err);
      return c.json({ ok: false }, 503);
    }
  });

  app.use("/v1/*", async (c, next) => {
    if (!deps.devAuth) {
      return c.json({ error: { code: "unauthorized", message: "OIDC is not wired yet; set CALENDAR_DEV_AUTH=true" } }, 401);
    }
    const sub = c.req.header("X-Dev-Host-Sub")?.trim();
    if (!sub) {
      return c.json({ error: { code: "unauthorized", message: "X-Dev-Host-Sub is required" } }, 401);
    }
    const host = await deps.store.ensureHost(sub);
    c.set("host", host);
    await next();
  });

  app.post("/v1/event-types", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalid(c, parsed.error.message);
    }
    try {
      const created = await deps.store.createEventType(c.get("host"), parsed.data);
      return c.json(publicEventType(created), 201);
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/v1/event-types", async (c) => {
    const rows = await deps.store.listEventTypes(c.get("host"));
    return c.json({ eventTypes: rows.map(publicEventType) });
  });

  app.get("/v1/event-types/:id", async (c) => {
    try {
      const row = await deps.store.getEventType(c.get("host"), c.req.param("id"));
      return c.json(publicEventType(row));
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.put("/v1/event-types/:id/rules", async (c) => {
    const parsed = rulesBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalid(c, parsed.error.message);
    }
    try {
      const row = await deps.store.replaceRules(c.get("host"), c.req.param("id"), parsed.data.rules);
      return c.json(publicEventType(row));
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.put("/v1/event-types/:id/overrides", async (c) => {
    const parsed = overridesBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalid(c, parsed.error.message);
    }
    try {
      const row = await deps.store.replaceOverrides(c.get("host"), c.req.param("id"), parsed.data.overrides);
      return c.json(publicEventType(row));
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/v1/event-types/:id/slots", async (c) => {
    const rangeStart = c.req.query("rangeStart");
    const rangeEnd = c.req.query("rangeEnd");
    if (!rangeStart || !rangeEnd) {
      return invalid(c, "rangeStart and rangeEnd are required Instant strings");
    }
    try {
      const row = await deps.store.getEventType(c.get("host"), c.req.param("id"));
      const starts = generateSlotStartsIso({
        durationMinutes: row.durationMinutes,
        bufferMinutes: row.bufferMinutes,
        minNoticeMinutes: row.minNoticeMinutes,
        hostTimeZone: row.hostTimeZone,
        rules: row.rules,
        overrides: row.overrides,
        existingBookings: [],
        rangeStart,
        rangeEnd,
        now: c.req.query("now") || deps.clock.nowIso(),
      });
      return c.json({ starts });
    } catch (err) {
      return mapError(c, err);
    }
  });

  return app;
}

function publicEventType(row: EventType) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    durationMinutes: row.durationMinutes,
    bufferMinutes: row.bufferMinutes,
    minNoticeMinutes: row.minNoticeMinutes,
    hostTimeZone: row.hostTimeZone,
    rules: row.rules,
    overrides: row.overrides,
  };
}

function invalid(c: { json: (body: unknown, status: 400) => Response }, message: string) {
  return c.json({ error: { code: "invalid_request", message } }, 400);
}

function mapError(c: { json: (body: unknown, status: 400 | 404 | 409 | 500) => Response }, err: unknown) {
  if (err instanceof NotFoundError) {
    return c.json({ error: { code: "not_found", message: "not found" } }, 404);
  }
  if (err instanceof ConflictError) {
    return c.json({ error: { code: "conflict", message: err.message } }, 409);
  }
  if (err instanceof InvalidSlotInputError || err instanceof RangeTooLongError) {
    return c.json({ error: { code: "invalid_request", message: err.message } }, 400);
  }
  console.error(err);
  return c.json({ error: { code: "internal", message: "internal error" } }, 500);
}
