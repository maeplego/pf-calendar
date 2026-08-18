import type { DateOverride, EventType, EventTypeInput, Host } from "./domain.js";
import type { AvailabilityRule } from "./domain.js";

export type Store = {
  ping(): Promise<void>;
  ensureHost(sub: string): Promise<Host>;
  createEventType(host: Host, input: EventTypeInput): Promise<EventType>;
  getEventType(host: Host, id: string): Promise<EventType>;
  listEventTypes(host: Host): Promise<EventType[]>;
  replaceRules(host: Host, id: string, rules: AvailabilityRule[]): Promise<EventType>;
  replaceOverrides(host: Host, id: string, overrides: DateOverride[]): Promise<EventType>;
};
