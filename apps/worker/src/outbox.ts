import type pg from "pg";

export type OutboxRow = {
  id: string;
  event_type: string;
  payload: unknown;
  delivery_attempts: number;
};

export type WebhookDeliverer = (url: string, body: string, eventType: string) => Promise<void>;

const MAX_ATTEMPTS = 5;

export async function runOutboxCycle(
  pool: pg.Pool,
  webhookUrl: string,
  deliver: WebhookDeliverer,
  limit = 20,
): Promise<number> {
  if (!webhookUrl.trim()) {
    return 0;
  }
  const pending = await pool.query<OutboxRow>(
    `SELECT id, event_type, payload, delivery_attempts
     FROM outbox_events
     WHERE delivered_at IS NULL AND delivery_attempts < $1
     ORDER BY created_at
     LIMIT $2`,
    [MAX_ATTEMPTS, limit],
  );
  let delivered = 0;
  for (const row of pending.rows) {
    try {
      await deliver(webhookUrl, JSON.stringify(row.payload), row.event_type);
      await pool.query("UPDATE outbox_events SET delivered_at = now(), last_error = NULL WHERE id = $1", [row.id]);
      delivered += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await pool.query(
        "UPDATE outbox_events SET delivery_attempts = delivery_attempts + 1, last_error = $2 WHERE id = $1",
        [row.id, message.slice(0, 500)],
      );
    }
  }
  return delivered;
}

export async function defaultWebhookDeliverer(url: string, body: string, eventType: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Calendar-Event-Type": eventType,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`webhook returned ${res.status}`);
  }
}
