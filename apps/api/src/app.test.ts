import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
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

function testApp(now = tokyoInstant("2026-03-01T00:00:00")) {
  const clock: Clock = { nowIso: () => now };
  const store = new MemoryStore();
  return createApp({ store, clock, devAuth: true });
}

function hostHeaders(sub = "host-a"): Record<string, string> {
  return { "X-Dev-Host-Sub": sub, "Content-Type": "application/json" };
}

describe("calendar API event types", () => {
  it("creates an event type and lists it for the same host only", async () => {
    const app = testApp();
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
    const app = testApp();
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
    const app = testApp();
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
    const app = testApp();
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
    const app = testApp();
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
    const app = testApp();
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
    const app = testApp();
    const res = await app.request("/v1/event-types");
    expect(res.status).toBe(401);
  });

  it("reports health without a host header", async () => {
    const app = testApp();
    const health = await app.request("/health");
    const ready = await app.request("/ready");
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});
