export type Clock = {
  nowIso(): string;
};

export const systemClock: Clock = {
  nowIso() {
    return new Date().toISOString();
  },
};
