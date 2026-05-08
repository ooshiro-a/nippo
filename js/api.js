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
  // Apps Script は302リダイレクトを返す場合があり、POSTがGETに変わってしまう。
  // redirect:'manual' で初回リダイレクト先URLを取得し、そこへ再POSTする。
  const res1 = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  console.log('[API POST] res1.type:', res1.type, 'status:', res1.status);
  const target = (res1.type === 'opaqueredirect' || (res1.status >= 300 && res1.status < 400))
    ? (res1.headers.get('location') || APPS_SCRIPT_URL)
    : null;
  console.log('[API POST] target:', target ? (target === APPS_SCRIPT_URL ? 'fallback(same URL)' : 'redirect URL') : 'none');
  const res = target
    ? await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
        redirect: 'follow',
      })
    : res1;
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
