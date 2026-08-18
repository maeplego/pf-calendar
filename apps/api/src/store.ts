import type { Booking, BookingInsert, BookingWithEvent, DateOverride, EventType, EventTypeInput, Host } from "./domain.js";
import type { AvailabilityRule } from "./domain.js";

export type Store = {
  ping(): Promise<void>;
  ensureHost(sub: string): Promise<Host>;
  createEventType(host: Host, input: EventTypeInput): Promise<EventType>;
  getEventType(host: Host, id: string): Promise<EventType>;
  getEventTypeBySlug(slug: string): Promise<EventType>;
  listEventTypes(host: Host): Promise<EventType[]>;
  replaceRules(host: Host, id: string, rules: AvailabilityRule[]): Promise<EventType>;
  replaceOverrides(host: Host, id: string, overrides: DateOverride[]): Promise<EventType>;
  listConfirmedBookings(eventTypeId: string): Promise<Booking[]>;
  findBookingByIdempotency(eventTypeId: string, idempotencyKey: string): Promise<Booking | null>;
  createBooking(eventType: EventType, input: BookingInsert): Promise<{ booking: Booking; created: boolean }>;
  cancelBookingByToken(cancelToken: string): Promise<Booking>;
  getBookingByCancelToken(cancelToken: string): Promise<BookingWithEvent | null>;
  findEventTypeByExternalRef(host: Host, externalRef: string): Promise<EventType | null>;
  getBookingWithEventById(id: string): Promise<BookingWithEvent | null>;
};
