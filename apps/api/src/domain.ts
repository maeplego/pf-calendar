export type Host = {
  id: string;
  sub: string;
};

export type AvailabilityRule = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
};

export type DateOverride = {
  date: string;
  blocked: boolean;
};

export type EventType = {
  id: string;
  hostId: string;
  slug: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  hostTimeZone: string;
  rules: AvailabilityRule[];
  overrides: DateOverride[];
};

export type EventTypeInput = {
  slug: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  hostTimeZone: string;
  rules: AvailabilityRule[];
};

export type Booking = {
  id: string;
  eventTypeId: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  guestTimeZone: string;
  status: "confirmed";
  idempotencyKey: string;
};

export type BookingInsert = {
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  guestTimeZone: string;
  idempotencyKey: string;
  cancelTokenHash: string;
};

export class NotFoundError extends Error {
  readonly name = "NotFoundError";
  constructor(message = "not found") {
    super(message);
  }
}

export class ConflictError extends Error {
  readonly name = "ConflictError";
  constructor(message: string) {
    super(message);
  }
}

export class SlotUnavailableError extends Error {
  readonly name = "SlotUnavailableError";
  constructor() {
    super("slot unavailable");
  }
}
