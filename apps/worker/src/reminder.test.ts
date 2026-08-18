import { describe, expect, it } from "vitest";
import { buildReminderBody, isDueForReminder } from "./reminder.js";

describe("isDueForReminder", () => {
  const start = Date.parse("2026-03-03T09:00:00Z");

  it("fires inside the 24h lead window", () => {
    const now = start - 24 * 60 * 60_000 + 60_000;
    expect(isDueForReminder(start, now, "24h", 5 * 60_000)).toBe(true);
  });

  it("does not fire too early for 1h", () => {
    const now = start - 2 * 60 * 60_000;
    expect(isDueForReminder(start, now, "1h", 5 * 60_000)).toBe(false);
  });
});

describe("buildReminderBody", () => {
  it("includes guest name and event", () => {
    const text = buildReminderBody({
      bookingId: "b1",
      kind: "1h",
      guestEmail: "a@example.test",
      guestName: "Guest",
      eventName: "Interview",
      startIso: "2026-03-03T09:00:00Z",
    });
    expect(text).toContain("Guest 様");
    expect(text).toContain("Interview");
  });
});
