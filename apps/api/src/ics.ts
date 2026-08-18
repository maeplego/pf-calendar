import { Temporal } from "@js-temporal/polyfill";

export type IcsEventInput = {
  uid: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  guestTimeZone: string;
  hostTimeZone: string;
};

/** RFC 5545 の最小 VCALENDAR。DTSTART/DTEND は UTC（Z）。VTIMEZONE はゲスト TZ。 */
export function buildBookingIcs(input: IcsEventInput): string {
  const start = Temporal.Instant.from(input.start);
  const end = Temporal.Instant.from(input.end);
  const dtStart = formatUtc(start);
  const dtEnd = formatUtc(end);
  const stamp = formatUtc(Temporal.Now.instant());
  const tz = escapeText(input.guestTimeZone);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//pf-calendar//portfolio//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `BEGIN:VTIMEZONE`,
    `TZID:${tz}`,
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}@pf-calendar.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function formatUtc(instant: Temporal.Instant): string {
  const z = instant.toZonedDateTimeISO("UTC");
  const p = z.toPlainDateTime();
  const y = String(p.year).padStart(4, "0");
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  const h = String(p.hour).padStart(2, "0");
  const min = String(p.minute).padStart(2, "0");
  const s = String(p.second).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
