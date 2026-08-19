# pf-calendar

学習用の予約・日程調整です。空きルールからスロットを作り、ホスト現地のタイムゾーンで矛盾しない枠だけを出します。公開予約に Identity Provider は不要です。**Calendly などの置き換えではありません。**

| ディレクトリ | 役割 |
| --- | --- |
| `packages/slot-engine` | スロット計算（純関数） |
| `apps/api` | 公開予約、キャンセル、ICS、内部 API |
| `apps/web` | 公開予約とホスト画面 |
| `apps/worker` | リマインドと webhook 配信 |
| `deploy/` | Postgres + API + Web + Worker |

## 起動

```powershell
copy deploy\.env.example deploy\.env
docker compose -f deploy/compose.yaml --env-file deploy/.env up --build
```

| URL | 用途 |
| --- | --- |
| http://localhost:3005 | Web |
| http://localhost:8095/health | API |
| http://localhost:8095/openapi.yaml | OpenAPI |
| http://localhost:8025 | Mailhog（リマインド確認） |

公開予約 API の CORS 既定は `http://localhost:3005` です。

## デモ

1. `/host` でイベントタイプを作る（slug 例: `demo-30`）
2. `/book/demo-30` で予約する。完了画面から .ics とキャンセルリンクが取れます
3. `/cancel?token=...` で取り消せます

求人アプリ [pf-talent-api](https://github.com/maeplego/pf-talent-api) 向けに、予約確定で `calendar.booking.confirmed` を POST できます（`CALENDAR_WEBHOOK_URL`）。

## テスト

```powershell
npm test
```

slot-engine、api、worker のユニットテストです。Postgres の exclusion テストは、Compose が無いときは skip します。

公開予約のブラウザ確認（メモリ API。既定 CI では動かない）:

```powershell
cd apps/e2e
npx playwright install chromium
npx playwright test
```

Compose 起動後のヘルス:

```powershell
node scripts/compose-smoke.mjs http://localhost:8095/health http://localhost:8095/ready
```

設計の詳細は [portfolio-plan](https://github.com/maeplego/portfolio-plan) の `portfolio-plan/calendar/docs/` です。
