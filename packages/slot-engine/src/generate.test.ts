import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import {
  InvalidSlotInputError,
  RangeTooLongError,
  generateSlotStartsIso,
  generateSlots,
  type AvailabilityRule,
  type GenerateSlotsInput,
} from "./generate.js";

const TOKYO = "Asia/Tokyo";
const LA = "America/Los_Angeles";

/** 2026-03-02 は月曜。平日 9–12 の固定ケースに使う。 */
const WEEKDAY_RULES: AvailabilityRule[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startLocal: "09:00",
  endLocal: "12:00",
}));

function tokyoInstant(plain: string): string {
  return Temporal.PlainDateTime.from(plain).toZonedDateTime(TOKYO).toInstant().toString();
}

function laInstant(plain: string): string {
  return Temporal.PlainDateTime.from(plain).toZonedDateTime(LA).toInstant().toString();
}

function baseInput(overrides: Partial<GenerateSlotsInput> = {}): GenerateSlotsInput {
  return {
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 0,
    hostTimeZone: TOKYO,
    rules: WEEKDAY_RULES,
    rangeStart: tokyoInstant("2026-03-02T00:00:00"),
    rangeEnd: tokyoInstant("2026-03-03T00:00:00"),
    now: tokyoInstant("2026-03-01T00:00:00"),
    ...overrides,
  };
}

describe("generateSlots", () => {
  it("emits 30-minute weekday slots in Asia/Tokyo", () => {
    const starts = generateSlotStartsIso(baseInput());
    expect(starts).toEqual([
      tokyoInstant("2026-03-02T09:00:00"),
      tokyoInstant("2026-03-02T09:30:00"),
      tokyoInstant("2026-03-02T10:00:00"),
      tokyoInstant("2026-03-02T10:30:00"),
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
  });

  it("does not emit weekend slots for weekday-only rules", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        rangeStart: tokyoInstant("2026-03-07T00:00:00"),
        rangeEnd: tokyoInstant("2026-03-08T00:00:00"),
      }),
    );
    expect(starts).toEqual([]);
  });

  it("keeps host-local availability when a guest views Instants in America/Los_Angeles", () => {
    const instants = generateSlots(baseInput());
    for (const start of instants) {
      const hostLocal = start.toZonedDateTimeISO(TOKYO);
      expect(hostLocal.toPlainDate().toString()).toBe("2026-03-02");
      expect(hostLocal.hour).toBeGreaterThanOrEqual(9);
      expect(hostLocal.hour).toBeLessThan(12);

      // ゲスト TZ は表示用。Instant が変わらないこと（計算をゲスト壁時計に載せ替えない）。
      const guestLocal = start.toZonedDateTimeISO(LA);
      expect(guestLocal.toInstant().toString()).toBe(start.toString());
      expect(guestLocal.day).toBe(1);
      expect(guestLocal.hour).toBeGreaterThanOrEqual(16);
      expect(guestLocal.hour).toBeLessThan(20);
    }
  });

  it("skips the missing hour on the America/Los_Angeles spring-forward", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        hostTimeZone: LA,
        rules: [{ dayOfWeek: 7, startLocal: "01:00", endLocal: "04:00" }],
        rangeStart: laInstant("2026-03-08T00:00:00"),
        rangeEnd: laInstant("2026-03-09T00:00:00"),
        now: laInstant("2026-03-01T00:00:00"),
      }),
    );
    expect(starts).toEqual([
      laInstant("2026-03-08T01:00:00"),
      laInstant("2026-03-08T01:30:00"),
      laInstant("2026-03-08T03:00:00"),
      laInstant("2026-03-08T03:30:00"),
    ]);
    const instants = starts.map((s) => Temporal.Instant.from(s));
    expect(uniqueIso(instants)).toHaveLength(4);
  });

  it("fits six 30-minute slots in a normal 01:00-04:00 window", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        hostTimeZone: LA,
        rules: [{ dayOfWeek: 7, startLocal: "01:00", endLocal: "04:00" }],
        rangeStart: laInstant("2026-03-01T00:00:00"),
        rangeEnd: laInstant("2026-03-02T00:00:00"),
        now: laInstant("2026-02-01T00:00:00"),
      }),
    );
    expect(starts).toHaveLength(6);
  });

  it("keeps unique Instants through the America/Los_Angeles fall-back extra hour", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        hostTimeZone: LA,
        rules: [{ dayOfWeek: 7, startLocal: "01:00", endLocal: "04:00" }],
        rangeStart: laInstant("2026-11-01T00:00:00"),
        rangeEnd: laInstant("2026-11-02T00:00:00"),
        now: laInstant("2026-10-01T00:00:00"),
      }),
    );
    const instants = starts.map((s) => Temporal.Instant.from(s));
    expect(uniqueIso(instants)).toHaveLength(starts.length);
    expect(starts.length).toBe(8);
    for (let i = 1; i < instants.length; i++) {
      const deltaMinutes = instants[i - 1].until(instants[i], { largestUnit: "minutes" }).minutes;
      expect(deltaMinutes).toBe(30);
    }
  });

  it("drops slots that collide with a 15-minute buffer around a booking", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        bufferMinutes: 15,
        existingBookings: [
          {
            start: tokyoInstant("2026-03-02T10:00:00"),
            end: tokyoInstant("2026-03-02T10:30:00"),
          },
        ],
      }),
    );
    expect(starts).toEqual([
      tokyoInstant("2026-03-02T09:00:00"),
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
  });

  it("hides slots before now plus min notice", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        minNoticeMinutes: 180,
        now: tokyoInstant("2026-03-02T08:00:00"),
      }),
    );
    expect(starts).toEqual([
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
  });

  it("drops only the slot that overlaps an existing booking when buffer is zero", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        existingBookings: [
          {
            start: tokyoInstant("2026-03-02T10:00:00"),
            end: tokyoInstant("2026-03-02T10:30:00"),
          },
        ],
      }),
    );
    expect(starts).toEqual([
      tokyoInstant("2026-03-02T09:00:00"),
      tokyoInstant("2026-03-02T09:30:00"),
      tokyoInstant("2026-03-02T10:30:00"),
      tokyoInstant("2026-03-02T11:00:00"),
      tokyoInstant("2026-03-02T11:30:00"),
    ]);
  });

  it("emits nothing on a blocked override date", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        overrides: [{ date: "2026-03-02", blocked: true }],
      }),
    );
    expect(starts).toEqual([]);
  });

  it("rejects a range longer than 14 days", () => {
    expect(() =>
      generateSlots(
        baseInput({
          rangeStart: tokyoInstant("2026-03-02T00:00:00"),
          rangeEnd: tokyoInstant("2026-03-17T00:00:01"),
        }),
      ),
    ).toThrow(RangeTooLongError);
  });

  it("allows a range of exactly 14 days", () => {
    const starts = generateSlotStartsIso(
      baseInput({
        rangeStart: tokyoInstant("2026-03-02T00:00:00"),
        rangeEnd: tokyoInstant("2026-03-16T00:00:00"),
      }),
    );
    expect(starts.length).toBeGreaterThan(0);
  });

  it("rejects inverted ranges", () => {
    expect(() =>
      generateSlots(
        baseInput({
          rangeStart: tokyoInstant("2026-03-03T00:00:00"),
          rangeEnd: tokyoInstant("2026-03-02T00:00:00"),
        }),
      ),
    ).toThrow(InvalidSlotInputError);
  });
});

function uniqueIso(instants: Temporal.Instant[]): string[] {
  return [...new Set(instants.map((i) => i.toString()))];
}
