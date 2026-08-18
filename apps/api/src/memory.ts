import { ConflictError, NotFoundError, type DateOverride, type EventType, type EventTypeInput, type Host } from "./domain.js";
import { newId } from "./ids.js";
import type { AvailabilityRule } from "./domain.js";
import type { Store } from "./store.js";

export class MemoryStore implements Store {
  private hostsBySub = new Map<string, Host>();
  private eventTypes = new Map<string, EventType>();

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
