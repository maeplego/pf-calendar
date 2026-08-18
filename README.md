# pf-calendar

P05 の予約・日程調整です。**本番 Calendly の置き換えではありません。** 学習用ポートフォリオです。

空きルールからスロットを生成し、ホスト現地のタイムゾーンで矛盾しない枠だけを出します。予約確定の正は `apps/api` です。公開予約に IdP は不要です。

```
packages/slot-engine/  スロット計算の純関数（Temporal）
apps/api/              Hono。イベントタイプと公開 book。枠は slot-engine、重複は DB exclusion
apps/web/              Next.js。公開予約 UI + ホストダッシュボード（book は API を直接呼ぶ）
deploy/                Postgres + API + Web Compose
```

`apps/worker` は次スライス以降です。

要件・仕様・設計・テスト・API・図表はメタリポジトリの `project/portfolio-plan/calendar/docs/`。

## 起動（Compose）

```powershell
copy deploy\.env.example deploy\.env
docker compose -f deploy/compose.yaml --env-file deploy/.env up --build
```

| URL | 用途 |
| --- | --- |
| http://localhost:3005 | Web UI（公開予約 + ホスト） |
| http://localhost:8095/health | API liveness |
| http://localhost:8095/public/:slug/slots | ゲスト向け空き枠 |
| http://localhost:8095/public/:slug/book | ゲスト予約 |

## 開発（ホスト）

```powershell
npm install
# ターミナル 1: API（DB なしならメモリ）
$env:CALENDAR_DATABASE_URL=""
$env:CALENDAR_CORS_ORIGIN="http://localhost:3005"
npm run dev -w @pf-calendar/api

# ターミナル 2: Web
$env:CALENDAR_API_URL="http://localhost:8095"
$env:NEXT_PUBLIC_CALENDAR_API_URL="http://localhost:8095"
npm run dev -w @pf-calendar/web
```

開発中のホスト認証は `X-Dev-Host-Sub`（Web は `/host?host=demo-host-a` で切替）。P01 OIDC 連携時は `deploy/.env.example` の OIDC 節を参照。

## デモ手順

1. http://localhost:3005/host でイベントタイプ作成（slug 例: `demo-30`）
2. http://localhost:3005/book/demo-30 でゲスト TZ を切替しながら枠を予約
3. ホスト詳細画面で確定予約を確認

## テスト

```powershell
npm test
```

`packages/slot-engine` と `apps/api`（httptest + メモリ store）。Web は手動デモ。
