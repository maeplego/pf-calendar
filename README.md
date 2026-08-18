# pf-calendar

P05 の予約・日程調整です。**本番 Calendly の置き換えではありません。** 学習用ポートフォリオです。

空きルールからスロットを生成し、ホスト現地のタイムゾーンで矛盾しない枠だけを出します。予約確定は後続スライスの API が正で、このパッケージは計算だけを担います。

```
packages/slot-engine/  スロット計算の純関数（Temporal）。web / api から共有する
```

`apps/web`、`apps/api`、`apps/worker`、`deploy/` は次スライスで足します。

## テスト

```powershell
npm test
```

ホスト TZ（`Asia/Tokyo`）とゲスト表示（`America/Los_Angeles`）、DST、バッファ、min notice、例外日、14 日上限を `packages/slot-engine` で検証します。
