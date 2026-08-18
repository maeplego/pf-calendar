# pf-calendar

P05 の予約・日程調整です。**本番 Calendly の置き換えではありません。** 学習用ポートフォリオです。

空きルールからスロットを生成し、ホスト現地のタイムゾーンで矛盾しない枠だけを出します。予約確定の正は `apps/api` です（スライス 3 で `POST book`）。

```
packages/slot-engine/  スロット計算の純関数（Temporal）
apps/api/              Hono。イベントタイプ / 空きルール / 例外日。枠は slot-engine
deploy/                Postgres + API Compose
```

`apps/web` と `apps/worker` は次スライス以降です。ホスト認証は暫定で `X-Dev-Host-Sub`（P01 OIDC はスライス 4）。

## 起動

```powershell
docker compose -f deploy/compose.yaml up --build
```

| URL | 用途 |
| --- | --- |
| http://localhost:8095/health | liveness |
| http://localhost:8095/v1/event-types | ホスト API（ヘッダ `X-Dev-Host-Sub` 必須） |

ホストなしで API だけ動かすときは `CALENDAR_DATABASE_URL` を空にするとメモリ実装になります。

## テスト

```powershell
npm test
```

`packages/slot-engine` と `apps/api`（httptest + メモリ store）。Postgres は Compose 用で、単体テストは DB を要求しません。
