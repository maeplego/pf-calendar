import { describe, expect, it } from "vitest";
import { CALENDAR_BOOKING_CONFIRMED, buildBookingConfirmedEvent } from "./events.js";

describe("booking confirmed events", () => {
  it("builds a calendar.booking.confirmed envelope", () => {
    const event = buildBookingConfirmedEvent(
      {
        bookingId: "bk-1",
        eventTypeId: "et-1",
        externalRef: "job-42",
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
    expect(event.type).toBe(CALENDAR_BOOKING_CONFIRMED);
    expect(event.id.length).toBeGreaterThan(10);
    expect(event.data.externalRef).toBe("job-42");
    expect(event.occurredAt).toBe("2026-03-01T00:00:00Z");
  });
});
