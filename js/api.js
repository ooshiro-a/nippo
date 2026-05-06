/**
 * api.js - Google Sheets API 通信
 * Nice Serviceman 日報
 *
 * Step 2 で Apps Script をデプロイ後、
 * APPS_SCRIPT_URL に発行されたURLを貼り付ける。
 */

const APPS_SCRIPT_URL = ''; // TODO: Step2 で設定

/**
 * Google Sheets からデータを取得する（GET）
 * @param {Object} params - クエリパラメータ
 * @returns {Promise<any>}
 */
async function fetchFromSheets(params) {
  if (!APPS_SCRIPT_URL) throw new Error('Apps Script URL が未設定です（api.js を確認）');
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`通信エラー: ${res.status}`);
  return res.json();
}

/**
 * Google Sheets にデータを送信する（POST）
 * @param {Object} body - 送信データ
 * @returns {Promise<any>}
 */
async function postToSheets(body) {
  if (!APPS_SCRIPT_URL) throw new Error('Apps Script URL が未設定です（api.js を確認）');
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // CORS対策でtext/plainを使用
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`通信エラー: ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------
// エントリ（日次記録）
// ------------------------------------------------------------------

/**
 * 全エントリを取得
 * @returns {Promise<DailyEntry[]>}
 */
async function getEntries() {
  // TODO: Step2 で実装
  return [];
}

/**
 * 指定月のエントリを取得
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {Promise<DailyEntry[]>}
 */
async function getEntriesByMonth(yearMonth) {
  // TODO: Step2 で実装
  return [];
}

/**
 * 日次エントリを保存（新規 or 更新）
 * @param {DailyEntry} data
 * @returns {Promise<any>}
 */
async function saveEntry(data) {
  // TODO: Step2 で実装
  console.log('saveEntry（スタブ）:', data);
  return { success: true };
}

// ------------------------------------------------------------------
// 予算（KGI設定）
// ------------------------------------------------------------------

/**
 * 指定月の予算を取得
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {Promise<Budget|null>}
 */
async function getBudget(yearMonth) {
  // TODO: Step2 で実装
  return null;
}

/**
 * 予算を保存（新規 or 更新）
 * @param {Budget} data
 * @returns {Promise<any>}
 */
async function saveBudget(data) {
  // TODO: Step2 で実装
  console.log('saveBudget（スタブ）:', data);
  return { success: true };
}
