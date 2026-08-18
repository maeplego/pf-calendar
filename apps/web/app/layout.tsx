export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem", maxWidth: 880, lineHeight: 1.5 }}>
        <header style={{ marginBottom: "2rem", borderBottom: "1px solid #ddd", paddingBottom: "1rem" }}>
          <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <strong>pf-calendar</strong>
          </a>
          <span style={{ color: "#666", marginLeft: "0.75rem", fontSize: "0.9rem" }}>学習用予約デモ</span>
        </header>
        {children}
      </body>
    </html>
  );
}
