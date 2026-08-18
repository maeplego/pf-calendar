import { describe, expect, it } from "vitest";
import { createHostAuth } from "./auth.js";
import { createApp } from "./app.js";
import type { Clock } from "./clock.js";
import { MemoryStore } from "./memory.js";
import { CALENDAR_BOOKING_CONFIRMED, buildBookingConfirmedEvent } from "./events.js";

function testApp() {
  const clock: Clock = { nowIso: () => "2026-03-01T00:00:00Z" };
  const store = new MemoryStore();
  const hostAuth = createHostAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
  return createApp({
    store,
    clock,
    hostAuth,
    corsOrigin: "*",
  });
}

describe("webhooks/calendar", () => {
  it("accepts calendar.booking.confirmed with matching header", async () => {
    const app = testApp();
    const event = buildBookingConfirmedEvent(
      {
        bookingId: "bk-1",
        eventTypeId: "et-1",
        externalRef: "job-1",
        hostSub: "employer-1",
        slug: "interview-30",
        start: "2026-03-02T00:00:00Z",
        end: "2026-03-02T00:30:00Z",
        guestName: "Guest A",
        guestEmail: "a@example.test",
        guestTimeZone: "America/Los_Angeles",
      },
      "2026-03-01T00:00:00Z",
    );

    const res = await app.request("/webhooks/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calendar-Event-Type": CALENDAR_BOOKING_CONFIRMED,
      },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects mismatched X-Calendar-Event-Type header", async () => {
    const app = testApp();
    const event = buildBookingConfirmedEvent(
      {
        bookingId: "bk-1",
        eventTypeId: "et-1",
        externalRef: "job-1",
        hostSub: "employer-1",
        slug: "interview-30",
        start: "2026-03-02T00:00:00Z",
        end: "2026-03-02T00:30:00Z",
        guestName: "Guest A",
        guestEmail: "a@example.test",
        guestTimeZone: "America/Los_Angeles",
      },
      "2026-03-01T00:00:00Z",
    );

    const res = await app.request("/webhooks/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calendar-Event-Type": "some.other.event",
      },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing X-Calendar-Event-Type header", async () => {
    const app = testApp();
    const event = buildBookingConfirmedEvent(
      {
        bookingId: "bk-1",
        eventTypeId: "et-1",
        externalRef: "job-1",
        hostSub: "employer-1",
        slug: "interview-30",
        start: "2026-03-02T00:00:00Z",
        end: "2026-03-02T00:30:00Z",
        guestName: "Guest A",
        guestEmail: "a@example.test",
        guestTimeZone: "America/Los_Angeles",
      },
      "2026-03-01T00:00:00Z",
    );

    const res = await app.request("/webhooks/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(400);
  });
});

