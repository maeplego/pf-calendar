export type ReminderKind = "24h" | "1h";

export type DueReminder = {
  bookingId: string;
  kind: ReminderKind;
  guestEmail: string;
  guestName: string;
  eventName: string;
  startIso: string;
};

/** ポーリング窓（分）。この幅で「いま送るべき」を判定する。 */
export function reminderWindowMinutes(kind: ReminderKind): number {
  return kind === "24h" ? 24 * 60 : 60;
}

export function isDueForReminder(startMs: number, nowMs: number, kind: ReminderKind, pollMs: number): boolean {
  const leadMs = reminderWindowMinutes(kind) * 60_000;
  const target = startMs - leadMs;
  return nowMs >= target && nowMs < target + pollMs;
}

export function buildReminderSubject(kind: ReminderKind, eventName: string): string {
  const label = kind === "24h" ? "24時間前" : "1時間前";
  return `[pf-calendar] ${label}リマインド: ${eventName}`;
}

export function buildReminderBody(row: DueReminder): string {
  return [
    `${row.guestName} 様`,
    "",
    `「${row.eventName}」の予約が近づいています。`,
    `開始: ${row.startIso}`,
    "",
    "学習用ポートフォリオからの自動送信です。",
  ].join("\n");
}
