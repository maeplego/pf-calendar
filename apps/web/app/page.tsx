import Link from "next/link";

import { oidcEnabled } from "../lib/oidc/env";

export default function HomePage() {
  return (
    <main>
      <h1>予約・日程調整（Calendly ミニ）</h1>
      <p>ホストは空きルールを設定し、ゲストは公開ページから枠を予約します。空き計算は API が行います。</p>
      <ul>
        <li>
          <Link href="/host">ホストダッシュボード</Link>
          {!oidcEnabled() && <> — 開発中は <code>?host=</code> でホストを切り替え</>}
        </li>
        <li>
          ゲスト公開 URL の例: <Link href="/book/demo-30">/book/demo-30</Link>（イベントタイプ作成後）
        </li>
      </ul>
    </main>
  );
}
