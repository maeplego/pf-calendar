import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ConflictError, NotFoundError, type DateOverride, type EventType, type EventTypeInput, type Host } from "./domain.js";
import { newId } from "./ids.js";
import type { AvailabilityRule } from "./domain.js";
import type { Store } from "./store.js";

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "schema.sql");

type EventTypeRow = {
  id: string;
  host_id: string;
  slug: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  host_time_zone: string;
};

type RuleRow = {
  event_type_id: string;
  day_of_week: number;
  start_local: string;
  end_local: string;
};

type OverrideRow = {
  event_type_id: string;
  on_date: string;
  blocked: boolean;
};

export class PostgresStore implements Store {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const store = new PostgresStore(pool);
    await store.migrate();
    return store;
  }

  async migrate(): Promise<void> {
    const sql = await readFile(schemaPath, "utf8");
    await this.pool.query(sql);
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async ensureHost(sub: string): Promise<Host> {
    const found = await this.pool.query<{ id: string; sub: string }>(
      "SELECT id, sub FROM hosts WHERE sub = $1",
      [sub],
    );
    if (found.rowCount) {
      return found.rows[0];
    }
    const id = newId();
    try {
      await this.pool.query("INSERT INTO hosts (id, sub) VALUES ($1, $2)", [id, sub]);
      return { id, sub };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await this.pool.query<{ id: string; sub: string }>(
          "SELECT id, sub FROM hosts WHERE sub = $1",
          [sub],
        );
        if (again.rowCount) {
          return again.rows[0];
        }
      }
      throw err;
    }
  }

  async createEventType(host: Host, input: EventTypeInput): Promise<EventType> {
    const id = newId();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO event_types (
           id, host_id, slug, name, duration_minutes, buffer_minutes, min_notice_minutes, host_time_zone
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          host.id,
          input.slug,
          input.name,
          input.durationMinutes,
          input.bufferMinutes,
          input.minNoticeMinutes,
          input.hostTimeZone,
        ],
      );
      await insertRules(client, id, input.rules);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err)) {
        throw new ConflictError("slug already in use");
      }
      throw err;
    } finally {
      client.release();
    }
    return this.getEventType(host, id);
  }

  async getEventType(host: Host, id: string): Promise<EventType> {
    const found = await this.pool.query<EventTypeRow>(
      "SELECT * FROM event_types WHERE id = $1 AND host_id = $2",
      [id, host.id],
    );
    if (!found.rowCount) {
      throw new NotFoundError();
    }
    return this.hydrate(found.rows[0]);
  }

  async listEventTypes(host: Host): Promise<EventType[]> {
    const found = await this.pool.query<EventTypeRow>(
      "SELECT * FROM event_types WHERE host_id = $1 ORDER BY created_at",
      [host.id],
    );
    const ids = found.rows.map((row) => row.id);
    const { rules, overrides } = await this.children(ids);
    return found.rows.map((row) => toEventType(row, rules.get(row.id) ?? [], overrides.get(row.id) ?? []));
  }

  async replaceRules(host: Host, id: string, rules: AvailabilityRule[]): Promise<EventType> {
    await this.assertOwned(host, id);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM availability_rules WHERE event_type_id = $1", [id]);
      await insertRules(client, id, rules);
      await client.query("UPDATE event_types SET updated_at = now() WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return this.getEventType(host, id);
  }

  async replaceOverrides(host: Host, id: string, overrides: DateOverride[]): Promise<EventType> {
    await this.assertOwned(host, id);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM date_overrides WHERE event_type_id = $1", [id]);
      for (const o of overrides) {
        await client.query(
          "INSERT INTO date_overrides (id, event_type_id, on_date, blocked) VALUES ($1, $2, $3, $4)",
          [newId(), id, o.date, o.blocked],
        );
      }
      await client.query("UPDATE event_types SET updated_at = now() WHERE id = $1", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return this.getEventType(host, id);
  }

  private async assertOwned(host: Host, id: string): Promise<void> {
    const found = await this.pool.query("SELECT 1 FROM event_types WHERE id = $1 AND host_id = $2", [id, host.id]);
    if (!found.rowCount) {
      throw new NotFoundError();
    }
  }

  private async hydrate(row: EventTypeRow): Promise<EventType> {
    const { rules, overrides } = await this.children([row.id]);
    return toEventType(row, rules.get(row.id) ?? [], overrides.get(row.id) ?? []);
  }

  private async children(ids: string[]): Promise<{
    rules: Map<string, AvailabilityRule[]>;
    overrides: Map<string, DateOverride[]>;
  }> {
    const rules = new Map<string, AvailabilityRule[]>();
    const overrides = new Map<string, DateOverride[]>();
    if (ids.length === 0) {
      return { rules, overrides };
    }
    const ruleRows = await this.pool.query<RuleRow>(
      "SELECT event_type_id, day_of_week, start_local, end_local FROM availability_rules WHERE event_type_id = ANY($1::text[])",
      [ids],
    );
    for (const r of ruleRows.rows) {
      const list = rules.get(r.event_type_id) ?? [];
      list.push({ dayOfWeek: r.day_of_week, startLocal: r.start_local, endLocal: r.end_local });
      rules.set(r.event_type_id, list);
    }
    const overrideRows = await this.pool.query<OverrideRow>(
      "SELECT event_type_id, on_date::text AS on_date, blocked FROM date_overrides WHERE event_type_id = ANY($1::text[])",
      [ids],
    );
    for (const o of overrideRows.rows) {
      const list = overrides.get(o.event_type_id) ?? [];
      list.push({ date: o.on_date, blocked: o.blocked });
      overrides.set(o.event_type_id, list);
    }
    return { rules, overrides };
  }
}

async function insertRules(
  client: pg.PoolClient,
  eventTypeId: string,
  rules: AvailabilityRule[],
): Promise<void> {
  for (const rule of rules) {
    await client.query(
      `INSERT INTO availability_rules (id, event_type_id, day_of_week, start_local, end_local)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), eventTypeId, rule.dayOfWeek, rule.startLocal, rule.endLocal],
    );
  }
}

function toEventType(row: EventTypeRow, rules: AvailabilityRule[], overrides: DateOverride[]): EventType {
  return {
    id: row.id,
    hostId: row.host_id,
    slug: row.slug,
    name: row.name,
    durationMinutes: row.duration_minutes,
    bufferMinutes: row.buffer_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    hostTimeZone: row.host_time_zone,
    rules,
    overrides,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
