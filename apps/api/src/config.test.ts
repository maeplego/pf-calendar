import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("calendar config", () => {
  it("defaults CORS to the local web origin instead of *", () => {
    expect(loadConfig({ CALENDAR_HTTP_PORT: "8095" }).corsOrigin).toBe("http://localhost:3005");
    expect(loadConfig({ CALENDAR_HTTP_PORT: "8095", CALENDAR_CORS_ORIGIN: "*" }).corsOrigin).toBe("*");
  });
});
