import "./globals.css";

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <div className="site-brand">
              <a href="/" className="brand-link">
                <strong>pf-calendar</strong>
              </a>
              <span className="muted">学習用予約デモ</span>
            </div>
            <nav className="site-nav">
              <a href="/">ホーム</a>
              <a href="/host">ホストダッシュボード</a>
            </nav>
          </header>
          <main className="site-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
