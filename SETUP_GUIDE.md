# Google Sheets + Apps Script セットアップ手順書

> 対象: あきぼー
> 所要時間: 約15〜20分
> 使用Googleアカウント: Rec's（reito-note）と同じアカウント

---

## STEP 1｜Google Sheetsを新規作成

1. **https://sheets.google.com** をブラウザで開く
2. 左上の「**＋ 空白のスプレッドシート**」をクリック
3. 左上のタイトル（「無題のスプレッドシート」）をクリックして
   → 「**nippo-db**」に変更してEnter

> 📸 **スクショポイント①**: タイトルが「nippo-db」になった状態

---

## STEP 2｜シートを2つ準備

### シート名を変更する

画面下に「**シート1**」タブが見えます。

1. 「シート1」タブを**ダブルクリック**
2. 「**budget**」と入力してEnter

次に2枚目のシートを追加します。

3. 左下の「**＋**」ボタンをクリック（新しいシートが追加される）
4. 新しいタブをダブルクリックして「**entries**」に変更

> 📸 **スクショポイント②**: 画面下に「budget」「entries」の2タブが並んでいる状態

---

## STEP 3｜ヘッダー行を入力する

### budget シートのヘッダー（1行目に入力）

「budget」タブをクリックして開き、A1セルから順に入力：

| セル | 入力する文字 |
|------|------------|
| A1 | year_month |
| B1 | inspection |
| C1 | promotion_amount |
| D1 | promotion_count |
| E1 | maintenance_this_month |
| F1 | maintenance_next_month |
| G1 | maintenance_next2_month |
| H1 | new_acquisition |
| I1 | ac_cleaning |
| J1 | full_maintenance |
| K1 | toss_up |
| L1 | personal_plan |
| M1 | office_plan |

### entries シートのヘッダー（1行目に入力）

「entries」タブをクリックして開き、A1セルから順に入力：

| セル | 入力する文字 |
|------|------------|
| A1 | date |
| B1 | inspection |
| C1 | promotion_amount |
| D1 | promotion_count |
| E1 | maintenance_this_month |
| F1 | maintenance_next_month |
| G1 | maintenance_next2_month |
| H1 | new_acquisition |
| I1 | ac_cleaning |
| J1 | full_maintenance |
| K1 | toss_up |
| L1 | relationship_actions |
| M1 | positive_feedback |
| N1 | negative_feedback |
| O1 | memorable_visit |
| P1 | notes |
| Q1 | notes_important |
| R1 | insight |
| S1 | next_action |

> 📸 **スクショポイント③**: entries シートの1行目にヘッダーが並んでいる状態

---

## STEP 4｜Apps Scriptを開く

1. 画面上部メニューの「**拡張機能**」をクリック
2. 「**Apps Script**」をクリック
   → 新しいタブでApps Scriptエディタが開く

> 📸 **スクショポイント④**: Apps Scriptエディタが開いた状態（`function myFunction() {}`が表示されている）

---

## STEP 5｜コードを貼り付ける

1. エディタ内の既存コード（`function myFunction() {}`）を**全選択して削除**
2. `nippo/gas/Code.gs` ファイルの中身を**全部コピー**
3. エディタに**貼り付け**
4. **Ctrl+S**（Mac: Cmd+S）で保存

> 📸 **スクショポイント⑤**: コードが貼り付けられた状態（`doGet`や`doPost`が見える）

---

## STEP 6｜Webアプリとしてデプロイ

1. 右上の「**デプロイ**」ボタンをクリック
2. 「**新しいデプロイ**」を選択
3. 「種類の選択」横の歯車アイコン ⚙️ をクリック →「**ウェブアプリ**」を選択

> 📸 **スクショポイント⑥**: 「新しいデプロイ」ダイアログで「ウェブアプリ」が選ばれた状態

4. 以下の通り設定する：

| 項目 | 設定値 |
|------|--------|
| 説明（任意） | nippo-api |
| 次のユーザーとして実行 | **自分**（自分のメールアドレス） |
| アクセスできるユーザー | **全員** |

5. 「**デプロイ**」ボタンをクリック

> ⚠️ 承認が必要と出た場合：「アクセスを承認」→ Googleアカウントを選択 → 「詳細」→「nippo（安全ではないページ）に移動」→「許可」

---

## STEP 7｜デプロイURLをコピー

デプロイが完了すると「**ウェブアプリ URL**」が表示されます。

```
https://script.google.com/macros/s/AKfycby.../exec
```

この URL を**コピー**して Claude Code に教えてください。

> 📸 **スクショポイント⑦**: デプロイ完了画面でURLが表示されている状態

---

## STEP 8｜動作確認

URLをコピーしたら**ブラウザの新しいタブ**に貼り付けて開いてみてください。

以下のようなJSONが表示されれば成功です 🎉

```json
{"status":"ok","message":"Nice Serviceman 日報 API","timestamp":"2026-05-06T..."}
```

---

## 完了後

URLを Claude Code に教えると、`js/api.js` に自動で貼り付けます。
以降はアプリからGoogle Sheetsへの読み書きが動くようになります。
