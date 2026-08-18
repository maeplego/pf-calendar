import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { createEventTypeAction } from "../../actions";
import { getHostSession } from "../../../../lib/session";
import { oidcEnabled } from "../../../../lib/oidc/env";

export default async function NewEventTypePage({
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

  return (
    <main>
      <p>
        <Link href={`/host${devHost ? `?host=${encodeURIComponent(devHost)}` : ""}`}>← ダッシュボード</Link>
      </p>
      <h1>イベントタイプを作成</h1>
      {sp.error && <p style={{ color: "#b00020" }}>{sp.error}</p>}
      <form action={createEventTypeAction} style={{ maxWidth: 420 }}>
        {devHost && <input type="hidden" name="_host" value={devHost} />}
        <label style={{ display: "block", marginBottom: 8 }}>
          名前
          <input name="name" required defaultValue="Casual 30" style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          slug（公開 URL）
          <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue="demo-30" style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          所要時間（分）
          <input name="durationMinutes" type="number" min={5} step={5} defaultValue={30} style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          ホスト TZ
          <input name="hostTimeZone" required defaultValue="Asia/Tokyo" style={{ display: "block", width: "100%" }} />
        </label>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>初期ルール: 月–金 09:00–12:00（後から API で変更可）</p>
        <button type="submit">作成</button>
      </form>
    </main>
  );
}
