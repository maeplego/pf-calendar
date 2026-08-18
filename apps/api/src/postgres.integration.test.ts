import { Temporal } from "@js-temporal/polyfill";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { ConflictError } from "./domain.js";
import { PostgresStore } from "./postgres.js";
import { newCancelToken } from "./tokens.js";

const TOKYO = "Asia/Tokyo";
const databaseUrl = process.env.CALENDAR_DATABASE_URL?.trim();

async function postgresReachable(url: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

const integrationEnabled = Boolean(databaseUrl && (await postgresReachable(databaseUrl)));

function tokyoInstant(plain: string): string {
  return Temporal.PlainDateTime.from(plain).toZonedDateTime(TOKYO).toInstant().toString();
}

const weekdayRules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startLocal: "09:00",
  endLocal: "12:00",
}));

describe.skipIf(!integrationEnabled)("Postgres exclusion (TS-M01)", () => {
  it("allows only one of two parallel bookings for the same slot", async () => {
    const store = await PostgresStore.connect(databaseUrl!);
    const host = await store.ensureHost(`integration-${Date.now()}`);
    const slug = `parallel-${Date.now()}`;
    const eventType = await store.createEventType(host, {
      slug,
      name: "Parallel test",
      durationMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      hostTimeZone: TOKYO,
      rules: weekdayRules,
    });

    const start = tokyoInstant("2026-03-02T09:00:00");
    const end = tokyoInstant("2026-03-02T09:30:00");
    const insert = (key: string) => {
      const cancel = newCancelToken();
      return store.createBooking(eventType, {
        start,
        end,
        guestName: "Guest",
        guestEmail: `${key}@example.test`,
        guestTimeZone: "America/Los_Angeles",
        idempotencyKey: key,
        cancelTokenHash: cancel.hash,
      });
    };

    const [first, second] = await Promise.allSettled([insert("idem-a"), insert("idem-b")]);
    const outcomes = [first, second].map((result) => {
      if (result.status === "fulfilled") {
        return result.value.created ? "created" : "replay";
      }
      if (result.reason instanceof ConflictError) {
        return "conflict";
      }
      throw result.reason;
    });
    expect(outcomes.filter((o) => o === "created")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "conflict")).toHaveLength(1);

    const confirmed = await store.listConfirmedBookings(eventType.id);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].start).toBe(start);
  });
});
