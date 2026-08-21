import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("calendar config", () => {
  it("defaults CORS to the local web origin instead of *", () => {
    expect(loadConfig({ CALENDAR_HTTP_PORT: "8095" }).corsOrigin).toBe("http://localhost:3005");
    expect(loadConfig({ CALENDAR_HTTP_PORT: "8095", CALENDAR_CORS_ORIGIN: "*" }).corsOrigin).toBe("*");
    expect(loadConfig({ CALENDAR_HTTP_PORT: "8095" }).env).toBe("development");
  });

  it("rejects staging with DEV_AUTH", () => {
    expect(() =>
      loadConfig({
        CALENDAR_ENV: "staging",
        CALENDAR_DEV_AUTH: "true",
        OIDC_ISSUER: "http://idp.localhost",
      }),
    ).toThrow(/CALENDAR_DEV_AUTH must be false/);
  });

  it("requires OIDC on staging", () => {
    expect(() =>
      loadConfig({
        CALENDAR_ENV: "staging",
        CALENDAR_DEV_AUTH: "false",
      }),
    ).toThrow(/OIDC_ISSUER is required/);
  });

  it("accepts staging with OIDC and DEV_AUTH off", () => {
    const cfg = loadConfig({
      CALENDAR_ENV: "staging",
      CALENDAR_DEV_AUTH: "false",
      OIDC_ISSUER: "http://idp.localhost",
    });
    expect(cfg.env).toBe("staging");
    expect(cfg.devAuth).toBe(false);
  });
});
