import Link from "next/link";

import { CancelClient } from "./CancelClient";
import { publicApiBase } from "../../lib/oidc/env";

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const token = sp.token?.trim() ?? "";
  return (
    <main>
      <p>
        <Link href="/">← トップ</Link>
      </p>
      <h1>予約キャンセル</h1>
      {!token ? <p>トークンがありません。予約完了画面のリンクから開いてください。</p> : <CancelClient apiBase={publicApiBase()} token={token} />}
    </main>
  );
}
