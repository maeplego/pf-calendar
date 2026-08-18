# pf-calendar

P05 の予約・日程調整です。**本番 Calendly の置き換えではありません。** 学習用ポートフォリオです。

空きルールからスロットを生成し、ホスト現地のタイムゾーンで矛盾しない枠だけを出します。予約確定の正は `apps/api` です。公開予約に IdP は不要です。

```
packages/slot-engine/  スロット計算の純関数（Temporal）
packages/openapi/      OpenAPI 3.1（GET /openapi.yaml で配信）
apps/api/              Hono。公開 book / キャンセル / ICS / internal API / outbox
apps/web/              Next.js。公開予約 UI + ホストダッシュボード
apps/worker/           24h / 1h リマインド + outbox webhook 配信
deploy/                Postgres + API + Web + Worker Compose
```

要件・仕様・設計・テスト・API・図表はメタリポジトリの `project/portfolio-plan/calendar/docs/`。

## 起動（Compose）

```powershell
copy deploy\.env.example deploy\.env
docker compose -f deploy/compose.yaml --env-file deploy/.env up --build
```

| URL | 用途 |
| --- | --- |
| http://localhost:3005 | Web UI |
| http://localhost:8095/health | API |
| http://localhost:8095/openapi.yaml | OpenAPI |
| http://localhost:8025 | Mailhog（リマインド確認） |

## デモ手順

1. `/host` でイベントタイプ作成（slug 例: `demo-30`）
2. `/book/demo-30` で予約（完了画面から .ics / キャンセルリンク）
3. `/cancel?token=...` で取消
4. 内部 API（P10 用）: `CALENDAR_INTERNAL_TOKEN` を設定し `POST /internal/v1/event-types`
5. P10 webhook: `CALENDAR_WEBHOOK_URL` を worker に設定。予約確定で `calendar.booking.confirmed` が POST される

## P05 ↔ P10 連携デモ

P10 talent-api と組み合わせた予約確定→面接ステータス更新デモの手順は `project/portfolio-plan/integration-demo.md` の「P05 ↔ P10」節を参照。

## テスト

```powershell
npm test
```

slot-engine、api、worker の vitest。Web は手動デモ。

Postgres exclusion（TS-M01）:

```powershell
$env:CALENDAR_DATABASE_URL='postgres://calendar:calendar@localhost:5434/calendar'
npm test -w @pf-calendar/api
```

Compose 起動中でない場合は integration テストは skip される。
