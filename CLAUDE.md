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
1. **入力タブ** — 日次KPI入力（KPI実績 / 活動内訳 / 末見額の3カード）+ 行動タグ + 振り返り
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

### UIの寄せ方（2026-09-05 統一）
- **進捗タブは個人・営業所とも「1枚のカードに全項目が縦に並ぶ」形**。
  営業所も個人の `renderMonthlyKgiProgress` と同じ `.weekly-gauge-row` を使う。
  セクション分け（促進/点検/売上/保守/継続/翌月以降）は**廃止**した。
  カードが分かれていると隙間が「区切り」になって見づらい、というのが元の指摘
- 行の見せ方は **目標あり＝ゲージ（バー付き）／目標なし＝数値のみ**。
  「目標未設定」のような文字は出さない
- **履歴タブは営業所の見た目に統一**。個人のカードにも総合達成率＋ステータスバッジ、
  KPIごとのバー、前期比Δを入れた。CSSクラスは営業所の `ohist-*` を共用する
- `.office-section` / `.office-gauge-*` / `.office-field-*` のCSSは
  **取込モーダルがまだ使っているので消さないこと**（進捗タブが使わなくなっただけ）

### 進捗タブの項目定義
- 個人は `KGI_FIELDS`（`color: 'cyan'` の18項目）
- 営業所は `_OFFICE_PROGRESS_ITEMS`（14項目）。
  `planKey` があればゲージ、無ければ `valueKey` の数値のみ。
  `members` を持つ項目はそのゲージ行の中に所員別ブロックがぶら下がる
- **表示設定のチェックボックスと行の並べ替えidもこの配列から作る。**
  項目を足すときは配列に1行足すだけでよい

### UI設定の保存（表示/非表示・並び順・出力設定）
- `userSettings` シートの **`uiSettings` キー1本**にJSONで入れる。
  `saveUserSettings` は1キーずつの保存なので、まとめると通信が1回で済む
- 形: `{ sortOrder: {<コンテナid>: [...]}, progressHidden: {personal|office: [...]},
  reportSettings: {personal|office: {...}}, updatedAt: <ms> }`
- **localStorage はキャッシュ**。起動時に `loadUiSettingsFromCache()` で即適用し、
  `loadUiSettingsFromServer()` がサーバー値と突き合わせる
- **サーバー値を無条件に採らないこと。** `updatedAt` が新しい方を残す。
  無条件にすると、電波が無いときに変えた設定（保存が届いていない）が次の起動で消える
- サーバーへの保存は**800msデバウンス**。チェックを連続で変えても最後の1回だけ送る
- 旧 `sortOrder_<tabId>`（端末ごと保存）は `_migrateLegacySortOrder()` が1回だけ
  取り込む。古いキーは消さない
- 出力設定（履歴タブ）も同じ仕組みで保存する。以前はメモリ上だけでリロードすると
  全部ONに戻っていた

### 並べ替えは2階層
- **カード単位**（タブ直下の `.sort-item`）と**行単位**（進捗タブの各項目）の2つ
- 仕組みは同じ `initSortable` 一式。要素とコンテナidさえあれば入れ子でも動く
- **`_onSortPointerMove` はドロップ先を探すとき親をたどること。**
  `elBelow.closest('.sort-item')` だけだと、カードをドラッグ中に行の上を通った瞬間に
  内側の行を拾い、親がタブではないので弾かれてドロップ先を見失う
- 行は再描画のたびに作り直されるので、HTMLを入れた**直後に**
  `restoreSortOrder(コンテナid)` → `addSortHandles(コンテナ, 'sort-handle-row')` を呼ぶ
- 行のつまみはカード用（`· · ·` の横一杯のバー）と別クラスにする。
  流用すると18行分並んで邪魔になる

### 営業所の「保守」と「継続」（業務上の定義）
- **保守 ＝ 新規保守**。継続分は含まない。表示するのは営業所の目標/実績と所員別の2つだけ
- **継続 ＝ 保守の更新が必要なもの**。当月・次月・次々月の3項目のみ（時間順に並べる）
- `_OFFICE_KPI_DEFS` は 点検 / 売上 / 新規保守 / 当月継続 / 次月継続 / 次々月継続 の6項目。
  進捗タブのセクション構成と1対1で対応させてある。片方だけ足すとズレる
- **単位は「台」**。継続も新規保守も台数で数える。点検・促進・エアコン洗浄などは
  回数なので「件」のまま。個人の `KGI_FIELDS` の保守継続3項目と新規保守も台にそろえた
  （個人の目標 当月23/次月14/次々月7 が営業所の大城章裕の行と完全一致＝同じもの）
- GAS の営業所レポートは **`OFFICE_UNITS` 表**で単位を引く。
  「`salesActual` 以外は件」のようなキーの決め打ち分岐に戻さないこと。項目を足すたびに漏れる
- **総保守台数（`totalMaint*`）は全画面から外した**（2026-09-05）。所員5人の合計48/137に対し
  営業所行が84/173で一致せず、あきぼー判断で不要となった。
  `OFFICE_DAILY_COLS` と `parserConfig.js` の S/T列マッピングは残してあるので、
  取込は続いており、必要になったら表示を戻すだけでよい

### 営業所の所員別表示
- 所員データ（memberId a〜e）は `officeDaily` シートに毎日入っている
- 進捗タブは `refreshManagement()` の `getOfficeDaily()` から `scope` を外して取得する。
  **`getAllOfficeData()`（履歴タブ用）は `scope:'office'` 固定のまま触らないこと。**
  あちらを変えると履歴の全ビューに所員行が混ざる
- `memberBlock(defs)` が 1項目なら「名前/実績/目標/%/バー」、複数項目なら表を描く
- 所員名は `memberName` をそのまま出す。同姓（喜屋武が2人）がいるので姓だけに縮めない

### 営業所の週次表示（重要）
- 営業所の数値は**月内累計で月初にリセットされる**
- 週の実績は「週初より前の最終行との差」（`wn()` / `memberBaseline`）で出す
- **取得範囲は当月だけにすること。** 前月まで広げると前月末の大きい値との差になり、
  週次の実績がマイナスになる（実際に一度やって壊した）
- 月初週は起点が月内に無いので「週の実績＝その月の累計」になるが、
  月が始まったのがその週の中なので実態と合っている

### 金額フィールドの扱い（重要）
- 金額かどうかは `KGI_FIELDS` の **`money: true` フラグ**で判定する。
  `f.unit === '円'` のような**文字列比較で判定しない**（単位ラベルを変えた瞬間に壊れる）
- **金額の単位は「円」**。日報スキル定義には「千円統一」とあるが、
  アプリの実データは円で入っている（例: 個人末見額 2,334,183）。実態が正
- 表示は `formatKpiValue(value, field)`（utils.js）に統一。単位は `field.unit` に委譲
- 金額の入力欄はカンマ区切り表示のため `type="text"`。
  **読み取りは必ず `parseNumericInput()` を通す**。`Number('3,500')` は NaN → 0 になり、
  入力が無言で消える

### 活動内訳（目標を持たないKPI）

- `KGI_FIELDS` の **`group: 'activity'`** フラグが付いた項目。
  故障診断 / 残修理 / 納品 / 再診断・再調整 の4つ
- 目的は「日々どの作業に時間を使っているか」の可視化。**月間目標は設定しない**
- `color: 'cyan'` も付いているので、入力・保存・差分計算・履歴集計・CSV・上長報告は
  他のKPIと同じように**自動で対応する**
- **目標に関わるUIからは `f.group !== 'activity'` で必ず除外する**。
  除外しないと「目標未設定」の行が生える。対象は月次ゲージ / 週次ゲージ /
  `renderKpiChart` / `buildKgiFields`（KGI設定タブ）の4箇所
- `BUDGET_COLS` にも追加していない。あとで目標を付けたくなったら
  `_ensureSheetColumns_()` が列を自動確保するのでその時に足せばよい

### 個人 履歴タブの総合達成率
- `calcOverallRate(totals, budget)` が算出。**月間目標が設定されている項目だけ**を対象に、
  各項目の達成率を**100%で頭打ち**にしてから平均する
- 上限を外すと、達成しすぎた1項目が全体の遅れを隠す。2026年5月はエアコン洗浄400%のせいで
  上限なしだと58%になるが、他8項目は25%以下。上限ありの28%が実態
- バッジは 100%以上=達成 / 70%以上=順調 / 40%以上=注意 / それ未満=要注意
- 日次ビューには出さない（その日の目標という概念がないため）
- KPIごとのバーは**月間目標がある項目だけ**。18項目すべてに付けるとカードの縦が倍になる
- 週次ビューの目標は月間目標の1/3（進捗タブの週次ゲージと同じ扱い）

### 印刷（PDF）のCSS
- 印刷ウィンドウは `style.css` を読み込まない。**CSS変数はすべて未定義になる**
- `background-color: var(--accent-cyan)` のような指定は透明に落ちてバーが消える
- `handlePrintReport()` 内の印刷用スタイルに**実際の色を直書き**すること
  （`.progress-fill.green/.cyan/.amber/.red` の4色を定義済み）

### 活動内訳ランキング

- `calcActivityRanking()` が件数KPIを合計して多い順に返す。0件の項目は含めない
- 対象は **`COUNT_FIELDS`**（`color: 'cyan' && !money`）＝活動4項目に加えて
  点検件数・エアコン洗浄なども含む。「何に時間を使っているか」を見るのが目的なので、
  現場作業の大半を占める点検を外すとランキングが実態とズレる
- `COUNT_FIELDS` は期間比較チャートとも共有している。
  同じ意味のフィルタ式を2箇所に書かないこと
- 表示先は履歴タブの週次/月次/四半期/年次の4ビューと上長報告。
  PDFは履歴タブのHTMLをそのまま印刷するので自動で載る
- **印刷用CSSには色を直書きする**。印刷ウィンドウは `style.css` を読まないため
  `var(--accent-cyan)` が解決できず、バーの背景が透明になって消える

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

### budget シートの重複行（対処済み・仕様として残る）

- `budget` シートには同じ月の行が複数ある（2026-05 は6行、中身もバラバラ）。
  古い `saveBudget` が重複を作っていた名残
- `ensureHistData()`（app.js）が読み取り時に **同月は最後の行だけ残す**。
  GAS の `getBudgetImpl()` も `filtered[length-1]` を返すので、画面とAIレポートで
  同じ行を見ることになる
- **この重複除去を外すと**、月次ビューは `.find()` で1行目（古い値）を引き、
  `sumBudgets()` は全行を合算して四半期・年次の目標が2〜5倍に膨らむ。
  実際に2026-05は「促進受注額の達成率 56,667%」と表示されていた
- シート側の古い行は消していない。その月の目標を保存し直せば
  `saveBudgetImpl()` が1行に収束させる

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

月間目標を持たない項目を足すときは `group: 'activity'` を付け、
上記4に加えて目標まわり4箇所の除外も行う（「活動内訳」の節を参照）。

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
| Step21 | 活動内訳4項目追加（故障診断・残修理・納品・再診断）+ 多い順ランキング | 完了 |
| Step21b | budget重複行による目標値バグの修正 | 完了 |
| Step22 | 営業所 進捗タブの再構成（保守=新規保守 / 継続3項目 / 所員別） | 完了 |
| Step22b | 個人・営業所のUI統一（進捗は個人へ、履歴は営業所へ寄せる） | 完了 |
| Step22c | 総保守台数を全画面から撤去（データ列は保持） | 完了 |
| Step23 | 進捗タブを1枚のカードに統一（営業所のセクション分けを廃止） | 完了 |
| Step23b | 進捗タブの表示/非表示設定（個人・営業所） | 完了 |
| Step23c | 項目（行）単位の並べ替え + 設定のサーバー保存 | 完了 |
| Step23d | 所員別に達成率と単位を表示（継続3項目・保守） | 完了 |
| Step23e | 継続・新規保守の単位を「件」→「台」に統一 | 完了 |

**大きな実装前は必ずPlan Modeで計画確認。**
