import { describe, expect, it, vi } from "vitest";
import { runOutboxCycle, type WebhookDeliverer } from "./outbox.js";

describe("outbox delivery", () => {
  it("skips when webhook URL is empty", async () => {
    const pool = { query: vi.fn() } as unknown as import("pg").Pool;
    const deliver = vi.fn() as WebhookDeliverer;
    const n = await runOutboxCycle(pool, "", deliver);
    expect(n).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("marks rows delivered after a successful webhook", async () => {
    const updates: string[] = [];
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT id")) {
          return {
            rows: [
              {
                id: "evt-1",
                event_type: "calendar.booking.confirmed",
                payload: { type: "calendar.booking.confirmed", data: { bookingId: "bk-1" } },
                delivery_attempts: 0,
              },
            ],
          };
        }
        updates.push(sql);
        return { rows: [] };
      }),
    } as unknown as import("pg").Pool;
    const deliver = vi.fn(async () => {}) as WebhookDeliverer;
    const n = await runOutboxCycle(pool, "http://webhook.test/hook", deliver);
    expect(n).toBe(1);
    expect(deliver).toHaveBeenCalledOnce();
    expect(updates.some((sql) => sql.includes("delivered_at"))).toBe(true);
  });
});
