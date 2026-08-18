import { createServer } from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { createHostAuth } from "./auth.js";

const jwksServer = createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

await new Promise<void>((resolve) => jwksServer.listen(0, resolve));
const port = (jwksServer.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  jwksServer.close();
});

describe("createHostAuth", () => {
  it("accepts X-Dev-Host-Sub when dev auth is on", async () => {
    const auth = createHostAuth({
      devAuth: true,
      oidcIssuer: "",
      oidcInternalBase: "",
      oidcAudience: "",
    });
    const headers = new Headers({ "X-Dev-Host-Sub": "host-a" });
    await expect(auth.resolveSub(headers)).resolves.toBe("host-a");
  });

  it("rejects dev header when dev auth is off", async () => {
    const auth = createHostAuth({
      devAuth: false,
      oidcIssuer: base,
      oidcInternalBase: base,
      oidcAudience: "",
    });
    const headers = new Headers({ "X-Dev-Host-Sub": "host-a" });
    await expect(auth.resolveSub(headers)).resolves.toBeNull();
  });

  it("resolves sub from userinfo for opaque bearer tokens", async () => {
    const userinfo = createServer((req, res) => {
      if (req.url === "/userinfo" && req.headers.authorization === "Bearer opaque-token") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sub: "oidc-user-1" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => userinfo.listen(0, resolve));
    const userPort = (userinfo.address() as { port: number }).port;
    const issuer = `http://127.0.0.1:${userPort}`;

    const auth = createHostAuth({
      devAuth: false,
      oidcIssuer: issuer,
      oidcInternalBase: issuer,
      oidcAudience: "calendar-web",
    });
    const headers = new Headers({ Authorization: "Bearer opaque-token" });
    await expect(auth.resolveSub(headers)).resolves.toBe("oidc-user-1");
    userinfo.close();
  });
});
