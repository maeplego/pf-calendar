import { newId } from "./ids.js";

export const CALENDAR_BOOKING_CONFIRMED = "calendar.booking.confirmed";

export type BookingConfirmedData = {
  bookingId: string;
  eventTypeId: string;
  externalRef?: string;
  hostSub: string;
  slug: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  guestTimeZone: string;
};

export type CalendarEventEnvelope = {
  id: string;
  type: typeof CALENDAR_BOOKING_CONFIRMED;
  occurredAt: string;
  data: BookingConfirmedData;
};

export function buildBookingConfirmedEvent(
  data: BookingConfirmedData,
  occurredAt: string,
): CalendarEventEnvelope {
  return {
    id: newId(),
    type: CALENDAR_BOOKING_CONFIRMED,
    occurredAt,
    data,
  };
}
