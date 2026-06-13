# 営業所管理機能 設計仕様書（Claude Code 用）

> 対象アプリ：日報アプリ（現名称「Nice Serviceman 日報」/ `ooshiro-a/nippo`）
> 目的：個人記録に加え、日計表 Excel から営業所全体の進捗を取り込み、可視化・分析する。
> 設計原則：**個人記録で使えるすべての機能を、営業所データでも使えるようにする**（機能パリティ）。
> 進め方：Claude Code に **Step 単位** で渡す。Plan Mode 推奨。Step ごとに動作確認 → コミット。

---

## 0. 起動コマンド（参考）

```
cd C:\Users\ao112\Documents\nippo
claude
```

---

## 1. 背景・目的

- 現状はあきぼー個人の記録のみ（入力／進捗／履歴／KGI設定の4タブ）。
- 営業所全体の数字（点検進捗・売上・継続率・トスアップ等）を日々積み上げ、**ボトルネックがどこかを把握**したい。
- 個人で慣れ親しんだ機能群（ダッシュボード／ゲージ／AIレポート／PDF出力／履歴／CSV/JSON）を**営業所データでもそのまま使える**ようにする。
- データソースは既存運用中の **日計表（Excel）**。

---

## 2. 確定方針（意思決定ログ）

| 項目 | 決定 |
|---|---|
| 入力形式 | **Excel（.xlsx）**。日計表は Excel から印刷した PDF だったため、元 Excel を直接読む方が確実 |
| 解析場所 | **ブラウザ内（クライアントサイド／SheetJS）**。社外秘の Excel 本体はサーバーに送らず、抽出後の数値だけ保存 |
| 取り込み2系統 | ①**1枚目（進捗）= 毎日**取り込み → `officeDaily` ②**売上計画 = 月初1回**取り込み → `officeSalesPlan` |
| パーサー設計 | **パーサー層を分離**。どのソースでも同じ正規化フォーマットを出力。Dynamics 移行時はパーサーのみ差し替え |
| 抽出ルール | コード直書きせず **`parserConfig` に外出し** |
| 確認画面 | 保存前に抽出値を表示し**手修正可**（誤読の保険） |
| 所員別データ | **所員別（a〜e）も全指標を蓄積**してドリルダウン可能に |
| **機能パリティ** | **個人で使える機能は営業所でも全部使えるようにする**（ダッシュボード／ゲージ／AIレポート／PDF出力／CSV・JSONエクスポート／過去データ編集） |
| セキュリティ | **Apps Script がアプリ本体を配信＋個人 Gmail 限定**。同一オリジン化で CORS 解消 |
| 複数端末同期 | クラウド（Sheets）標準装備。会社 PC は要検証 |
| 個人データ | 既存 `entries` / `budget` は**温存・完全分離**。営業所は別シートで管理し既存機能を壊さない |

---

## 3. 機能パリティ一覧（個人 ↔ 営業所）

**この表が本仕様書の中核**。すべての行で「営業所側」を実装する。

| 機能カテゴリ | 個人（既存） | 営業所（新規） | 仕様参照 |
|---|---|---|---|
| **データ入力** | 入力タブで手動入力 | Excel取込（毎日／月初）＋確認画面で手修正 | §9.1, §9.2 |
| **マイナス値** | 許容（キャンセル対応） | Excelからそのまま許容 | §9.2 |
| **過去データ修正** | 履歴タブから日付クリック→編集 | 営業所履歴から日付クリック→編集 or Excel再取込で上書き | §9.4.3 |
| **ダッシュボード** | 進捗タブ・個人KPIカード | 進捗タブ・営業所KPIカード（合計＋所員別ドリルダウン） | §9.3 |
| **理想ペースゲージ** | 週次目標vs現在値・RAGカラー | 営業所全体＋所員別の両方で表示 | §9.3.2 |
| **不足額可視化** | 個人の予算不足表示 | 営業所不足額＋所員別過不足ランキング | §9.3.4 |
| **AIレポート** | Gemini・週次/月次・コンサル視点 | 営業所版・ボトルネック自動特定・所員別言及 | §10 |
| **比較分析** | 先週比／先月比／前年同月比 | 営業所も同3比較 | §10.3 |
| **PDF出力** | 月次/四半期/年次レポートPDF | 営業所版PDF（合計＋所員別ランキング込み） | §11 |
| **CSV出力** | 個人entries全期間CSV | 営業所 officeDaily 全期間CSV | §9.6 |
| **JSONエクスポート** | 全データバックアップ | 営業所データも含めて出力 | §9.6 |
| **5ビュー切替** | 日次/週次/月次/四半期/年次 | 同5ビュー（営業所データで） | §9.4.2 |
| **連続日数バッジ** | 連続入力日数 | 連続取込日数 | §9.3.5 |
| **重要事項フラグ** | 個人の重要タグ | 営業所のしきい値超え自動フラグ（点検遅延・継続率低下等） | §11.1 |
| **配色** | KPI=シアン／個人=エメラルド | 営業所=アンバー（既存ルール踏襲） | §9.7 |
| **タブ構成** | 入力/進捗/履歴/KGI設定 | 各タブを拡張（個人/営業所トグルで切替） | §9 |

> 個人タブは温存。各タブ内に「個人／営業所」トグルを追加して、同じ画面で切り替える方針。

---

## 4. 抽出項目：1枚目（進捗）→ `officeDaily`（毎日）

営業所合計（**中央**行）＋ 所員別（a〜e）を両方取得する。

### 4.1 指標の定義

売上系は **計画／実績／A案件／末見通し** の4段構造。

| 指標 | 定義 | 取得方法 |
|---|---|---|
| **計画** | 月間予算 | `SUM(B25:B34)` または B35 直読み |
| **実績** | 計上済みの数字 | Excel から抽出 |
| **A案件** | 今月計上予定の残り | Excel から抽出 |
| **末見通し** | 実績 ＋ A案件 | **計算で算出**（J列で検算可） |
| **翌月分** | 次月の数字 | 月末に近づくほど重要、**日々のレポートに必ず表示** |

> 検算：中央行 実績 6,559 ＋ A案件 4,508 ＝ 末見通し 11,067（実値一致）。

### 4.2 抽出項目一覧（**営業所合計＋所員別を同じ指標セットで取得**）

シート名：`一枚目 `（末尾スペース注意）

| 区分 | 項目 | 列 | 中央行 | 所員行（a→e） |
|---|---|---|---|---|
| 活動 | 活動日数 | B | 17 | 8〜12 |
| 活動 | 総活動件数 | C | 17 | 8〜12 |
| 促進 | 新規促進件数（実績） | D | 17 | 8〜12 |
| 促進 | 新規促進A案件 | E | 17 | 8〜12 |
| 点検 | 計画 / 実績 | F / G | 17 | 8〜12 |
| 継続 | 次月継続 計画 / 実績 | H / I | 17 | 8〜12 |
| 売上 | 計画 | B | 35 | 25〜29 |
| 売上 | 実績 | C | 35 | 25〜29 |
| 売上 | A案件 | H | 35 | 25〜29 |
| 売上 | 末見通し（=実績+A案件） | J | 35 | 25〜29 |
| 売上 | 対計画 | L | 35 | 25〜29 |
| 売上 | 保守売上 実績 | M | 35 | 25〜29 |
| 売上 | 保守 新規 / 継続 | N / O | 35 | 25〜29 |
| 台数 | 総保守台数 計画 / 実績 | S / T | 35 | 25〜29 |
| 台数 | 新規保守台数 計画 / 実績 | V / W | 35 | 25〜29 |
| 継続 | 当月継続 前受 / 計画 / 実績 | AD / AE / AF | 35 | 25〜29 |
| 翌月 | 翌月分 受注残 / 翌月案件 | AG / AI | 35 | 25〜29 |
| 継続 | 次々月継続 計画 / 実績 / 受注率 | AM / AN / AO | 35 | 25〜29 |
| 継続 | 継続率（合計のみ） | AE37 | - | - |
| 過不足 | 所員別 過不足（氏名付き） | A / C | - | 39〜43 |

> A39〜A43 は氏名、C39〜C43 が過不足額。修理収入（P,Q列）は**取り込まない**。

### 4.3 検算用アンカー値（2026/05/27・中央）

| 指標 | 値 |
|---|---|
| 活動日数 / 総活動件数 | 61 / 517 |
| 点検 計画 / 実績 | 187 / 196 |
| 新規促進件数（A案件） | 18（5） |
| 次月継続 計画 / 実績（上段） | 102 / 36 |
| 売上 計画 / 実績 / A案件 / 末見通し | 11,010 / 6,559 / 4,508 / 11,067 |
| 売上 対計画 | 101% |
| 保守売上 実績（新規/継続） | 3,333（392/2,941） |
| 継続率 | 50.0% |

> 末見通し 11,067 = 実績 6,559 + A案件 4,508（一致）。所員別の検算値は社外秘性が高いため本書に記載せず、実Excelで照合。

---

## 5. 抽出項目：売上計画 → `officeSalesPlan`（月初1回）

営業所と所員別の**月間目標（＝分母）**。ダッシュボード達成率の計算根拠。

### 5.1 売上計画シートの構造（実Excel解析済み）

シート名：`売上計画`。**3ブロック構造**：

| ブロック | 行範囲 | 内容 | 含まれる項目 |
|---|---|---|---|
| ① 個人別計画 | 9〜19 | 保守系の月間計画 | 継続対象 / 継続 / 新規（各台数・金額）／点検／翌月継続対象／前受（新規・継続）|
| ② 有償売上計画 | 22〜32 | 有償系の月間計画 | コール自社／コール他社／修理サー連／促進修理／有償売上計画 |
| ③ 浄水器・営連・総売上 | 35〜45 | その他＋営連＋総売上 | 浄水器/部品/他／営連計画金額／総売上 |

所員行：a=11/24/37, b=12/25/38, c=13/26/39, d=14/27/40, e=15/28/41。合計（中央）= 19/32/45。

単独セル（重要値）：
- 営業年計：F47（例 12,700,000）
- 前受け金額：E58（例 1,639,000）
- 総売上金額（前受けこみ）：K58（例 11,009,960 — 日計表§4.3の売上計画と一致✓）
- 単価設定：G20（保守 33,000）、E33/G33/I33/K33（各 30,000）、E46（30,000）

### 5.2 取り込み運用

- 月初に「売上計画取込」ボタンから1回アップロード
- 個人別／営業所別の計画値を `officeSalesPlan` に保存
- 月途中の変更も任意で再取込可（履歴は保持しない・上書き）

### 5.3 セル参照

§7.3 の `SALESPLAN_MAP` に**確定済み**（実Excelで全セル解析完了）。Step B2 は手戻りなく実装可能。

---

## 6. データ構造（Google Sheets）

既存の `entries`（個人日次）・`budget`（個人予算）は**温存・分離**。以下を新規追加。

### 6.1 `officeDaily`（営業所・日次実績）

| 列 | 内容 |
|---|---|
| date | 日付（YYYY-MM-DD・主キー一部） |
| scope | "office"（合計）/ "member"（所員別） |
| memberId | a〜e（office の場合は空） |
| memberName | 氏名（C39〜C43由来・任意） |
| activityDays / activityCount | 活動日数 / 総活動件数 |
| promotionCount / promotionAcase | 新規促進件数 / A案件 |
| inspectionPlan / inspectionActual | 点検 計画 / 実績 |
| renewalNextPlanTop / renewalNextActualTop | 次月継続（上段・H/I列） |
| salesPlan / salesActual / salesAcase / salesForecast | 売上：計画／実績／A案件／末見通し |
| vsPlan | 対計画（=salesForecast/salesPlan） |
| maintActual / maintNew / maintCont | 保守売上：実績／新規／継続 |
| totalMaintPlan / totalMaintActual | 総保守台数 計画 / 実績 |
| newMaintPlan / newMaintActual | 新規保守台数 計画 / 実績 |
| renewalThisPrev / renewalThisPlan / renewalThisActual | 当月継続：前受／計画／実績 |
| nextMonthBacklog / nextMonthCase | 翌月分：受注残／翌月案件 |
| renewalNext2Plan / renewalNext2Actual / renewalNext2Rate | 次々月継続：計画／実績／受注率 |
| renewalRate | 継続率（営業所合計のみ） |
| shortfall | 過不足（所員別のみ） |
| source | "dayReport" / "dynamics" / "manual" |
| importedAt | 取込日時（ISO） |
| rawText | 抽出元データ（検算・監査用） |

> `(date, scope, memberId)` で一意。同日同所員の再取込は上書き。

### 6.2 `officeSalesPlan`（営業所・月間計画）

| 列 | 内容 |
|---|---|
| yearMonth | 対象月（YYYY-MM・主キー一部） |
| scope / memberId | office / member 区分 |
| memberName | 氏名 |
| maintenancePlanUnits / maintenancePlanAmount | 保守 計画台数 / 金額 |
| inspectionPlanUnits / inspectionPlanAmount | 点検 計画台数 / 金額 |
| renewalTargetUnits | 継続対象台数 |
| renewalPlanUnits / renewalPlanAmount | 継続計画 |
| newPlanUnits / newPlanAmount | 新規計画 |
| prepaidNew / prepaidCont | 前受（新規/継続） |
| callPlan / repairPlan / serPromoPlan | コール／有償修理／促進修理 計画 |
| totalSalesPlan | 総売上金額計画 |
| unitPrices | 単価設定（JSON文字列） |
| annualSalesPlan | 営業年計 |
| source | "salesPlan" / "dynamics" / "manual" |
| importedAt | 取込日時 |

### 6.3 `officeReports`（AIレポート・PDF出力履歴）

| 列 | 内容 |
|---|---|
| reportId | UUID |
| type | "weekly" / "monthly" / "quarterly" / "yearly" |
| period | 対象期間（例 "2026-W22", "2026-05"） |
| scope | "office" / "member:a" 等 |
| generatedAt | 生成日時 |
| modelUsed | "gemini-1.5-flash" 等 |
| content | レポート本文（Markdown） |
| metrics | 集計指標スナップショット（JSON） |

> 個人側の既存 `reports` シートに合流させても良いが、`scope` 列で分けるなら同居可能。実装時に判断。

---

## 7. パーサー設計（差し替え可能アーキテクチャ）

### 7.1 思想

入力ソース（日計表 Excel → 将来 Dynamics）が変わっても、**後段（保存・履歴・ダッシュボード・AIレポート・PDF）は一切触らない**よう、パーサー層で正規化フォーマットに変換してから保存する。

```
[入力ソース]            [パーサー層・差し替え可能]        [共通データ構造]
日計表Excel    ──→  parseDayReport(workbook)    ┐
売上計画Excel  ──→  parseSalesPlan(workbook)    ├─→ 正規化オブジェクト → Sheets保存
（将来）Dynamics ─→  parseDynamics(...)          ┘        ↓
                                                  履歴・ダッシュボード・AIレポート・PDF（不変）
```

### 7.2 正規化フォーマット

```javascript
// parseDayReport の出力（office と members は同じ指標セット）
{
  date: "2026-05-27",
  office: {
    activityDays: 61, activityCount: 517,
    promotionCount: 18, promotionAcase: 5,
    inspectionPlan: 187, inspectionActual: 196,
    renewalNextPlanTop: 102, renewalNextActualTop: 36,
    salesPlan: 11009960, salesActual: 6559363, salesAcase: 4507848,
    salesForecast: 11067211, vsPlan: 1.0052,
    maintActual: 3332600, maintNew: 392000, maintCont: 2940600,
    totalMaintPlan: 168, totalMaintActual: 87,
    newMaintPlan: 55, newMaintActual: 9,
    renewalThisPrev: 43, renewalThisPlan: 70, renewalThisActual: 35,
    nextMonthBacklog: 1170400, nextMonthCase: 639480,
    renewalNext2Plan: 70, renewalNext2Actual: 6, renewalNext2Rate: 0.0857,
    renewalRate: 0.5
  },
  members: [
    { memberId: "a", name: "<氏名>",
      activityDays: 14, activityCount: 140,
      /* …office と同じ指標セット… */
      shortfall: -513847
    },
    /* b, c, d, e */
  ],
  source: "dayReport",
  importedAt: "2026-05-27T20:00:00+09:00"
}
```

### 7.3 `parserConfig`（外出し設定・確定セル参照）

```javascript
// parserConfig.js
// シート名は末尾スペース付き「一枚目 」
export const DAYREPORT_MAP = {
  sheetName: "一枚目 ",
  rows: {
    office: { top: 17, sales: 35 },
    members: [
      { id: "a", top:  8, sales: 25, shortfallCell: "C39", nameCell: "A39" },
      { id: "b", top:  9, sales: 26, shortfallCell: "C40", nameCell: "A40" },
      { id: "c", top: 10, sales: 27, shortfallCell: "C41", nameCell: "A41" },
      { id: "d", top: 11, sales: 28, shortfallCell: "C42", nameCell: "A42" },
      { id: "e", top: 12, sales: 29, shortfallCell: "C43", nameCell: "A43" },
    ]
  },
  // 列マップ（office も members も同じ列。行だけ違う）
  cols: {
    top: {
      activityDays: "B", activityCount: "C",
      promotionCount: "D", promotionAcase: "E",
      inspectionPlan: "F", inspectionActual: "G",
      renewalNextPlanTop: "H", renewalNextActualTop: "I"
    },
    sales: {
      salesPlan: "B", salesActual: "C", salesAcase: "H",
      salesForecast: "J", vsPlan: "L",
      maintActual: "M", maintNew: "N", maintCont: "O",
      totalMaintPlan: "S", totalMaintActual: "T",
      newMaintPlan: "V", newMaintActual: "W",
      renewalThisPrev: "AD", renewalThisPlan: "AE", renewalThisActual: "AF",
      nextMonthBacklog: "AG", nextMonthCase: "AI",
      renewalNext2Plan: "AM", renewalNext2Actual: "AN", renewalNext2Rate: "AO"
    }
  },
  singletons: { renewalRate: "AE37" },
  derived: { salesForecastCalc: (o) => o.salesActual + o.salesAcase }
};

export const SALESPLAN_MAP = {
  sheetName: "売上計画",

  // 所員行マップ（3ブロックで行が異なる）
  rows: {
    office: { personal: 19, paid: 32, other: 45 },  // 合計行（中央）
    members: [
      { id: "a", personal: 11, paid: 24, other: 37 },
      { id: "b", personal: 12, paid: 25, other: 38 },
      { id: "c", personal: 13, paid: 26, other: 39 },
      { id: "d", personal: 14, paid: 27, other: 40 },
      { id: "e", personal: 15, paid: 28, other: 41 },
    ]
  },

  // 列マップ（各ブロックで列構成が違う）
  cols: {
    // ブロック1：個人別計画（保守・点検・継続・前受）— 行9〜19
    personal: {
      renewalTargetUnits:   "B",  // 継続対象 台数
      renewalTargetAmount:  "C",  // 継続対象 金額
      renewalUnits:         "D",  // 継続 台数
      renewalAmount:        "E",  // 継続 金額
      newUnits:             "F",  // 新規 台数
      newAmount:            "G",  // 新規 金額
      inspectionUnits:      "H",  // 点検 台数
      nextRenewalTarget:    "I",  // 翌月継続対象 台数
      prepaidNewUnits:      "J",  // 前受（新規）台数
      prepaidNewAmount:     "K",  // 前受（新規）金額
      prepaidContUnits:     "L",  // 前受（継続）台数
      prepaidContAmount:    "M"   // 前受（継続）金額
    },
    // ブロック2：有償売上計画 — 行22〜32（A列=有償修理見出しのみ・B/C列なし）
    paid: {
      callOwnUnits:    "D", callOwnAmount:    "E",  // コール（自社）
      callOtherUnits:  "F", callOtherAmount:  "G",  // コール（他社）
      repairSerUnits:  "H", repairSerAmount:  "I",  // 修理サー連
      serPromoUnits:   "J", serPromoAmount:   "K",  // 促進修理
      paidSalesPlan:   "L"                          // 有償売上計画（合計）
    },
    // ブロック3：浄水器・営連・総売上 — 行35〜45
    other: {
      waterUnits:        "D",   // 浄水器・部品・その他 台数
      waterAmount:       "E",   // 同 金額
      eirenPlanAmount:   "F",   // 営連計画金額
      totalSalesPlan:    "H"    // 総売上（合計列）
    }
  },

  // 単独セル
  singletons: {
    yearMonth_year:       "A5",   // 例: 2026
    yearMonth_month:      "D5",   // 例: 5
    unitPrice_personal:   "G20",  // 単価設定（保守系）33,000
    unitPrice_callOwn:    "E33",  // 単価設定（コール自社）30,000
    unitPrice_callOther:  "G33",  // 単価設定（コール他社）30,000
    unitPrice_repairSer:  "I33",  // 単価設定（修理サー連）30,000
    unitPrice_serPromo:   "K33",  // 単価設定（促進修理）30,000
    unitPrice_other:      "E46",  // 単価設定（浄水器系）30,000
    annualSalesPlan:      "F47",  // 営業年計 12,700,000
    prepaidAmount:        "E58",  // 前受け金額 1,639,000
    totalSalesInclPrepaid:"K58",  // 総売上金額（前受けこみ）11,009,960
    // 前年総保守台数/前年総売り金額/次月の総売り計画 は現在空（A49-A51）
  }
};
```

**実装メモ**：`getValue(ws, col, row) = ws[col+row]?.v ?? 0` の薄いヘルパー1つで、office・members どちらも同じロジックで反復処理可。Dynamics 移行時は `DAYREPORT_MAP` を `DYNAMICS_MAP` に差し替えるだけ。

### 7.4 確認画面（保存前）

- 抽出値を一覧表示（営業所合計／所員別をタブで切替）
- すべてのセルを**手修正可**（後段で過去データ修正にも流用）
- 「保存」で正規化オブジェクトを Sheets へ書き込み
- 「破棄」で取込キャンセル

---

## 8. セキュリティ実装（Option B：Apps Script 配信＋個人 Gmail 限定）

### 8.1 構成

- アプリ本体（HTML/JS/CSS）を **Apps Script の `doGet` から配信**（`HtmlService`）
- デプロイ設定：**実行＝自分／アクセス＝自分のみ（特定の個人 Gmail）**
- 結果：**ログインした本人しかアプリを開けない＝データも見られない**
- フロントとバックが**同一オリジン**になり、CORS 問題が解消

### 8.2 実装ポイント

- `doGet(e)` で `HtmlService.createHtmlOutputFromFile('index')` を返す
- ビルド済みフロントは **1つの HTML に JS/CSS をインライン**して Apps Script のファイルに格納
- Sheets 読み書きは `google.script.run` で Apps Script 関数を直接呼ぶ（fetch 不要・CORS なし）
- **Excel 解析は必ずクライアントサイド**（SheetJS）。ファイル本体は送信せず、抽出後の数値のみ送る
- **Gemini APIキー**は Apps Script の Script Properties に格納（クライアント側に出さない）

### 8.3 デプロイ手順

1. Apps Script プロジェクトに `index.html`（アプリ本体）と `Code.gs`（読み書き・AI連携）を配置
2. Script Properties に `GEMINI_API_KEY` を設定
3. デプロイ → ウェブアプリ → 実行：**自分**／アクセス：**自分のみ**
4. 払い出された URL をブックマーク（会社 PC でも同 URL ＋個人 Gmail ログインで同期）

> GitHub Pages から Apps Script 配信への移行は本仕様で**最も手間のかかる工程**。React ビルドの inline 化が必要。本物の社外秘データ投入前にこの移行を完了させる。

---

## 9. UI 設計（個人機能をすべてミラーリング）

### 9.1 Excel取込 UI（個人の入力タブ相当）

進捗タブまたは入力タブの上部に2つのボタン：

- **📄 日次取込**：1枚目を取り込み → 確認画面 → `officeDaily` 保存。毎日使うので目立つ位置
- **📋 月次計画取込**：売上計画を取り込み → 確認画面 → `officeSalesPlan` 保存。月初のみ使用、KGI設定タブ寄り

### 9.2 確認画面（手修正可）

- 抽出値を一覧表示（営業所合計／所員別をタブで切替）
- マイナス値も含めて全セル編集可（個人のマイナス値仕様と同じ思想）
- 検算アンカー値（§4.3）と一致するかをハイライト表示
- 「保存」「破棄」「Excel再選択」

### 9.3 進捗タブ：営業所ダッシュボード

タブ内に「個人／営業所」トグル。営業所側はアンバー基調。

#### 9.3.1 指標カード（合計＋所員別ドリルダウン）

- 売上対計画・点検達成率・継続率・新規促進・総保守台数・新規保守台数・活動・翌月分 等
- 各カード**営業所合計をデフォルト表示**
- カードタップで a〜e（または氏名）の値をミニ表＋達成率バーで展開
- 「点検が遅れているのは誰か」「売上対計画が低いのは誰か」を1タップで特定

#### 9.3.2 理想ペースゲージ

- 月間計画 ÷ 営業日数 × 経過日数 で理想値を算出（既存の RAG カラー流用）
- 営業所全体ゲージ＋所員別ゲージの両方を表示可能
- 売上は **実績進捗** と **末見通し進捗** の2本立て表示（末見通しは A案件込みで計画達成見込みかを示す）

#### 9.3.3 AIレポート（営業所版・§10 詳細）

- 「今週の営業所レポート」「今月の営業所レポート」ボタン
- ボトルネック自動特定（どの指標が遅れているか／どの所員か）
- 個人レポートと同じく**コンサル視点／厳しい営業部長視点**で生成

#### 9.3.4 不足額可視化

- 営業所合計の不足額（=計画-末見通し）を大きく表示
- **所員別 過不足ランキング**：氏名付き±バー、社員間の差分を一目で把握

#### 9.3.5 連続取込日数バッジ

- 個人の「連続入力日数バッジ」と同じ仕様。営業所側は「連続日次取込日数」
- 取込忘れ防止のモチベーション機能

### 9.4 履歴タブ拡張

#### 9.4.1 個人／営業所トグル

- タブ上部にトグル。営業所選択時はアンバー色
- 選択状態は localStorage に保持

#### 9.4.2 5ビュー（日次／週次／月次／四半期／年次）

既存の5ビューに営業所データを対応させる。所員別フィルタもビュー内で切替可能。

#### 9.4.3 過去データ修正（個人の編集機能ミラー・**2方式併存**）

両方の方式を提供し、用途で使い分け：

- **方式A：編集モーダル**（個別の数値修正用）
  - 履歴一覧で日付クリック → 編集モーダル（確認画面 §9.2 と同じUI）
  - 当該日の `officeDaily` レコードを直接編集（営業所合計／所員別の両方）
  - 1〜数項目の手修正に最適
- **方式B：同日Excel再取込**（一括差し替え用）
  - 履歴の該当日カードに「再取込」ボタン
  - その日のExcelを再アップロード → 確認画面 → 上書き保存
  - 元データから全項目をやり直したい場合に最適

どちらも `importedAt` と `source`（"manual" / "dayReport"）を更新。修正履歴は `officeDaily.rawText` または別ログシートに残す。

#### 9.4.4 PDFレポート出力（§11 詳細）

月次／四半期／年次のカードに「📄レポート出力」ボタン。営業所版PDFを生成。

#### 9.4.5 CSV出力

- 期間を選択 → `officeDaily` を UTF-8 BOM 付きCSVで出力
- ファイル名：`office-daily-YYYY-MM-DD_to_YYYY-MM-DD.csv`
- 列：date, scope, memberId, memberName, 全指標
- Excel で文字化けせず開ける（個人CSV出力と同じ仕様）

### 9.5 KGI設定タブ拡張：営業所計画ビュー

- タブ内に「個人／営業所」トグル
- 営業所側は `officeSalesPlan` を表示・編集
- 単価設定／営業年計／月間計画台数・金額をフォームで編集可能
- 月次取込で上書き、手動編集も可（source 列で区別）

### 9.6 横断機能：JSON / CSV バックアップ

- 既存の JSON エクスポートに **`officeDaily` / `officeSalesPlan` / `officeReports` を追加**
- CSV エクスポートも営業所データを含む形に拡張
- 復元時も営業所データを取り込める

### 9.7 配色ルール（既存踏襲）

| 用途 | HEX |
|---|---|
| KPI系（シアン） | #22d3ee |
| 信頼関係指数（ローズ） | #fb7185 |
| 個人計画（エメラルド） | #4ade80 |
| **営業所・年次（アンバー）** | **#fbbf24** |
| 警告（赤） | #f87171 |
| 訪問記録（ヴァイオレット） | #a78bfa |

営業所セクションは全面的にアンバー基調で個人と視覚的に区別。

---

## 10. AIレポート仕様（営業所版）

個人レポート（Gemini API）と同じインフラを再利用。**プロンプトとデータ供給を営業所用に切り替える**。

### 10.1 利用API

- **Gemini API**（無料枠・既存契約を流用）
- 呼び出しは Apps Script から（APIキーは Script Properties で隠匿）
- 出力は Markdown、Sheets `officeReports` シートに保存

### 10.2 トリガー

- **週次**：金曜の取込完了後（個人レポートと同タイミング）
- **月次**：月末の取込完了後（または手動「今月分生成」ボタン）
- **手動**：進捗タブから任意タイミングで「レポート再生成」可能

### 10.3 プロンプト設計

役割設定：**「厳しい営業部長」「論理的な経営コンサル」の2モードを切替可**。デフォルトは「厳しい営業部長」、進捗タブのトグルで都度切替可能。役割文言は `promptConfig.js` に外出ししておき、後から追加・調整可能にする。

データ供給（プロンプトに含める情報）：
- 対象期間の営業所合計 KPI（売上計画・実績・末見通し・対計画／点検・継続率・新規促進）
- 所員別 KPI（同指標セット）
- **比較対象**：先週比／先月比／前年同月比（同期間の `officeDaily` 集計）
- 月間計画（`officeSalesPlan`）と達成状況
- 経過営業日数・残営業日数（理想ペース算出用）

### 10.4 出力構成

```
# 営業所レポート（週次 / 月次）— 2026-W22

## 1. 信号機サマリ
- 売上：🟢/🟡/🔴 対計画◯%、末見通し◯%
- 点検：🟢/🟡/🔴 達成率◯%
- 継続率：🟢/🟡/🔴 ◯%

## 2. ボトルネック
（最も遅れている指標と原因仮説。所員名を含めて言及）

## 3. 所員別ハイライト
- 好調：…
- 要支援：…

## 4. 比較分析
- 先週比 / 先月比 / 前年同月比

## 5. 改善アクション（コンサル視点）
- 優先度高：…
- 優先度中：…

## 6. 残営業日への一言
```

### 10.5 PDFレポートとの違い

- AIレポートは**文章主体・分析重視**
- PDFレポート（§11）は**数値表・グラフ主体・上長報告用**
- 両者を組み合わせて月次共有が可能

---

## 11. PDFレポート仕様（営業所版）

履歴タブの月次／四半期／年次カードから「📄レポート出力」ボタンで生成。**個人PDFレポートのモーダルUI／印刷CSSを流用**。

### 11.1 構成要素

1. **ヘッダー**：レポート種別・対象期間（例「2026年5月」）・取込日数・出力日・営業所名
2. **信号機サマリ**：売上対計画／点検／継続率／新規促進の信号機表示
3. **営業所KPI集計＋進捗バー**（月次のみバー表示）
   - 売上：計画／実績／A案件／末見通し／対計画
   - 点検：計画／実績／達成率
   - 継続率／新規促進／総保守台数／新規保守台数／活動
4. **所員別 実績ランキング**：売上対計画・点検達成率の順位表
5. **所員別 過不足ランキング**：氏名付き±額
6. **🚩 重要事項（自動検出）**：しきい値超え警告
   - 点検達成率 80% 未満
   - 継続率 50% 未満
   - 個人売上対計画 80% 未満（要支援所員のフラグ）
   - 連続◯日取込なし
7. **AIレポート要約**（§10 の最新版があれば貼付）
8. **次月持ち越し情報**：翌月分受注残／翌月案件／次月継続実績

### 11.2 月次／四半期／年次の出し分け

| | 月次 | 四半期 | 年次 |
|---|---|---|---|
| 信号機 | ◯ | ◯ | ◯ |
| KPI進捗バー | ◯ | - | - |
| 所員別ランキング | ◯ | ◯ | ◯ |
| 過不足ランキング | ◯ | 期間累計 | 期間累計 |
| 重要事項 | ◯ | ◯（傾向）| ◯（傾向）|
| AIレポート要約 | 月次AIレポ | 四半期AIレポ | 年次AIレポ |
| 月推移グラフ | - | 3ヶ月 | 12ヶ月 |

### 11.3 出力形式

- ブラウザ印刷ダイアログ経由で「PDFとして保存」（個人レポートと同じ仕組み）
- 印刷用CSSで白背景・黒文字に自動変換
- ファイル名：`office-report-{monthly|quarterly|yearly}-{period}.pdf`

---

## 12. 実装ステップ（Claude Code に渡す順）

リリース戦略の前提：**社外秘データは Step S0 完了後に投入**。それまではダミーデータで動作検証。

### 12.1 ステップ一覧

| Step | 内容 | 工数感 |
|---|---|---|
| **S0** | 現アプリを Apps Script 配信に移行＋個人 Gmail 限定デプロイ | 大（最難関）|
| **A1** | `officeDaily` / `officeSalesPlan` / `officeReports` シート作成＋ Code.gs に読み書きAPI | 中 |
| **A2** | ~~`SALESPLAN_MAP` を実Excelで確定~~ → **完了済み**（§7.3参照） | - |
| **B1** | 日次取込UI＋SheetJS組込＋ `parseDayReport` 実装 | 中 |
| **B2** | 月次計画取込UI＋ `parseSalesPlan` 実装 | 中 |
| **C** | 確認画面（手修正可）→ 保存。検算アンカー値で照合 | 中 |
| **D1** | 履歴タブに「個人／営業所」トグル＋5ビュー営業所対応 | 中 |
| **D2** | 履歴タブ：過去データ修正モーダル（営業所版）| 中 |
| **E1** | 進捗タブ：営業所ダッシュボード（指標カード＋ペースゲージ＋ドリルダウン）| 大 |
| **E2** | 進捗タブ：不足額可視化＋過不足ランキング＋連続取込バッジ | 中 |
| **F1** | KGI設定タブ：営業所計画ビュー（編集UI）| 中 |
| **G1** | AIレポート（営業所版・週次/月次・Gemini API）| 中 |
| **G2** | 比較分析（先週比/先月比/前年同月比）をAIプロンプトに統合 | 小 |
| **H1** | PDFレポート（営業所版・月次/四半期/年次）| 中 |
| **H2** | 重要事項の自動検出ロジック（しきい値）| 小 |
| **I1** | CSV出力（営業所版・全期間）| 小 |
| **I2** | JSON/CSV バックアップに営業所データ統合 | 小 |

### 12.2 リリース戦略（社外秘データを守る順序）

```
Phase 1（基盤・現スタックで高速イテレーション）
  A1 → B1 → B2 → C → A2
  ※この段階ではダミーデータのみ使用
        ↓
Phase 2（セキュリティ移行）
  S0
  ※完了したら本物の日計表データ投入開始
        ↓
Phase 3（履歴・編集）
  D1 → D2 → I1
        ↓
Phase 4（可視化）
  E1 → E2 → F1
        ↓
Phase 5（高度機能）
  G1 → G2 → H1 → H2 → I2
```

**本物の社外秘データは Phase 2 完了後に投入**。Phase 1 はダミーで完結させる。

### 12.3 Step ごとの確認観点

| Step | 完了確認 |
|---|---|
| S0 | 個人Gmailログインなしでアプリにアクセスできないことを確認 |
| A1 | Sheets に空のシートが3枚生成され、`google.script.run` で読み書きできる |
| B1 | 5/27の実Excelを取り込み、§4.3アンカー値と一致 |
| C | 抽出値を画面で手修正→保存→Sheets に正しく書かれる |
| D1 | 履歴タブで個人／営業所を切り替え、5ビューが切り替わる |
| D2 | 過去日の値を編集→保存→Sheetsに反映 |
| E1 | 営業所合計カードをタップ→所員別ドリルダウンが展開 |
| G1 | レポート生成ボタン→Gemini呼び出し→Markdown結果が表示 |
| H1 | PDFレポート出力ボタン→ブラウザ印刷ダイアログ→PDF保存できる |

---

## 13. 注意点・既知の落とし穴

- **タイムゾーン**：日付は日本時間（JST）。`new Date()` のみだと UTC になり得る
- **シート列順**：JS のキーと Sheets 列順を一致させる
- **Apps Script の iframe サンドボックス**：HtmlService はサンドボックス iframe で動作。SheetJS のクライアント解析が動くか早めに検証
- **PWA は実質不可**：Apps Script 配信では Service Worker が使えない（現状もブラウザタブ運用なので実害なし）
- **Apps Script クォータ**：個人利用なら問題なし。Gemini APIも無料枠で足りる想定
- **会社 PC**：個人 Gmail と Google Sheets が開けるか要検証。ブロックされる場合は別ルート検討
- **社外秘コンプライアンス**：個人 Gmail 経由で会社 PC から社外秘データを扱うことが社内ルール上問題ないか確認
- **Gemini API キー管理**：必ず Script Properties に格納し、クライアント側コードに出さない
- **所員氏名の取り扱い**：氏名を `officeDaily.memberName` に保存する場合、CSV/JSONエクスポート時の取り扱いに注意（社外秘度が上がる）

---

## 14. 未確定・今後の追加候補

- **アプリ名変更**（別件）：Ascend / Crescendo / Élan / Apex / Mejora（未決定）
- 会社 PC アクセス可否の検証結果を S0 設計に反映
- a〜e ラベルと氏名（A39〜A43）の対応マッピング最終確認
- Dynamics 移行時の `parseDynamics` 実装（パーサー層のみ差し替え）
- **🔜 次回改修で実装予定**：通知機能（営業所版・取込忘れリマインド）
  - Apps Script の Time-based Trigger ＋ Gmail通知が有力
  - 個人の通知機能（後回し中）と同時実装も検討
- LINE Messaging API / Discord Webhook 等の通知代替

---

## 15. データ保存ポリシー（社外秘対応の明示）

| データ | 保存場所 | 備考 |
|---|---|---|
| 日計表 Excel ファイル本体 | **どこにも保存しない** | ブラウザ内で解析後すぐ破棄 |
| 売上計画 Excel ファイル本体 | **どこにも保存しない** | 同上 |
| 抽出後の数値（営業所合計・所員別） | Google Sheets（`officeDaily` / `officeSalesPlan`）| テキストデータのみ |
| `rawText` 列の中身 | Google Sheets | 抽出した数値のテキスト表現（検算・監査用）。ファイルバイナリではない |
| AIレポート | Google Sheets（`officeReports`）| Markdown テキスト |
| Gemini API キー | Apps Script Script Properties | クライアント側コードには出さない |

**社外秘ファイル本体の流出経路は存在しない設計**。Excel は端末上でのみ存在し、クラウドに渡るのは抽出後の数値のみ。
