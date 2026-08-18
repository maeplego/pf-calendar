import { describe, expect, it } from "vitest";
import { buildBookingIcs } from "./ics.js";

describe("buildBookingIcs", () => {
  it("emits UTC DTSTART/DTEND and a VEVENT block", () => {
    const body = buildBookingIcs({
      uid: "booking-1",
      summary: "Casual 30",
      description: "with Guest A",
      start: "2026-03-02T00:00:00Z",
      end: "2026-03-02T00:30:00Z",
      guestTimeZone: "America/Los_Angeles",
      hostTimeZone: "Asia/Tokyo",
    });
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("DTSTART:20260302T000000Z");
    expect(body).toContain("DTEND:20260302T003000Z");
    expect(body).toContain("SUMMARY:Casual 30");
    expect(body).toContain("UID:booking-1@pf-calendar.local");
  });
});
