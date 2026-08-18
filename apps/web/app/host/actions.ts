"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hostApiFetch, requireHostSession, type HostSession } from "../../lib/session";

async function sessionFromForm(formData: FormData): Promise<HostSession> {
  const devHost = String(formData.get("_host") ?? "");
  return requireHostSession(devHost || undefined);
}

export async function createEventTypeAction(formData: FormData) {
  const session = await sessionFromForm(formData);
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes") ?? 30);
  const hostTimeZone = String(formData.get("hostTimeZone") ?? "Asia/Tokyo").trim();
  const res = await hostApiFetch("/v1/event-types", session, {
    method: "POST",
    body: JSON.stringify({
      slug,
      name,
      durationMinutes,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      hostTimeZone,
      rules: [
        { dayOfWeek: 1, startLocal: "09:00", endLocal: "12:00" },
        { dayOfWeek: 2, startLocal: "09:00", endLocal: "12:00" },
        { dayOfWeek: 3, startLocal: "09:00", endLocal: "12:00" },
        { dayOfWeek: 4, startLocal: "09:00", endLocal: "12:00" },
        { dayOfWeek: 5, startLocal: "09:00", endLocal: "12:00" },
      ],
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    redirect(`/host/event-types/new?error=${encodeURIComponent(err?.error?.message ?? "create failed")}`);
  }
  const body = (await res.json()) as { id: string };
  revalidatePath("/host");
  redirect(`/host/event-types/${body.id}`);
}
