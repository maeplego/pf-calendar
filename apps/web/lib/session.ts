import { readCookie } from "./oidc/cookies";
import { calendarApiBase, internalBase, oidcEnabled } from "./oidc/env";

export type HostSession = {
  sub: string;
  accessToken?: string;
  displayName?: string;
  devMode: boolean;
};

export async function getHostSession(devHost?: string): Promise<HostSession | null> {
  if (!oidcEnabled()) {
    return { sub: devHost?.trim() || "demo-host", devMode: true };
  }
  const access = await readCookie("rp_access");
  if (!access) {
    return null;
  }
  const res = await fetch(`${internalBase()}/userinfo`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  const ui = (await res.json()) as { sub?: string; name?: string; email?: string };
  if (!ui.sub) {
    return null;
  }
  return {
    sub: ui.sub,
    accessToken: access,
    displayName: ui.name || ui.email || ui.sub,
    devMode: false,
  };
}

export async function requireHostSession(devHost?: string): Promise<HostSession> {
  const session = await getHostSession(devHost);
  if (!session) {
    throw new Error("unauthorized");
  }
  return session;
}

export function hostAuthHeaders(session: HostSession): Record<string, string> {
  if (session.accessToken) {
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  return { "X-Dev-Host-Sub": session.sub };
}

export async function hostApiFetch(path: string, session: HostSession, init?: RequestInit): Promise<Response> {
  return fetch(`${calendarApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...hostAuthHeaders(session),
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
}
