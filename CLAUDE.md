# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 起動コマンド
```
cd C:\Users\ao112\Documents\nippo
claude
```

## プロジェクト概要

「Nice Serviceman 日報」— 個人向け営業KPI管理SPA。ビルドツール不要のバニラJS + GitHub Pages + Google Sheetsアーキテクチャ。

- **フロントエンド**: index.html + js/{app.js, api.js, utils.js} + css/style.css
- **バックエンド**: Google Apps Script (`gas/Code.gs`) — Google Sheetsをデータストアとして使用
- **デプロイ**: `git push` → GitHub Pages 自動反映（ビルドステップなし）
- **AI機能**: Gemini API経由でレポート生成（GAS側で実行）

## アーキテクチャ

### データフロー
```
ユーザー操作 (app.js)
  → api.js (HTTP fetch to GAS Web App URL)
  → gas/Code.gs (doGet/doPost)
  → Google Sheets (entries / budget シート)
```

### 差分入力モデル（重要）
- 1日に複数回入力可能な**積み上げ型**DB
- 保存時に「前回スナップショット (`daySnapshot`) との差分」を行挿入
- 読み取り時に `aggregateByDate()` で日付ごとに合計集計
- **絶対値ではなく差分を保存する** — この前提を崩すと全KPIが壊れる

### 主要な状態変数 (app.js)
| 変数 | 役割 |
|------|------|
| `daySnapshot` | 当日エントリの既存値スナップショット（差分計算用） |
| `historyState` | 履歴タブのフィルター状態 `{ view, yearMonth, year, quarter, allData }` |
| `dashboardChart` | Chart.jsインスタンス（再描画前に必ず `.destroy()` する） |

### タブ構成 (app.js)
1. **入力タブ** — 日次KPI入力フォーム（差分入力）
2. **進捗タブ** — ダッシュボード + Chart.jsゲージ
3. **履歴タブ** — 日次/週次/月次/四半期/年次ビュー + レポート出力
4. **KGI設定タブ** — 月次目標設定

### GAS (gas/Code.gs) の主要関数
| 関数 | 役割 |
|------|------|
| `doGet(e)` | action=getEntries/getBudget/getAllData/getLatestReport |
| `doPost(e)` | action=saveEntry/saveBudget/deleteEntry/generateReport |
| `aggregateByDate()` | 差分行を日付ごとに合計する読み取り集計 |
| `normalizeEntry()` | snake_case→camelCase変換 |
| `generateReport(type)` | Gemini APIでweekly/monthlyレポート生成 |
| `weeklyReportTrigger()` | 金曜18時に自動実行 |
| `monthlyReportTrigger()` | 月末営業日に自動実行 |

## GASデプロイ方法
1. `gas/Code.gs` を編集後、Google Apps Script エディタに貼り付け
2. 「デプロイ」→「デプロイを管理」→「新しいバージョン」で更新
3. **URLは変わらない**（既存のDeployment IDを更新する）
4. APIエンドポイントURLは `js/api.js` 冒頭の `GAS_URL` に設定

## 重要な既知事項

### JST/UTC問題
- ブラウザはUTCで日付を扱う → `getTodayJST()` (utils.js) で+9時間補正
- GAS側は `dateToYMD()` でSpreadsheetのDate型をYYYY-MM-DD変換
- **日付ずれバグの発生源**: Sheetsの Date型はgetTime()がUTC基準のため要注意

### snake_case ↔ camelCase
- Sheetsのカラム名はsnake_case（`promotion_amount`）
- JSオブジェクトはcamelCase（`promotionAmount`）
- GAS内の `snakeToCamel()` が双方向変換

### Chart.js
- Canvas再利用時は `Chart.getChart(canvas)?.destroy()` を必ず呼ぶ

### Service Worker キャッシュ
- バージョンは `sw.js` 内の `CACHE_NAME = 'nippo-v17'`
- JS/CSS変更後は番号を上げないとブラウザにキャッシュが残る

## Phase3 実装方針（確定仕様）

| Step | 内容 | 状態 |
|------|------|------|
| Step12 | DB刷新（積み上げ型）+ マイナス対応 | 完了 |
| Step13 | 過去データ修正機能 | 完了 |
| Step14 | ゲージUI + 連続入力バッジ | 完了 |
| Step15 | Gemini AIレポート（週次・月次） | 完了 |
| Step16 | 月末自動判定 | 完了 |
| Step17 | Gmail通知 | 後回し |

**大きな実装前は必ずPlan Modeで計画確認。**
