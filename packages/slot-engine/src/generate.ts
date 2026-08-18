import { Temporal } from "@js-temporal/polyfill";

/** CPU 保護。14 暦日ではなく 14×24 時間（Instant）。DST で日数がブレないようにする。 */
export const MAX_RANGE_HOURS = 14 * 24;

export class RangeTooLongError extends Error {
  readonly name = "RangeTooLongError";
  constructor() {
    super(`slot generation range must be at most ${MAX_RANGE_HOURS / 24} days`);
  }
}

export class InvalidSlotInputError extends Error {
  readonly name = "InvalidSlotInputError";
  constructor(message: string) {
    super(message);
  }
}

export type AvailabilityRule = {
  /** ISO weekday: 1 = Monday … 7 = Sunday（Temporal と同じ）。 */
  dayOfWeek: number;
  /** Host-local wall time, `HH:mm` or Temporal PlainTime text. */
  startLocal: string;
  endLocal: string;
};

export type DateOverride = {
  /** Host-timezone calendar date `YYYY-MM-DD`. */
  date: string;
  blocked: boolean;
};

export type ExistingBooking = {
  start: string;
  end: string;
};

export type GenerateSlotsInput = {
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  hostTimeZone: string;
  rules: AvailabilityRule[];
  overrides?: DateOverride[];
  existingBookings?: ExistingBooking[];
  /** Inclusive Instant (ISO-8601). */
  rangeStart: string;
  /** Exclusive Instant (ISO-8601). */
  rangeEnd: string;
  now: string;
};

export function generateSlotStartsIso(input: GenerateSlotsInput): string[] {
  return generateSlots(input).map((instant) => instant.toString());
}

/**
 * 空きルールから予約可能な枠の開始 Instant を返す。
 * クライアントの「この ISO が空いている」は信じず、host TZ の壁時計ルールだけで計算する。
 */
export function generateSlots(input: GenerateSlotsInput): Temporal.Instant[] {
  if (input.durationMinutes <= 0) {
    throw new InvalidSlotInputError("durationMinutes must be positive");
  }
  if (input.bufferMinutes < 0) {
    throw new InvalidSlotInputError("bufferMinutes must not be negative");
  }
  if (input.minNoticeMinutes < 0) {
    throw new InvalidSlotInputError("minNoticeMinutes must not be negative");
  }
  for (const rule of input.rules) {
    if (rule.dayOfWeek < 1 || rule.dayOfWeek > 7) {
      throw new InvalidSlotInputError("dayOfWeek must be 1 (Monday) through 7 (Sunday)");
    }
  }

  const rangeStart = Temporal.Instant.from(input.rangeStart);
  const rangeEnd = Temporal.Instant.from(input.rangeEnd);
  const now = Temporal.Instant.from(input.now);
  if (Temporal.Instant.compare(rangeEnd, rangeStart) <= 0) {
    throw new InvalidSlotInputError("rangeEnd must be after rangeStart");
  }
  const maxEnd = rangeStart.add({ hours: MAX_RANGE_HOURS });
  if (Temporal.Instant.compare(rangeEnd, maxEnd) > 0) {
    throw new RangeTooLongError();
  }

  const tz = input.hostTimeZone;
  // 不正な IANA 名はここで失敗させる（黙って UTC に落とさない）。Now は使わず純関数を保つ。
  Temporal.ZonedDateTime.from({ year: 1970, month: 1, day: 1, timeZone: tz });

  const blocked = new Set(
    (input.overrides ?? []).filter((o) => o.blocked).map((o) => o.date),
  );
  const bookings = (input.existingBookings ?? []).map((b) => ({
    start: Temporal.Instant.from(b.start),
    end: Temporal.Instant.from(b.end),
  }));
  const earliest = now.add({ minutes: input.minNoticeMinutes });

  const starts: Temporal.Instant[] = [];
  let day = rangeStart.toZonedDateTimeISO(tz).toPlainDate();

  for (;;) {
    const dayStart = zonedOn(day, tz, 0, 0).toInstant();
    if (Temporal.Instant.compare(dayStart, rangeEnd) >= 0) {
      break;
    }

    if (!blocked.has(day.toString())) {
      const dow = day.dayOfWeek;
      for (const rule of input.rules) {
        if (rule.dayOfWeek !== dow) {
          continue;
        }
        collectWindow({
          day,
          tz,
          rule,
          durationMinutes: input.durationMinutes,
          bufferMinutes: input.bufferMinutes,
          rangeStart,
          rangeEnd,
          earliest,
          bookings,
          starts,
        });
      }
    }

    day = day.add({ days: 1 });
  }

  starts.sort((a, b) => Temporal.Instant.compare(a, b));
  return starts;
}

function collectWindow(args: {
  day: Temporal.PlainDate;
  tz: string;
  rule: AvailabilityRule;
  durationMinutes: number;
  bufferMinutes: number;
  rangeStart: Temporal.Instant;
  rangeEnd: Temporal.Instant;
  earliest: Temporal.Instant;
  bookings: { start: Temporal.Instant; end: Temporal.Instant }[];
  starts: Temporal.Instant[];
}): void {
  const startTime = Temporal.PlainTime.from(args.rule.startLocal);
  const endTime = Temporal.PlainTime.from(args.rule.endLocal);
  if (Temporal.PlainTime.compare(startTime, endTime) >= 0) {
    throw new InvalidSlotInputError("rule startLocal must be before endLocal (overnight windows are out of scope)");
  }

  let t = zonedOn(args.day, args.tz, startTime.hour, startTime.minute, startTime.second);
  const windowEnd = zonedOn(args.day, args.tz, endTime.hour, endTime.minute, endTime.second);

  while (true) {
    const slotEnd = t.add({ minutes: args.durationMinutes });
    if (Temporal.ZonedDateTime.compare(slotEnd, windowEnd) > 0) {
      break;
    }
    const startInstant = t.toInstant();
    const endInstant = slotEnd.toInstant();
    const inRange =
      Temporal.Instant.compare(startInstant, args.rangeStart) >= 0 &&
      Temporal.Instant.compare(endInstant, args.rangeEnd) <= 0;
    const afterNotice = Temporal.Instant.compare(startInstant, args.earliest) >= 0;
    if (inRange && afterNotice && !blockedByBooking(startInstant, endInstant, args.bookings, args.bufferMinutes)) {
      args.starts.push(startInstant);
    }
    t = t.add({ minutes: args.durationMinutes });
  }
}

function blockedByBooking(
  slotStart: Temporal.Instant,
  slotEnd: Temporal.Instant,
  bookings: { start: Temporal.Instant; end: Temporal.Instant }[],
  bufferMinutes: number,
): boolean {
  for (const b of bookings) {
    // 前後バッファは予約そのものに足す。枠がバッファ帯に少しでもかかれば落とす。
    const blockedStart = b.start.add({ minutes: -bufferMinutes });
    const blockedEnd = b.end.add({ minutes: bufferMinutes });
    const overlaps =
      Temporal.Instant.compare(slotStart, blockedEnd) < 0 &&
      Temporal.Instant.compare(blockedStart, slotEnd) < 0;
    if (overlaps) {
      return true;
    }
  }
  return false;
}

function zonedOn(
  day: Temporal.PlainDate,
  timeZone: string,
  hour: number,
  minute: number,
  second = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour,
      minute,
      second,
      timeZone,
    },
    { disambiguate: "compatible" },
  );
}
