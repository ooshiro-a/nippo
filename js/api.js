/**
 * api.js - Google Sheets API 通信
 * Nice Serviceman 日報
 *
 * ★ Step2 完了後にここを編集してください ★
 *   APPS_SCRIPT_URL に Apps Script のデプロイURLを貼り付ける
 */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCEwdRtZJI36iA85YWkVXizMgN37ebQVCoDRbow8O5_9m3n_Yctw0pYSV1V9IJe09N/exec';

// ============================================================
// 内部ユーティリティ
// ============================================================

/**
 * GET リクエスト
 * @param {Object} params
 * @returns {Promise<any>}
 */
async function _get(params) {
  if (!APPS_SCRIPT_URL) {
    console.warn('APPS_SCRIPT_URL 未設定。api.js の先頭にURLを貼り付けてください。');
    return null;
  }
  console.log('[API GET]', params);
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET エラー: ${res.status}`);
  const data = await res.json();
  console.log('[API GET] <=', JSON.stringify(data).slice(0, 300));
  return data;
}

/**
 * POST リクエスト（CORS対策: Content-Type: text/plain）
 * @param {Object} body
 * @returns {Promise<any>}
 */
async function _post(body) {
  if (!APPS_SCRIPT_URL) {
    console.warn('APPS_SCRIPT_URL 未設定。api.js の先頭にURLを貼り付けてください。');
    return { success: false };
  }
  console.log('[API POST]', body.action, body.data?.date || body.data?.yearMonth || '');
  // redirect:'follow' でリダイレクト先へ自動追従。
  // GAS は doPost 実行後に 302→echo URL を返すが、echo URL はレスポンスボディを保持しており
  // GETで追従しても JSON を正常に取得できる。
  // ※ redirect:'manual' + 再POST は doPost を2回実行させてしまうため使用しない。
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`POST エラー: ${res.status}`);
  const data = await res.json();
  console.log('[API POST] <=', data);
  return data;
}

// ============================================================
// エントリ（日次記録）
// ============================================================

/**
 * 指定月のエントリ一覧を取得
 * @param {string} yearMonth - "YYYY-MM"（省略で全件）
 * @returns {Promise<DailyEntry[]>}
 */
async function getEntries(yearMonth = '') {
  const params = { action: 'getEntries' };
  if (yearMonth) params.yearMonth = yearMonth;
  const result = await _get(params);
  return Array.isArray(result) ? result : [];
}

/**
 * 日次エントリを保存（date でupsert）
 * @param {DailyEntry} data
 * @returns {Promise<{success: boolean, date: string}>}
 */
async function saveEntry(data) {
  return _post({ action: 'saveEntry', data });
}

// ============================================================
// 予算（KGI設定）
// ============================================================

/**
 * 指定月の予算を取得
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {Promise<Budget|null>}
 */
async function getBudget(yearMonth) {
  return _get({ action: 'getBudget', yearMonth });
}

/**
 * 予算を保存（yearMonth でupsert）
 * @param {Budget} data
 * @returns {Promise<{success: boolean, yearMonth: string}>}
 */
async function saveBudget(data) {
  return _post({ action: 'saveBudget', data });
}

// ============================================================
// エクスポート（全データ）
// ============================================================

/**
 * 全エントリ＋全予算をまとめて取得
 * @returns {Promise<{entries: DailyEntry[], budgets: Budget[]}>}
 */
async function getAllData() {
  return _get({ action: 'getAllData' });
}

/**
 * 日次エントリを削除（date で行を特定）
 * @param {string} date - "YYYY-MM-DD"
 * @returns {Promise<{success: boolean, date: string}>}
 */
async function deleteEntry(date) {
  return _post({ action: 'deleteEntry', data: { date } });
}

// ============================================================
// AI レポート
// ============================================================

async function generateReport(type) {
  return _post({ action: 'generateReport', data: { type } });
}

async function getLatestReport(type) {
  return _get({ action: 'getLatestReport', type });
}

async function generateOfficeReport(type) {
  return _post({ action: 'generateOfficeReport', data: { type } });
}

async function getAllOfficeData() {
  return _get({ action: 'getAllOfficeData' });
}

async function getUserSettings() {
  return _get({ action: 'getUserSettings' });
}
async function saveUserSettings(data) {
  return _post({ action: 'saveUserSettings', data });
}
async function getOfficeSettings() {
  return _get({ action: 'getOfficeSettings' });
}
async function saveOfficeSettings(data) {
  return _post({ action: 'saveOfficeSettings', data });
}
async function saveFeedback(data) {
  return _post({ action: 'saveFeedback', data });
}

// ============================================================
// 営業所管理機能（Step A1〜）
// ============================================================

async function setupOfficeSheets() {
  return _post({ action: 'setupOfficeSheets', data: {} });
}

async function getOfficeDaily(params) {
  const p = Object.assign({ action: 'getOfficeDaily' }, params || {});
  return _get(p);
}

async function saveOfficeDaily(entries) {
  return _post({ action: 'saveOfficeDaily', data: entries });
}

async function deleteOfficeDaily(params) {
  return _post({ action: 'deleteOfficeDaily', data: params });
}

async function getOfficeSalesPlan(yearMonth) {
  const params = { action: 'getOfficeSalesPlan' };
  if (yearMonth) params.yearMonth = yearMonth;
  return _get(params);
}

async function saveOfficeSalesPlan(entries) {
  return _post({ action: 'saveOfficeSalesPlan', data: entries });
}

async function getOfficeReports(params) {
  const p = Object.assign({ action: 'getOfficeReports' }, params || {});
  return _get(p);
}

async function saveOfficeReport(report) {
  return _post({ action: 'saveOfficeReport', data: report });
}
