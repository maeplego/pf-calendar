import { Temporal } from "@js-temporal/polyfill";

/** ゲスト TZ での日付ラベル（YYYY-MM-DD）。 */
export function plainDateInZone(iso: string, timeZone: string): string {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

/** ゲスト TZ での時刻ラベル（例: 3/2 09:00）。 */
export function formatSlotLabel(iso: string, timeZone: string): string {
  const z = Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone);
  const d = z.toPlainDate();
  const t = z.toPlainTime().toString({ smallestUnit: "minute" });
  return `${d.month}/${d.day} ${t}`;
}

/** 公開 slots 用の Instant 窓: 今から最大 14×24 時間。 */
export function defaultSlotRange(): { rangeStart: string; rangeEnd: string } {
  const rangeStart = Temporal.Now.instant();
  const rangeEnd = rangeStart.add({ hours: 14 * 24 });
  return { rangeStart: rangeStart.toString(), rangeEnd: rangeEnd.toString() };
}

export function groupStartsByLocalDate(starts: string[], timeZone: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const iso of starts) {
    const day = plainDateInZone(iso, timeZone);
    const list = map.get(day) ?? [];
    list.push(iso);
    map.set(day, list);
  }
  for (const [day, list] of map) {
    list.sort((a, b) => Temporal.Instant.compare(Temporal.Instant.from(a), Temporal.Instant.from(b)));
    map.set(day, list);
  }
  return map;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function validateTimeZone(timeZone: string): boolean {
  try {
    Temporal.ZonedDateTime.from({ year: 1970, month: 1, day: 1, timeZone });
    return true;
  } catch {
    return false;
  }
}
