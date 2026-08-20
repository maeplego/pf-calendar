import Link from "next/link";

import { oidcEnabled } from "../lib/oidc/env";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1 className="page-title">予約・日程調整（Calendly ミニ）</h1>
        <p className="page-lead">
          ホストは空きルールを設定し、ゲストは公開ページから枠を予約します。空き計算は API が行います。
        </p>
      </section>
      <div className="card-grid">
        <article className="card">
          <Link href="/host" className="link-card">
            <strong>ホストダッシュボード</strong>
            <p className="muted">
              イベントタイプと空きルールを管理
              {!oidcEnabled() && (
                <>
                  {" "}
                  — 開発中は <code>?host=</code> でホストを切り替え
                </>
              )}
            </p>
          </Link>
        </article>
        <article className="card">
          <Link href="/book/demo-30" className="link-card">
            <strong>ゲスト公開ページ</strong>
            <p className="muted">例: /book/demo-30（イベントタイプ作成後）</p>
          </Link>
        </article>
      </div>
    </>
  );
}
