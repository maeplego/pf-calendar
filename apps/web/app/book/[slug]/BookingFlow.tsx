"use client";

import { Temporal } from "@js-temporal/polyfill";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  browserTimeZone,
  defaultSlotRange,
  formatSlotLabel,
  groupStartsByLocalDate,
  plainDateInZone,
  validateTimeZone,
} from "../../../lib/time";

type SlotsPayload = {
  slug: string;
  name: string;
  durationMinutes: number;
  hostTimeZone: string;
  starts: string[];
};

type BookResult = {
  id: string;
  start: string;
  end: string;
  guestTimeZone: string;
  cancelToken?: string;
};

export function BookingFlow({ slug, apiBase }: { slug: string; apiBase: string }) {
  const [guestTimeZone, setGuestTimeZone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SlotsPayload | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<BookResult | null>(null);

  useEffect(() => {
    setGuestTimeZone(browserTimeZone());
  }, []);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rangeStart, rangeEnd } = defaultSlotRange();
    const q = new URLSearchParams({ rangeStart, rangeEnd });
    try {
      const res = await fetch(`${apiBase}/public/${encodeURIComponent(slug)}/slots?${q}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `slots ${res.status}`);
      }
      const data = (await res.json()) as SlotsPayload;
      setMeta(data);
      const grouped = groupStartsByLocalDate(data.starts, guestTimeZone);
      const firstDay = [...grouped.keys()].sort()[0] ?? "";
      setSelectedDay((prev) => (prev && grouped.has(prev) ? prev : firstDay));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load slots");
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, slug, guestTimeZone]);

  useEffect(() => {
    if (validateTimeZone(guestTimeZone)) {
      void loadSlots();
    }
  }, [guestTimeZone, loadSlots]);

  const grouped = useMemo(() => {
    if (!meta) {
      return new Map<string, string[]>();
    }
    return groupStartsByLocalDate(meta.starts, guestTimeZone);
  }, [meta, guestTimeZone]);

  const days = useMemo(() => [...grouped.keys()].sort(), [grouped]);
  const slotsForDay = selectedDay ? (grouped.get(selectedDay) ?? []) : [];

  async function submitBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStart || !meta) {
      return;
    }
    setBooking(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`${apiBase}/public/${encodeURIComponent(slug)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: selectedStart,
          name,
          email,
          guestTimeZone,
          idempotencyKey,
        }),
      });
      const body = (await res.json()) as BookResult & { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `book ${res.status}`);
      }
      setResult(body);
      setSelectedStart(null);
      await loadSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "booking failed");
    } finally {
      setBooking(false);
    }
  }

  if (result) {
    return (
      <section>
        <h2>予約が確定しました</h2>
        <p>
          <strong>{meta?.name ?? slug}</strong>
        </p>
        <p>
          ゲスト TZ ({guestTimeZone}): {formatSlotLabel(result.start, guestTimeZone)}
        </p>
        {meta && (
          <p>
            ホスト TZ ({meta.hostTimeZone}): {formatSlotLabel(result.start, meta.hostTimeZone)}
          </p>
        )}
        {result.cancelToken && (
          <>
            <p style={{ wordBreak: "break-all" }}>
              キャンセルトークン（この画面で一度だけ表示）: <code>{result.cancelToken}</code>
            </p>
            <p>
              <a href={`/cancel?token=${encodeURIComponent(result.cancelToken)}`}>キャンセルページを開く</a>
              {" · "}
              <a
                href={`${apiBase}/public/bookings/ics?token=${encodeURIComponent(result.cancelToken)}`}
                download={`booking-${result.id}.ics`}
              >
                カレンダー (.ics) をダウンロード
              </a>
            </p>
          </>
        )}
        <button type="button" onClick={() => setResult(null)}>
          別の枠を予約
        </button>
      </section>
    );
  }

  return (
    <section>
      <h2>{meta?.name ?? slug}</h2>
      {meta && (
        <p style={{ color: "#555" }}>
          {meta.durationMinutes} 分 · ホスト TZ: {meta.hostTimeZone}
        </p>
      )}

      <label style={{ display: "block", margin: "1rem 0" }}>
        表示タイムゾーン（ゲスト）
        <input
          value={guestTimeZone}
          onChange={(e) => setGuestTimeZone(e.target.value)}
          list="tz-list"
          style={{ display: "block", width: "100%", maxWidth: 320, marginTop: 4 }}
        />
      </label>
      <datalist id="tz-list">
        <option value="Asia/Tokyo" />
        <option value="America/Los_Angeles" />
        <option value="Europe/London" />
        <option value="UTC" />
      </datalist>

      {loading && <p>空き枠を読み込み中…</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {!loading && meta && days.length === 0 && <p>この期間に予約可能な枠がありません。</p>}

      {days.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  setSelectedDay(day);
                  setSelectedStart(null);
                }}
                style={{
                  padding: "0.4rem 0.75rem",
                  border: selectedDay === day ? "2px solid #333" : "1px solid #ccc",
                  background: selectedDay === day ? "#f0f0f0" : "#fff",
                }}
              >
                {day}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slotsForDay.map((iso) => (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedStart(iso)}
                style={{
                  padding: "0.5rem 0.75rem",
                  border: selectedStart === iso ? "2px solid #0066cc" : "1px solid #ccc",
                }}
              >
                {Temporal.Instant.from(iso).toZonedDateTimeISO(guestTimeZone).toPlainTime().toString({ smallestUnit: "minute" })}
                {meta && (
                  <span style={{ color: "#666", fontSize: "0.85em", marginLeft: 6 }}>
                    ({plainDateInZone(iso, meta.hostTimeZone)} ホスト)
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {selectedStart && (
        <form onSubmit={submitBook} style={{ marginTop: "1.5rem", maxWidth: 400 }}>
          <p>選択: {formatSlotLabel(selectedStart, guestTimeZone)}</p>
          <label style={{ display: "block", marginBottom: 8 }}>
            お名前
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            メール
            <input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <button type="submit" disabled={booking}>
            {booking ? "予約中…" : "予約する"}
          </button>
        </form>
      )}
    </section>
  );
}
