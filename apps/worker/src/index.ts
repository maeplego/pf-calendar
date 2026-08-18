import nodemailer from "nodemailer";
import pg from "pg";

import {
  buildReminderBody,
  buildReminderSubject,
  isDueForReminder,
  type DueReminder,
  type ReminderKind,
} from "./reminder.js";

export type WorkerConfig = {
  databaseUrl: string;
  smtpHost: string;
  smtpPort: number;
  mailFrom: string;
  pollSeconds: number;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const databaseUrl = env.CALENDAR_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("CALENDAR_DATABASE_URL is required");
  }
  const pollSeconds = Number.parseInt(env.CALENDAR_REMINDER_POLL_SECONDS ?? "60", 10);
  return {
    databaseUrl,
    smtpHost: env.CALENDAR_SMTP_HOST ?? "localhost",
    smtpPort: Number.parseInt(env.CALENDAR_SMTP_PORT ?? "1025", 10),
    mailFrom: env.CALENDAR_MAIL_FROM ?? "calendar@localhost",
    pollSeconds: Number.isFinite(pollSeconds) && pollSeconds > 0 ? pollSeconds : 60,
  };
}

type Row = {
  id: string;
  guest_email: string;
  guest_name: string;
  start_at: Date;
  event_name: string;
};

export async function runReminderCycle(pool: pg.Pool, transport: nodemailer.Transporter, cfg: WorkerConfig, now = new Date()): Promise<number> {
  let sent = 0;
  for (const kind of ["24h", "1h"] as ReminderKind[]) {
    const due = await listDueReminders(pool, kind, now, cfg.pollSeconds * 1000);
    for (const row of due) {
      const reminder: DueReminder = {
        bookingId: row.id,
        kind,
        guestEmail: row.guest_email,
        guestName: row.guest_name,
        eventName: row.event_name,
        startIso: row.start_at.toISOString(),
      };
      await transport.sendMail({
        from: cfg.mailFrom,
        to: reminder.guestEmail,
        subject: buildReminderSubject(kind, reminder.eventName),
        text: buildReminderBody(reminder),
      });
      await pool.query("INSERT INTO reminder_sent (booking_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
        reminder.bookingId,
        kind,
      ]);
      sent += 1;
    }
  }
  return sent;
}

async function listDueReminders(pool: pg.Pool, kind: ReminderKind, now: Date, pollMs: number): Promise<Row[]> {
  const found = await pool.query<Row>(
    `SELECT b.id, b.guest_email, b.guest_name, b.start_at, e.name AS event_name
     FROM bookings b
     JOIN event_types e ON e.id = b.event_type_id
     LEFT JOIN reminder_sent r ON r.booking_id = b.id AND r.kind = $1
     WHERE b.status = 'confirmed'
       AND b.start_at > now()
       AND r.booking_id IS NULL`,
    [kind],
  );
  const nowMs = now.getTime();
  return found.rows.filter((row) => isDueForReminder(row.start_at.getTime(), nowMs, kind, pollMs));
}

export async function startWorker(cfg: WorkerConfig): Promise<void> {
  const pool = new pg.Pool({ connectionString: cfg.databaseUrl });
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: false,
  });
  console.log(`calendar-worker polling every ${cfg.pollSeconds}s (smtp ${cfg.smtpHost}:${cfg.smtpPort})`);
  for (;;) {
    try {
      const n = await runReminderCycle(pool, transport, cfg);
      if (n > 0) {
        console.log(`sent ${n} reminder(s)`);
      }
    } catch (err) {
      console.error("reminder cycle failed", err);
    }
    await sleep(cfg.pollSeconds * 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
