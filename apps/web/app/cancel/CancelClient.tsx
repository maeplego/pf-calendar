"use client";

import { useState } from "react";

import { formatSlotLabel } from "../../lib/time";

export function CancelClient({ apiBase, token }: { apiBase: string; token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [booking, setBooking] = useState<{ start: string; end: string; guestTimeZone?: string } | null>(null);

  async function cancel() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${apiBase}/public/bookings/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelToken: token }),
      });
      const body = (await res.json()) as { status?: string; start?: string; end?: string; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `cancel ${res.status}`);
      }
      setBooking({ start: body.start!, end: body.end! });
      setStatus("done");
      setMessage(body.status === "cancelled" ? "予約をキャンセルしました。" : "完了しました。");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "cancel failed");
    }
  }

  return (
    <section>
      <p>トークンで予約を取り消します。</p>
      {status === "done" ? (
        <>
          <p>{message}</p>
          {booking && <p>取消した枠: {formatSlotLabel(booking.start, "UTC")} — {formatSlotLabel(booking.end, "UTC")} (UTC)</p>}
        </>
      ) : (
        <button type="button" onClick={() => void cancel()} disabled={status === "loading" || !token}>
          {status === "loading" ? "取消中…" : "予約をキャンセルする"}
        </button>
      )}
      {status === "error" && <p style={{ color: "#b00020" }}>{message}</p>}
    </section>
  );
}
