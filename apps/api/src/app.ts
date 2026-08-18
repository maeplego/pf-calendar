import { Temporal } from "@js-temporal/polyfill";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  InvalidSlotInputError,
  RangeTooLongError,
} from "@pf-calendar/slot-engine";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { HostAuth } from "./auth.js";
import type { Clock } from "./clock.js";
import { ConflictError, NotFoundError, SlotUnavailableError, type EventType, type Host } from "./domain.js";
import { isOfferedStart, offeredStartIsos } from "./slots.js";
import type { Store } from "./store.js";
import { CALENDAR_BOOKING_CONFIRMED, buildBookingConfirmedEvent } from "./events.js";
import { buildBookingIcs } from "./ics.js";
import { newCancelToken } from "./tokens.js";

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

// P10 webhook (dev stub): worker outbox deliveries are POSTed here.
const calendarBookingConfirmedWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.literal(CALENDAR_BOOKING_CONFIRMED),
  occurredAt: z.string().min(1),
  data: z.object({
    bookingId: z.string().min(1),
    eventTypeId: z.string().min(1),
    externalRef: z.string().min(1).optional(),
    hostSub: z.string().min(1),
    slug: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    guestName: z.string().min(1),
    guestEmail: z.string().min(1),
    guestTimeZone: z.string().min(1),
  }),
});

const bookSchema = z.object({
  slotStart: z.string().min(1),
  name: z.string().min(1).max(80),
  email: z.string().email().max(254),
  guestTimeZone: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
});

type Env = {
  Variables: {
    host: Host;
  };
};

const internalCreateSchema = createSchema.extend({
  hostSub: z.string().min(1).max(256),
  externalRef: z.string().min(1).max(128).optional(),
});

export type AppDeps = {
  store: Store;
  clock: Clock;
  hostAuth: HostAuth;
  corsOrigin?: string;
  internalToken?: string;
};

const openapiPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "openapi",
  "openapi.yaml",
);

export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();

  app.use(
    "/public/*",
    cors({
      origin: deps.corsOrigin ?? "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.post("/public/bookings/cancel", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { cancelToken?: string } | null;
    const cancelToken = body?.cancelToken?.trim();
    if (!cancelToken) {
      return invalid(c, "cancelToken is required");
    }
    try {
      const booking = await deps.store.cancelBookingByToken(cancelToken);
      return c.json({
        id: booking.id,
        status: booking.status,
        start: booking.start,
        end: booking.end,
      });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/public/bookings/ics", async (c) => {
    const cancelToken = c.req.query("token")?.trim();
    if (!cancelToken) {
      return invalid(c, "token query parameter is required");
    }
    const row = await deps.store.getBookingByCancelToken(cancelToken);
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    const ics = buildBookingIcs({
      uid: row.booking.id,
      summary: row.eventTypeName,
      description: `Booking with ${row.booking.guestName}`,
      start: row.booking.start,
      end: row.booking.end,
      guestTimeZone: row.booking.guestTimeZone,
      hostTimeZone: row.hostTimeZone,
    });
    return c.body(ics, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${row.booking.id}.ics"`,
    });
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/openapi.yaml", async (c) => {
    const yaml = await readFile(openapiPath, "utf8");
    return c.body(yaml, 200, { "Content-Type": "application/yaml; charset=utf-8" });
  });

  // Dev/stub endpoint for outbox webhook deliveries.
  // P10 will replace this with a real integration receiver.
  app.post("/webhooks/calendar", async (c) => {
    const headerType = c.req.header("X-Calendar-Event-Type")?.trim() ?? "";
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!body || !headerType) {
      return invalid(c as { json: (body: unknown, status: 400) => Response }, "invalid webhook payload");
    }

    const parsed = calendarBookingConfirmedWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return invalid(c as { json: (body: unknown, status: 400) => Response }, "invalid webhook payload");
    }
    if (headerType !== parsed.data.type) {
      return invalid(c as { json: (body: unknown, status: 400) => Response }, "invalid webhook event type");
    }
    return c.json({ ok: true });
  });
  app.get("/ready", async (c) => {
    try {
      await deps.store.ping();
      return c.json({ ok: true });
    } catch (err) {
      console.error("ready check failed", err);
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/public/:slug/slots", async (c) => {
    const rangeStart = c.req.query("rangeStart");
    const rangeEnd = c.req.query("rangeEnd");
    if (!rangeStart || !rangeEnd) {
      return invalid(c, "rangeStart and rangeEnd are required Instant strings");
    }
    try {
      const row = await deps.store.getEventTypeBySlug(c.req.param("slug"));
      const bookings = await deps.store.listConfirmedBookings(row.id);
      const starts = offeredStartIsos(
        row,
        engineBookings(bookings),
        rangeStart,
        rangeEnd,
        c.req.query("now") || deps.clock.nowIso(),
      );
      return c.json({
        slug: row.slug,
        name: row.name,
        durationMinutes: row.durationMinutes,
        hostTimeZone: row.hostTimeZone,
        starts,
      });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.post("/public/:slug/book", async (c) => {
    const parsed = bookSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalid(c, parsed.error.message);
    }
    try {
      validateTimeZone(parsed.data.guestTimeZone);
      const row = await deps.store.getEventTypeBySlug(c.req.param("slug"));
      const slotStart = Temporal.Instant.from(parsed.data.slotStart);
      const slotEnd = slotStart.add({ minutes: row.durationMinutes });
      const email = parsed.data.email.trim().toLowerCase();
      const existing = await deps.store.findBookingByIdempotency(row.id, parsed.data.idempotencyKey);
      if (existing) {
        const same =
          Temporal.Instant.compare(Temporal.Instant.from(existing.start), slotStart) === 0 &&
          Temporal.Instant.compare(Temporal.Instant.from(existing.end), slotEnd) === 0 &&
          existing.guestEmail === email;
        if (!same) {
          throw new ConflictError("idempotency key reused with a different request");
        }
        return c.json(
          {
            id: existing.id,
            start: existing.start,
            end: existing.end,
            guestTimeZone: existing.guestTimeZone,
          },
          200,
        );
      }
      const bookings = await deps.store.listConfirmedBookings(row.id);
      const now = deps.clock.nowIso();
      // クライアントの「この Instant が空」は信じない。ホスト現地のその日を再計算する。
      if (!isOfferedStart(row, engineBookings(bookings), slotStart, now)) {
        throw new SlotUnavailableError();
      }
      const cancel = newCancelToken();
      const result = await deps.store.createBooking(row, {
        start: slotStart.toString(),
        end: slotEnd.toString(),
        guestName: parsed.data.name,
        guestEmail: email,
        guestTimeZone: parsed.data.guestTimeZone,
        idempotencyKey: parsed.data.idempotencyKey,
        cancelTokenHash: cancel.hash,
      });
      const body: Record<string, unknown> = {
        id: result.booking.id,
        start: result.booking.start,
        end: result.booking.end,
        guestTimeZone: result.booking.guestTimeZone,
      };
      if (result.created) {
        body.cancelToken = cancel.token;
        const host = await deps.store.getHostForEventType(row.id);
        await deps.store.enqueueOutboxEvent(
          buildBookingConfirmedEvent(
            {
              bookingId: result.booking.id,
              eventTypeId: row.id,
              externalRef: row.externalRef,
              hostSub: host.sub,
              slug: row.slug,
              start: result.booking.start,
              end: result.booking.end,
              guestName: result.booking.guestName,
              guestEmail: result.booking.guestEmail,
              guestTimeZone: result.booking.guestTimeZone,
            },
            deps.clock.nowIso(),
          ),
        );
      }
      return c.json(body, result.created ? 201 : 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.use("/v1/*", async (c, next) => {
    const sub = await deps.hostAuth.resolveSub(c.req.raw.headers);
    if (!sub) {
      return c.json(
        { error: { code: "unauthorized", message: "host authentication required (Bearer token or dev header)" } },
        401,
      );
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
      const bookings = await deps.store.listConfirmedBookings(row.id);
      const starts = offeredStartIsos(
        row,
        engineBookings(bookings),
        rangeStart,
        rangeEnd,
        c.req.query("now") || deps.clock.nowIso(),
      );
      return c.json({ starts });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/v1/event-types/:id/bookings", async (c) => {
    try {
      const row = await deps.store.getEventType(c.get("host"), c.req.param("id"));
      const bookings = await deps.store.listConfirmedBookings(row.id);
      return c.json({
        bookings: bookings.map((b) => ({
          id: b.id,
          start: b.start,
          end: b.end,
          guestName: b.guestName,
          guestEmail: b.guestEmail,
          guestTimeZone: b.guestTimeZone,
          status: b.status,
        })),
      });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.use("/internal/v1/*", async (c, next) => {
    if (!deps.internalToken) {
      return c.json({ error: { code: "unavailable", message: "internal API is disabled" } }, 503);
    }
    const auth = c.req.header("Authorization")?.trim() ?? "";
    if (auth !== `Bearer ${deps.internalToken}`) {
      return c.json({ error: { code: "unauthorized", message: "invalid internal token" } }, 401);
    }
    await next();
  });

  app.post("/internal/v1/event-types", async (c) => {
    const parsed = internalCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return invalid(c, parsed.error.message);
    }
    try {
      const host = await deps.store.ensureHost(parsed.data.hostSub);
      if (parsed.data.externalRef) {
        const existing = await deps.store.findEventTypeByExternalRef(host, parsed.data.externalRef);
        if (existing) {
          return c.json(publicEventType(existing), 200);
        }
      }
      const { hostSub: _hostSub, externalRef, ...input } = parsed.data;
      const created = await deps.store.createEventType(host, { ...input, externalRef });
      return c.json(publicEventType(created), 201);
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/internal/v1/hosts/:sub/event-types", async (c) => {
    try {
      const host = await deps.store.ensureHost(c.req.param("sub"));
      const rows = await deps.store.listEventTypes(host);
      return c.json({ eventTypes: rows.map(publicEventType) });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.get("/internal/v1/bookings/:id", async (c) => {
    const row = await deps.store.getBookingWithEventById(c.req.param("id"));
    if (!row) {
      return c.json({ error: { code: "not_found", message: "not found" } }, 404);
    }
    return c.json({
      booking: {
        id: row.booking.id,
        eventTypeId: row.booking.eventTypeId,
        start: row.booking.start,
        end: row.booking.end,
        guestName: row.booking.guestName,
        guestEmail: row.booking.guestEmail,
        guestTimeZone: row.booking.guestTimeZone,
        status: row.booking.status,
      },
      eventType: {
        slug: row.eventSlug,
        name: row.eventTypeName,
        hostTimeZone: row.hostTimeZone,
      },
    });
  });

  return app;
}

function engineBookings(bookings: { start: string; end: string }[]) {
  return bookings.map((b) => ({ start: b.start, end: b.end }));
}

function validateTimeZone(timeZone: string): void {
  Temporal.ZonedDateTime.from({ year: 1970, month: 1, day: 1, timeZone });
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
    externalRef: row.externalRef,
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
  if (err instanceof SlotUnavailableError) {
    return c.json({ error: { code: "slot_unavailable", message: "slot unavailable" } }, 409);
  }
  if (err instanceof ConflictError) {
    const unavailable = err.message === "slot unavailable";
    return c.json(
      { error: { code: unavailable ? "slot_unavailable" : "conflict", message: err.message } },
      409,
    );
  }
  if (err instanceof InvalidSlotInputError || err instanceof RangeTooLongError) {
    return c.json({ error: { code: "invalid_request", message: err.message } }, 400);
  }
  if (err instanceof RangeError || (err instanceof Error && err.name === "RangeError")) {
    return c.json({ error: { code: "invalid_request", message: err.message } }, 400);
  }
  console.error(err);
  return c.json({ error: { code: "internal", message: "internal error" } }, 500);
}
