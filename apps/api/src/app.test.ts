import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { createHostAuth } from "./auth.js";
import { createApp } from "./app.js";
import type { Clock } from "./clock.js";
import { MemoryStore } from "./memory.js";

const TOKYO = "Asia/Tokyo";

function tokyoInstant(plain: string): string {
  return Temporal.PlainDateTime.from(plain).toZonedDateTime(TOKYO).toInstant().toString();
}

const weekdayRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startLocal: "09:00",
  endLocal: "12:00",
}));

import { CALENDAR_BOOKING_CONFIRMED } from "./events.js";

function testApp(now = tokyoInstant("2026-03-01T00:00:00"), internalToken = "test-internal") {
  const clock: Clock = { nowIso: () => now };
  const store = new MemoryStore();
  const app = createApp({
    store,
    clock,
    hostAuth: createHostAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" }),
    internalToken,
  });
  return { app, store };
}

function internalHeaders(token = "test-internal"): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function hostHeaders(sub = "host-a"): Record<string, string> {
  return { "X-Dev-Host-Sub": sub, "Content-Type": "application/json" };
}

const mondayStart = () => tokyoInstant("2026-03-02T09:00:00");
const mondayRange = () =>
  `rangeStart=${encodeURIComponent(tokyoInstant("2026-03-02T00:00:00"))}&rangeEnd=${encodeURIComponent(tokyoInstant("2026-03-03T00:00:00"))}`;

function bookBody(overrides: Record<string, unknown> = {}) {
  return {
    slotStart: mondayStart(),
    name: "Guest A",
    email: "a@example.test",
    guestTimeZone: "America/Los_Angeles",
    idempotencyKey: "idem-aaaaaaaa",
    ...overrides,
  };
}

describe("calendar API event types", () => {
  it("creates an event type and lists it for the same host only", async () => {
    const { app } = testApp();
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug: "casual-30",
        name: "Casual 30",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; slug: string; rules: unknown[] };
    expect(body.slug).toBe("casual-30");
    expect(body.rules).toHaveLength(5);

    const listed = await app.request("/v1/event-types", { headers: hostHeaders() });
    const listBody = (await listed.json()) as { eventTypes: { id: string }[] };
    expect(listBody.eventTypes).toHaveLength(1);

    const other = await app.request(`/v1/event-types/${body.id}`, { headers: hostHeaders("host-b") });
    expect(other.status).toBe(404);
  });

  it("computes Tokyo weekday slots from stored rules via slot-engine", async () => {
    const { app } = testApp();
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug: "tokyo-am",
        name: "Tokyo AM",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const slots = await app.request(
      `/v1/event-types/${id}/slots?rangeStart=${encodeURIComponent(tokyoInstant("2026-03-02T00:00:00"))}&rangeEnd=${encodeURIComponent(tokyoInstant("2026-03-03T00:00:00"))}`,
      { headers: hostHeaders() },
    );
    expect(slots.status).toBe(200);
    const body = (await slots.json()) as { starts: string[] };
    expect(body.starts).toEqual([
      tokyoInstant("2026-03-02T09:00:00"),
      tokyoInstant("2026-03-02T09:30:00"),
      tokyoInstant("2026-03-02T10:00:00"),
      tokyoInstant("2026-03-02T10:30:00"),
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
  });

  it("emits no slots on a blocked override date", async () => {
    const { app } = testApp();
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug: "blocked-day",
        name: "Blocked",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const updated = await app.request(`/v1/event-types/${id}/overrides`, {
      method: "PUT",
      headers: hostHeaders(),
      body: JSON.stringify({ overrides: [{ date: "2026-03-02", blocked: true }] }),
    });
    expect(updated.status).toBe(200);
    const slots = await app.request(
      `/v1/event-types/${id}/slots?rangeStart=${encodeURIComponent(tokyoInstant("2026-03-02T00:00:00"))}&rangeEnd=${encodeURIComponent(tokyoInstant("2026-03-03T00:00:00"))}`,
      { headers: hostHeaders() },
    );
    const body = (await slots.json()) as { starts: string[] };
    expect(body.starts).toEqual([]);
  });

  it("replaces availability rules", async () => {
    const { app } = testApp();
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug: "replace-rules",
        name: "Rules",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const updated = await app.request(`/v1/event-types/${id}/rules`, {
      method: "PUT",
      headers: hostHeaders(),
      body: JSON.stringify({
        rules: [{ dayOfWeek: 1, startLocal: "14:00", endLocal: "15:00" }],
      }),
    });
    expect(updated.status).toBe(200);
    const monday = await app.request(
      `/v1/event-types/${id}/slots?rangeStart=${encodeURIComponent(tokyoInstant("2026-03-02T00:00:00"))}&rangeEnd=${encodeURIComponent(tokyoInstant("2026-03-03T00:00:00"))}`,
      { headers: hostHeaders() },
    );
    const mondayBody = (await monday.json()) as { starts: string[] };
    expect(mondayBody.starts).toEqual([tokyoInstant("2026-03-02T14:00:00"), tokyoInstant("2026-03-02T14:30:00")]);
  });

  it("rejects a range longer than 14 days", async () => {
    const { app } = testApp();
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug: "long-range",
        name: "Long",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    const { id } = (await created.json()) as { id: string };
    const slots = await app.request(
      `/v1/event-types/${id}/slots?rangeStart=${encodeURIComponent(tokyoInstant("2026-03-02T00:00:00"))}&rangeEnd=${encodeURIComponent(tokyoInstant("2026-03-17T00:00:01"))}`,
      { headers: hostHeaders() },
    );
    expect(slots.status).toBe(400);
  });

  it("rejects a duplicate slug", async () => {
    const { app } = testApp();
    const body = {
      slug: "dup",
      name: "Dup",
      durationMinutes: 30,
      hostTimeZone: TOKYO,
      rules: [],
    };
    const first = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(201);
    const second = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders("other-host"),
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(409);
  });

  it("requires the demo host header", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/event-types");
    expect(res.status).toBe(401);
  });

  it("reports health without a host header", async () => {
    const { app } = testApp();
    const health = await app.request("/health");
    const ready = await app.request("/ready");
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it("serves the OpenAPI document", async () => {
    const { app } = testApp();
    const res = await app.request("/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("yaml");
    const text = await res.text();
    expect(text).toContain("openapi: 3.1.0");
    expect(text).toContain("/public/{slug}/book");
  });
});

describe("public booking", () => {
  async function seedTokyo(app: ReturnType<typeof testApp>["app"], slug = "public-30") {
    const created = await app.request("/v1/event-types", {
      method: "POST",
      headers: hostHeaders(),
      body: JSON.stringify({
        slug,
        name: "Public 30",
        durationMinutes: 30,
        hostTimeZone: TOKYO,
        rules: weekdayRules,
      }),
    });
    expect(created.status).toBe(201);
    return slug;
  }

  it("lists public slots without host auth and without guest PII", async () => {
    const { app } = testApp();
    await seedTokyo(app);
    const slots = await app.request(`/public/public-30/slots?${mondayRange()}`);
    expect(slots.status).toBe(200);
    const body = (await slots.json()) as Record<string, unknown>;
    expect(body.starts).toEqual([
      tokyoInstant("2026-03-02T09:00:00"),
      tokyoInstant("2026-03-02T09:30:00"),
      tokyoInstant("2026-03-02T10:00:00"),
      tokyoInstant("2026-03-02T10:30:00"),
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/@/);
    expect(body).not.toHaveProperty("guestName");
  });

  it("books an offered slot and hides it afterwards", async () => {
    const { app } = testApp();
    await seedTokyo(app);
    const booked = await app.request("/public/public-30/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody()),
    });
    expect(booked.status).toBe(201);
    const created = (await booked.json()) as { id: string; cancelToken: string; start: string };
    expect(created.cancelToken.length).toBeGreaterThan(20);
    expect(created.start).toBe(mondayStart());

    const slots = await app.request(`/public/public-30/slots?${mondayRange()}`);
    const body = (await slots.json()) as { starts: string[] };
    expect(body.starts).not.toContain(mondayStart());

    const hostBookings = await app.request("/v1/event-types/" + (await eventId(app)) + "/bookings", {
      headers: hostHeaders(),
    });
    const listed = (await hostBookings.json()) as { bookings: { guestEmail: string }[] };
    expect(listed.bookings).toHaveLength(1);
    expect(listed.bookings[0].guestEmail).toBe("a@example.test");
  });

  it("lets only one of two concurrent books for the same slot succeed", async () => {
    const { app } = testApp();
    await seedTokyo(app, "race-30");
    const [a, b] = await Promise.all([
      app.request("/public/race-30/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookBody({ email: "a@example.test", idempotencyKey: "idem-race-a" })),
      }),
      app.request("/public/race-30/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookBody({ email: "b@example.test", idempotencyKey: "idem-race-b" })),
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    const err = (await failed.json()) as { error: { code: string; message: string } };
    expect(err.error.code).toBe("slot_unavailable");
    expect(err.error.message).toBe("slot unavailable");
    expect(JSON.stringify(err)).not.toMatch(/@/);
  });

  it("rejects a client-invented Instant that is not an offered slot", async () => {
    const { app } = testApp();
    await seedTokyo(app, "invented");
    const booked = await app.request("/public/invented/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ slotStart: tokyoInstant("2026-03-02T08:00:00"), idempotencyKey: "idem-invent" })),
    });
    expect(booked.status).toBe(409);
  });

  it("replays the same idempotency key without issuing a second cancel token", async () => {
    const { app } = testApp();
    await seedTokyo(app, "idem-30");
    const first = await app.request("/public/idem-30/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-same-key" })),
    });
    expect(first.status).toBe(201);
    const second = await app.request("/public/idem-30/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-same-key" })),
    });
    expect(second.status).toBe(200);
    const replay = (await second.json()) as { cancelToken?: string; id: string };
    expect(replay.cancelToken).toBeUndefined();
  });

  it("cancels a booking with the cancel token and frees the slot", async () => {
    const { app } = testApp();
    await seedTokyo(app, "cancel-me");
    const booked = await app.request("/public/cancel-me/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-cancel-me" })),
    });
    expect(booked.status).toBe(201);
    const created = (await booked.json()) as { cancelToken: string };
    const cancelled = await app.request("/public/bookings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelToken: created.cancelToken }),
    });
    expect(cancelled.status).toBe(200);
    const body = (await cancelled.json()) as { status: string };
    expect(body.status).toBe("cancelled");

    const slots = await app.request(`/public/cancel-me/slots?${mondayRange()}`);
    const slotBody = (await slots.json()) as { starts: string[] };
    expect(slotBody.starts).toContain(mondayStart());
  });

  it("returns not found for an invalid cancel token without leaking email", async () => {
    const { app } = testApp();
    const res = await app.request("/public/bookings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelToken: "not-a-real-token-value-here-xxxxxxxx" }),
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/@/);
  });

  it("enqueues calendar.booking.confirmed on a new booking only", async () => {
    const { app, store } = testApp();
    await seedTokyo(app, "evt-book");
    const booked = await app.request("/public/evt-book/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-event-1" })),
    });
    expect(booked.status).toBe(201);
    expect(store.outboxEvents).toHaveLength(1);
    expect(store.outboxEvents[0].type).toBe(CALENDAR_BOOKING_CONFIRMED);
    expect(store.outboxEvents[0].data.slug).toBe("evt-book");
    expect(store.outboxEvents[0].data.hostSub).toBe("host-a");

    const replay = await app.request("/public/evt-book/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-event-1" })),
    });
    expect(replay.status).toBe(200);
    expect(store.outboxEvents).toHaveLength(1);
  });

  it("serves ICS for a confirmed booking token", async () => {
    const { app } = testApp();
    await seedTokyo(app, "ics-me");
    const booked = await app.request("/public/ics-me/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-ics" })),
    });
    const created = (await booked.json()) as { cancelToken: string };
    const ics = await app.request(`/public/bookings/ics?token=${encodeURIComponent(created.cancelToken)}`);
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const text = await ics.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("DTSTART:20260302T000000Z");
  });
});

describe("internal API", () => {
  it("creates an event type for a host sub with externalRef idempotency", async () => {
    const { app } = testApp();
    const first = await app.request("/internal/v1/event-types", {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        hostSub: "employer-1",
        slug: "interview-job-1",
        name: "Interview 30",
        durationMinutes: 30,
        hostTimeZone: "Asia/Tokyo",
        externalRef: "job-1",
        rules: weekdayRules,
      }),
    });
    expect(first.status).toBe(201);
    const second = await app.request("/internal/v1/event-types", {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        hostSub: "employer-1",
        slug: "interview-job-1-other",
        name: "Interview 30",
        durationMinutes: 30,
        hostTimeZone: "Asia/Tokyo",
        externalRef: "job-1",
        rules: weekdayRules,
      }),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { externalRef: string; slug: string };
    expect(body.externalRef).toBe("job-1");
    expect(body.slug).toBe("interview-job-1");
  });

  it("lists event types for a host sub", async () => {
    const { app } = testApp();
    await app.request("/internal/v1/event-types", {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        hostSub: "employer-2",
        slug: "interview-2",
        name: "Interview",
        durationMinutes: 30,
        hostTimeZone: "Asia/Tokyo",
        rules: weekdayRules,
      }),
    });
    const listed = await app.request("/internal/v1/hosts/employer-2/event-types", { headers: internalHeaders() });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { eventTypes: { slug: string }[] };
    expect(body.eventTypes).toHaveLength(1);
  });

  it("returns a booking with event metadata for P10", async () => {
    const { app } = testApp();
    await app.request("/internal/v1/event-types", {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        hostSub: "employer-3",
        slug: "p10-book",
        name: "P10 Interview",
        durationMinutes: 30,
        hostTimeZone: "Asia/Tokyo",
        rules: weekdayRules,
      }),
    });
    const listed = await app.request("/internal/v1/hosts/employer-3/event-types", { headers: internalHeaders() });
    const { eventTypes } = (await listed.json()) as { eventTypes: { slug: string }[] };
    const booked = await app.request("/public/p10-book/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookBody({ idempotencyKey: "idem-p10" })),
    });
    expect(booked.status).toBe(201);
    const created = (await booked.json()) as { id: string };
    const got = await app.request(`/internal/v1/bookings/${created.id}`, { headers: internalHeaders() });
    expect(got.status).toBe(200);
    const detail = (await got.json()) as { booking: { guestEmail: string }; eventType: { slug: string } };
    expect(detail.eventType.slug).toBe("p10-book");
    expect(detail.booking.guestEmail).toBe("a@example.test");
    expect(eventTypes[0].slug).toBe("p10-book");
  });

  it("rejects internal calls without a token", async () => {
    const { app } = testApp();
    const res = await app.request("/internal/v1/hosts/x/event-types", { headers: { Authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
  });
});

async function eventId(app: ReturnType<typeof testApp>["app"]): Promise<string> {
  const listed = await app.request("/v1/event-types", { headers: hostHeaders() });
  const body = (await listed.json()) as { eventTypes: { id: string }[] };
  return body.eventTypes[0].id;
}
