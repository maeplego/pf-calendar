import { BookingFlow } from "./BookingFlow";
import { publicApiBase } from "../../../lib/oidc/env";

export default async function PublicBookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main>
      <p style={{ marginBottom: "1rem" }}>
        <a href="/">← トップ</a>
      </p>
      <BookingFlow slug={slug} apiBase={publicApiBase()} />
    </main>
  );
}
