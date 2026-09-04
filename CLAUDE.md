# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 起動コマンド
```
cd C:\Users\ao112\Documents\nippo
claude
```

## プロジェクト概要

「Nice Serviceman 日報」— 個人向け営業KPI管理SPA。ビルドツール不要のバニラJS + GitHub Pages + Google Sheetsアーキテクチャ。

- **フロントエンド**: index.html + js/{app.js, api.js, utils.js, parseDayReport.js, parserConfig.js} + css/style.css
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
下部ナビで **personal / office** の2セクションを切り替え、各4タブで計8タブ。

**personal（個人）** — entries / budget シート
1. **入力タブ** — 日次KPI入力フォーム（差分入力）+ 行動タグ + 振り返り
2. **進捗タブ** — ダッシュボード + Chart.jsゲージ + AIレポート
3. **履歴タブ** — 日次/週次/月次/四半期/年次ビュー + 期間比較 + レポート出力
4. **KGI設定タブ** — 月次目標設定 + 行動タグ編集 + 注力事項

**office（営業所）** — officeDaily / officeSalesPlan シート
1. **取込タブ** — 日計表Excel（毎日）と売上計画Excel（月初）の取込
2. **進捗タブ** — 月次/週次トグル + AIレポート
3. **履歴タブ** — 日次〜年次ビュー + 期間比較 + レポート出力
4. **KGI設定タブ** — 売上計画の手入力補完

個人と営業所は**別の名前空間**。個人は `KGI_FIELDS`、営業所は `_OFFICE_KPI_DEFS` を使う。
`inspection` など同名のキーが両方に出てくるが別物なので混同しないこと。

### 金額フィールドの扱い（重要）
- 金額かどうかは `KGI_FIELDS` の **`money: true` フラグ**で判定する。
  `f.unit === '円'` のような**文字列比較で判定しない**（単位ラベルを変えた瞬間に壊れる）
- **金額の単位は「円」**。日報スキル定義には「千円統一」とあるが、
  アプリの実データは円で入っている（例: 個人末見額 2,334,183）。実態が正
- 表示は `formatKpiValue(value, field)`（utils.js）に統一。単位は `field.unit` に委譲
- 金額の入力欄はカンマ区切り表示のため `type="text"`。
  **読み取りは必ず `parseNumericInput()` を通す**。`Number('3,500')` は NaN → 0 になり、
  入力が無言で消える

### 行動タグ
- タグ一覧は `userSettings` シートの `actionTags` キー（カンマ区切り）に保存。
  未設定なら `RELATIONSHIP_ACTIONS`（既定10個）にフォールバック
- KGI設定タブの「🏷 行動タグ」カードで追加/編集/削除
- **タグ名にカンマを含めない**（保存形式が `join(',')` のため）
- 頻度集計 `calcTagFrequency()` は**マスタではなくエントリ実データ**から数える。
  一覧から削除したタグも過去期間には正しく出る
- `buildRelationshipTags()` はマスタに無いタグも描画する。描画しないと
  その日を再保存したときに履歴からタグが消える

### GAS (gas/Code.gs) の主要関数
| 関数 | 役割 |
|------|------|
| `doGet(e)` | action=getEntries/getBudget/getAllData/getLatestReport |
| `doPost(e)` | action=saveEntry/saveBudget/deleteEntry/generateReport |
| `aggregateByDate()` | 差分行を日付ごとに合計する読み取り集計 |
| `normalizeEntry()` | snake_case→camelCase変換 |
| `_ensureSheetColumns_()` | 列定義に足りない物理列とヘッダーを自動確保 |
| `generateReport(type)` | Gemini APIでweekly/monthlyレポート生成 |
| `weeklyReportTrigger()` | 金曜18時に自動実行 |
| `monthlyReportTrigger()` | 月末営業日に自動実行 |

## 受容済みリスク: GAS Web App が「全員」公開

**2026-09-05 あきぼー判断により、当面このまま運用する。未対応なのは把握したうえでの決定であり、
指摘漏れではない。次回以降、この件を再提案しないこと。**

### 何が起きているか
- `js/api.js` の `APPS_SCRIPT_URL` にGASのURLが直書きされ、GitHub Pagesが公開配信している
- GAS側は「アクセスできるユーザー＝全員」（`gas/Code.gs` 冒頭コメント参照）
- 結果、URLを知れば**ログイン不要で誰でも読み書きできる**
- この構成はGitHub Pagesの静的サイトから `fetch()` する上で必須。手抜きではない

### 露出する情報の実態（2026-09-05 時点、全33エントリ）
- 個人情報（氏名・住所・連絡先）は**入っていない**
- ただし `memorableVisit`（訪問先）に法人名・施設名が7日分
- `notes`（メモ）に作業内容が7日分
- つまり「どの取引先に、いつ、何をしたか」まで見えうる

### 再検討すべき条件（これに当てはまったら必ず提起する）
- 個人名・連絡先・住所を保存する項目が追加されたとき
- 他メンバーのデータを扱うようになったとき（現在はあきぼー個人＋営業所集計のみ）
- 会社から情報管理について指摘・ルール変更があったとき

### 対処案（再検討時の出発点）
1. 合言葉方式: リクエストに秘密文字列を付与しGAS側で検証。作業30分程度。
   ただしその文字列も `api.js` に載るため、素通りは防げても本質的解決ではない
2. Googleログイン方式: GASを「自分だけ」に変更。堅いが `fetch()` が使えなくなり
   配信方法ごと作り直しになる

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
- バージョンは `sw.js` 内の `CACHE_NAME`
- JS/CSS変更後は番号を上げないとブラウザにキャッシュが残る

### Sheetsの列追加（重要）
- `sheetToObjects()` は**ヘッダー行を読まず列位置決め打ち**で読む
  （`getRange(2, 1, lastRow-1, cols.length)`）
- `ENTRIES_COLS` / `BUDGET_COLS` に項目を足すときは**必ず末尾に追加**。
  途中挿入すると既存の全行がその位置から右にずれて総崩れになる
- 物理列とヘッダーは `_ensureSheetColumns_()` が自動で確保するので手作業は不要
- 例外は `officeSalesPlan`。こちらは専用実装でヘッダー名マッピングを使う

### 新しい個人KPI項目を追加する手順
1. `js/app.js` `KGI_FIELDS` に `{ key, label, unit, money?, color: 'cyan' }` を追加
2. `js/app.js` `reportSettings` にキーを追加（省略時も既定ONだが整合のため）
3. `js/app.js` 全データCSV（`handleExportAllCsv`）のヘッダー配列と行配列の**両方**に追加
4. `gas/Code.gs` `ENTRIES_COLS` / `BUDGET_COLS` の**末尾**に snake_case で追加
5. `gas/Code.gs` `NUMERIC_ENTRY_KEYS` に追加 ← **必須**。漏れると積み上げ集計されず
   最新行の値だけになる（エラーは出ない）
6. `gas/Code.gs` `normalizeEntry` / `normalizeBudget` / `KPI_KEYS` / `KPI_LABELS` /
   `KPI_UNITS` に追加
7. `sw.js` の `CACHE_NAME` をバンプ
8. GASを新バージョンでデプロイ

入力フォーム・ゲージ・履歴5ビュー・出力設定・レポートCSV・上長報告・PDF印刷は
`KGI_FIELDS` 駆動なので**自動で対応する**。

## Phase3 実装方針（確定仕様）

| Step | 内容 | 状態 |
|------|------|------|
| Step12 | DB刷新（積み上げ型）+ マイナス対応 | 完了 |
| Step13 | 過去データ修正機能 | 完了 |
| Step14 | ゲージUI + 連続入力バッジ | 完了 |
| Step15 | Gemini AIレポート（週次・月次） | 完了 |
| Step16 | 月末自動判定 | 完了 |
| Step17 | Gmail通知 | 後回し |
| Step18 | 金額単位のフラグ化 + カンマ入力 | 完了 |
| Step19 | 行動タグ編集 + 頻度TOP3集計 | 完了 |
| Step20 | 不足KPI4項目追加（提案回収・トスアップ金額・実績化・増産） | 完了 |

**大きな実装前は必ずPlan Modeで計画確認。**
