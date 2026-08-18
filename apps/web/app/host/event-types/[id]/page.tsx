import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { Temporal } from "@js-temporal/polyfill";

import { getHostSession, hostApiFetch } from "../../../../lib/session";
import { oidcEnabled } from "../../../../lib/oidc/env";
import { formatSlotLabel } from "../../../../lib/time";

type EventTypeDetail = {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  hostTimeZone: string;
  rules: { dayOfWeek: number; startLocal: string; endLocal: string }[];
};

type BookingRow = {
  id: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  guestTimeZone: string;
};

export default async function EventTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ host?: string }>;
}) {
  noStore();
  const { id } = await params;
  const sp = await searchParams;
  const session = await getHostSession(sp.host);
  if (oidcEnabled() && !session) {
    redirect("/login");
  }
  const devHost = session!.devMode ? session!.sub : undefined;
  const hostQ = devHost ? `?host=${encodeURIComponent(devHost)}` : "";

  const etRes = await hostApiFetch(`/v1/event-types/${id}`, session!);
  if (!etRes.ok) {
    redirect(`/host${hostQ}`);
  }
  const eventType = (await etRes.json()) as EventTypeDetail;

  const bkRes = await hostApiFetch(`/v1/event-types/${id}/bookings`, session!);
  const bookings = bkRes.ok ? ((await bkRes.json()) as { bookings: BookingRow[] }).bookings : [];

  const rangeStart = Temporal.Now.instant().toString();
  const rangeEnd = Temporal.Now.instant().add({ hours: 14 * 24 }).toString();
  const slotsRes = await hostApiFetch(
    `/v1/event-types/${id}/slots?rangeStart=${encodeURIComponent(rangeStart)}&rangeEnd=${encodeURIComponent(rangeEnd)}`,
    session!,
  );
  const starts = slotsRes.ok ? ((await slotsRes.json()) as { starts: string[] }).starts : [];

  const dow = ["", "月", "火", "水", "木", "金", "土", "日"];

  return (
    <main>
      <p>
        <Link href={`/host${hostQ}`}>← ダッシュボード</Link>
      </p>
      <h1>{eventType.name}</h1>
      <p>
        公開: <Link href={`/book/${eventType.slug}`}>/book/{eventType.slug}</Link> · {eventType.durationMinutes} 分 ·{" "}
        {eventType.hostTimeZone}
      </p>

      <h2>空きルール</h2>
      <ul>
        {eventType.rules.map((r) => (
          <li key={r.dayOfWeek}>
            {dow[r.dayOfWeek]} {r.startLocal}–{r.endLocal}
          </li>
        ))}
      </ul>

      <h2>今後のオファー枠（先頭 8 件）</h2>
      {starts.length === 0 ? (
        <p>なし</p>
      ) : (
        <ul>
          {starts.slice(0, 8).map((iso) => (
            <li key={iso}>{formatSlotLabel(iso, eventType.hostTimeZone)}</li>
          ))}
        </ul>
      )}

      <h2>確定予約</h2>
      {bookings.length === 0 ? (
        <p>まだありません。</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">開始（ホスト TZ）</th>
              <th align="left">ゲスト</th>
              <th align="left">ゲスト TZ</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{formatSlotLabel(b.start, eventType.hostTimeZone)}</td>
                <td>
                  {b.guestName} ({b.guestEmail})
                </td>
                <td>{b.guestTimeZone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
