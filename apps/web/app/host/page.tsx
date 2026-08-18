import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { getHostSession, hostApiFetch } from "../../lib/session";
import { oidcEnabled } from "../../lib/oidc/env";

type EventTypeRow = {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  hostTimeZone: string;
};

export default async function HostDashboard({
  searchParams,
}: {
  searchParams: Promise<{ host?: string; error?: string }>;
}) {
  noStore();
  const sp = await searchParams;
  const session = await getHostSession(sp.host);
  if (oidcEnabled() && !session) {
    redirect("/login");
  }
  const devHost = session!.devMode ? session!.sub : undefined;

  const res = await hostApiFetch("/v1/event-types", session!);
  const list = res.ok ? ((await res.json()) as { eventTypes: EventTypeRow[] }).eventTypes : [];

  return (
    <main>
      <h1>ホストダッシュボード</h1>
      {sp.error && <p style={{ color: "#b00020" }}>エラー: {sp.error}</p>}
      {session!.devMode ? (
        <p>
          開発モード: ホスト <code>{session!.sub}</code>（
          <Link href="/host?host=demo-host-a">demo-host-a</Link> / <Link href="/host?host=demo-host-b">demo-host-b</Link>）
        </p>
      ) : (
        <p>
          ログイン中: {session!.displayName ?? session!.sub} · <Link href="/logout">ログアウト</Link>
        </p>
      )}

      <p>
        <Link href={`/host/event-types/new${devHost ? `?host=${encodeURIComponent(devHost)}` : ""}`}>イベントタイプを作成</Link>
      </p>

      <h2>イベントタイプ</h2>
      {list.length === 0 ? (
        <p>まだありません。作成してください。</p>
      ) : (
        <ul>
          {list.map((row) => (
            <li key={row.id} style={{ marginBottom: "0.75rem" }}>
              <Link href={`/host/event-types/${row.id}${devHost ? `?host=${encodeURIComponent(devHost)}` : ""}`}>{row.name}</Link>
              {" — "}
              <Link href={`/book/${row.slug}`}>/book/{row.slug}</Link>
              <span style={{ color: "#666" }}> ({row.durationMinutes} 分, {row.hostTimeZone})</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
