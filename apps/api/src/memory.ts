import { Temporal } from "@js-temporal/polyfill";
import { ConflictError, NotFoundError, type Booking, type BookingInsert, type BookingWithEvent, type DateOverride, type EventType, type EventTypeInput, type Host } from "./domain.js";
import { newId } from "./ids.js";
import type { AvailabilityRule } from "./domain.js";
import type { Store } from "./store.js";
import { hashCancelToken } from "./tokens.js";

type StoredBooking = Booking & { cancelTokenHash: string };

export class MemoryStore implements Store {
  private hostsBySub = new Map<string, Host>();
  private eventTypes = new Map<string, EventType>();
  private bookings: StoredBooking[] = [];

  async ping(): Promise<void> {
    return;
  }

  async ensureHost(sub: string): Promise<Host> {
    const existing = this.hostsBySub.get(sub);
    if (existing) {
      return existing;
    }
    const host: Host = { id: newId(), sub };
    this.hostsBySub.set(sub, host);
    return host;
  }

  async createEventType(host: Host, input: EventTypeInput): Promise<EventType> {
    this.assertSlugFree(input.slug);
    const row: EventType = {
      id: newId(),
      hostId: host.id,
      slug: input.slug,
      name: input.name,
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes,
      minNoticeMinutes: input.minNoticeMinutes,
      hostTimeZone: input.hostTimeZone,
      rules: cloneRules(input.rules),
      overrides: [],
    };
    this.eventTypes.set(row.id, row);
    return cloneEventType(row);
  }

  async getEventType(host: Host, id: string): Promise<EventType> {
    const row = this.owned(host, id);
    return cloneEventType(row);
  }

  async getEventTypeBySlug(slug: string): Promise<EventType> {
    for (const row of this.eventTypes.values()) {
      if (row.slug === slug) {
        return cloneEventType(row);
      }
    }
    throw new NotFoundError();
  }

  async listEventTypes(host: Host): Promise<EventType[]> {
    return [...this.eventTypes.values()]
      .filter((row) => row.hostId === host.id)
      .map(cloneEventType);
  }

  async replaceRules(host: Host, id: string, rules: AvailabilityRule[]): Promise<EventType> {
    const row = this.owned(host, id);
    row.rules = cloneRules(rules);
    return cloneEventType(row);
  }

  async replaceOverrides(host: Host, id: string, overrides: DateOverride[]): Promise<EventType> {
    const row = this.owned(host, id);
    row.overrides = cloneOverrides(overrides);
    return cloneEventType(row);
  }

  async listConfirmedBookings(eventTypeId: string): Promise<Booking[]> {
    return this.bookings
      .filter((b) => b.eventTypeId === eventTypeId && b.status === "confirmed")
      .map(publicBooking);
  }

  async findBookingByIdempotency(eventTypeId: string, idempotencyKey: string): Promise<Booking | null> {
    const existing = this.bookings.find(
      (b) => b.eventTypeId === eventTypeId && b.idempotencyKey === idempotencyKey,
    );
    return existing ? publicBooking(existing) : null;
  }

  async createBooking(eventType: EventType, input: BookingInsert): Promise<{ booking: Booking; created: boolean }> {
    const existing = this.bookings.find(
      (b) => b.eventTypeId === eventType.id && b.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (
        existing.start !== input.start ||
        existing.end !== input.end ||
        existing.guestEmail !== input.guestEmail
      ) {
        throw new ConflictError("idempotency key reused with a different request");
      }
      return { booking: publicBooking(existing), created: false };
    }
    if (this.overlapsConfirmed(eventType.id, input.start, input.end)) {
      throw new ConflictError("slot unavailable");
    }
    const row: StoredBooking = {
      id: newId(),
      eventTypeId: eventType.id,
      start: input.start,
      end: input.end,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestTimeZone: input.guestTimeZone,
      status: "confirmed",
      idempotencyKey: input.idempotencyKey,
      cancelTokenHash: input.cancelTokenHash,
    };
    this.bookings.push(row);
    return { booking: publicBooking(row), created: true };
  }

  async cancelBookingByToken(cancelToken: string): Promise<Booking> {
    const row = this.findByTokenHash(cancelToken);
    if (!row) {
      throw new NotFoundError();
    }
    if (row.status === "cancelled") {
      return publicBooking(row);
    }
    row.status = "cancelled";
    return publicBooking(row);
  }

  async getBookingByCancelToken(cancelToken: string): Promise<BookingWithEvent | null> {
    const row = this.findByTokenHash(cancelToken);
    if (!row || row.status !== "confirmed") {
      return null;
    }
    const eventType = this.eventTypes.get(row.eventTypeId);
    if (!eventType) {
      return null;
    }
    return {
      booking: publicBooking(row),
      eventTypeName: eventType.name,
      hostTimeZone: eventType.hostTimeZone,
      eventSlug: eventType.slug,
    };
  }

  private findByTokenHash(cancelToken: string): StoredBooking | undefined {
    const hash = hashCancelToken(cancelToken);
    return this.bookings.find((b) => b.cancelTokenHash === hash);
  }

  private overlapsConfirmed(eventTypeId: string, start: string, end: string): boolean {
    const a0 = Temporal.Instant.from(start);
    const a1 = Temporal.Instant.from(end);
    return this.bookings.some((b) => {
      if (b.eventTypeId !== eventTypeId || b.status !== "confirmed") {
        return false;
      }
      const b0 = Temporal.Instant.from(b.start);
      const b1 = Temporal.Instant.from(b.end);
      return Temporal.Instant.compare(a0, b1) < 0 && Temporal.Instant.compare(b0, a1) < 0;
    });
  }

  private owned(host: Host, id: string): EventType {
    const row = this.eventTypes.get(id);
    if (!row || row.hostId !== host.id) {
      throw new NotFoundError();
    }
    return row;
  }

  private assertSlugFree(slug: string): void {
    for (const row of this.eventTypes.values()) {
      if (row.slug === slug) {
        throw new ConflictError("slug already in use");
      }
    }
  }
}

function publicBooking(row: StoredBooking): Booking {
  return {
    id: row.id,
    eventTypeId: row.eventTypeId,
    start: row.start,
    end: row.end,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestTimeZone: row.guestTimeZone,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
  };
}

function cloneRules(rules: AvailabilityRule[]): AvailabilityRule[] {
  return rules.map((r) => ({ ...r }));
}

function cloneOverrides(overrides: DateOverride[]): DateOverride[] {
  return overrides.map((o) => ({ ...o }));
}

function cloneEventType(row: EventType): EventType {
  return {
    ...row,
    rules: cloneRules(row.rules),
    overrides: cloneOverrides(row.overrides),
  };
}
