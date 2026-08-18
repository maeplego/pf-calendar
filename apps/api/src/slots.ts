import { Temporal } from "@js-temporal/polyfill";
import { generateSlots, type ExistingBooking } from "@pf-calendar/slot-engine";
import type { EventType } from "./domain.js";

export function offeredStarts(
  eventType: EventType,
  bookings: ExistingBooking[],
  rangeStart: string,
  rangeEnd: string,
  now: string,
): Temporal.Instant[] {
  return generateSlots({
    durationMinutes: eventType.durationMinutes,
    bufferMinutes: eventType.bufferMinutes,
    minNoticeMinutes: eventType.minNoticeMinutes,
    hostTimeZone: eventType.hostTimeZone,
    rules: eventType.rules,
    overrides: eventType.overrides,
    existingBookings: bookings,
    rangeStart,
    rangeEnd,
    now,
  });
}

export function offeredStartIsos(
  eventType: EventType,
  bookings: ExistingBooking[],
  rangeStart: string,
  rangeEnd: string,
  now: string,
): string[] {
  return offeredStarts(eventType, bookings, rangeStart, rangeEnd, now).map((i) => i.toString());
}

/** 予約対象日はホスト現地の暦日。バッファ判定のためその日の既存予約を engine に渡す。 */
export function hostDayRange(slotStart: Temporal.Instant, timeZone: string): { rangeStart: string; rangeEnd: string } {
  const day = slotStart.toZonedDateTimeISO(timeZone).toPlainDate();
  const rangeStart = Temporal.ZonedDateTime.from(
    { year: day.year, month: day.month, day: day.day, hour: 0, minute: 0, timeZone },
    { disambiguate: "compatible" },
  ).toInstant();
  const next = day.add({ days: 1 });
  const rangeEnd = Temporal.ZonedDateTime.from(
    { year: next.year, month: next.month, day: next.day, hour: 0, minute: 0, timeZone },
    { disambiguate: "compatible" },
  ).toInstant();
  return { rangeStart: rangeStart.toString(), rangeEnd: rangeEnd.toString() };
}

export function isOfferedStart(
  eventType: EventType,
  bookings: ExistingBooking[],
  slotStart: Temporal.Instant,
  now: string,
): boolean {
  const { rangeStart, rangeEnd } = hostDayRange(slotStart, eventType.hostTimeZone);
  return offeredStarts(eventType, bookings, rangeStart, rangeEnd, now).some(
    (instant) => Temporal.Instant.compare(instant, slotStart) === 0,
  );
}
