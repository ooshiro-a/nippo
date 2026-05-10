/**
 * utils.js - 日付・計算ユーティリティ
 * Nice Serviceman 日報
 */

/**
 * 今日の日付を JST で YYYY-MM-DD 形式で返す
 * @returns {string} e.g. "2026-05-06"
 */
function getTodayJST() {
  const now = new Date();
  // JST = UTC + 9時間
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * 現在の年月を JST で YYYY-MM 形式で返す
 * @returns {string} e.g. "2026-05"
 */
function getCurrentYearMonthJST() {
  return getTodayJST().slice(0, 7);
}

/**
 * YYYY-MM-DD → 表示用「5月6日（火）」形式
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string} e.g. "5月6日（火）"
 */
function formatDate(dateStr) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  // タイムゾーンズレを防ぐため UTC として扱う
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = weekdays[d.getUTCDay()];
  return `${month}月${day}日（${weekday}）`;
}

/**
 * YYYY-MM → 表示用「2026年5月」形式
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {string} e.g. "2026年5月"
 */
function formatYearMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}年${month}月`;
}

/**
 * 指定月の営業日数を計算（土日を除く）
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {number} 営業日数
 */
function getBusinessDaysInMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * 今月の残営業日数（今日を含む）
 * @returns {number} 残営業日数
 */
function getRemainingBusinessDays() {
  const today = getTodayJST();
  const [year, month, todayDay] = today.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = todayDay; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * 信頼関係指数を計算
 * 計算式: 関係構築アクション数 × 2pt + ポジFB × 5pt - ネガFB × 3pt
 * @param {string[]} actions - 関係構築アクションの配列
 * @param {number} positiveFeedback
 * @param {number} negativeFeedback
 * @returns {number} 信頼関係指数
 */
function calcTrustIndex(actions, positiveFeedback, negativeFeedback) {
  const actionPts = (actions || []).length * 2;
  const posPts = (positiveFeedback || 0) * 5;
  const negPts = (negativeFeedback || 0) * 3;
  return actionPts + posPts - negPts;
}

/**
 * 達成率から進捗バーの色クラスを返す
 * @param {number} rate - 達成率（0〜100以上）
 * @returns {string} CSSクラス名
 */
function getProgressColorClass(rate) {
  if (rate >= 100) return 'green';
  if (rate >= 70)  return 'cyan';
  if (rate >= 40)  return 'amber';
  return 'red';
}

/**
 * 数値を3桁カンマ区切りで返す
 * @param {number} num
 * @returns {string} e.g. "1,234,567"
 */
function formatNumber(num) {
  return (num || 0).toLocaleString('ja-JP');
}

/**
 * 円表示（¥ + 3桁区切り）
 * @param {number} amount
 * @returns {string} e.g. "¥1,234,567"
 */
function formatCurrency(amount) {
  return '¥' + formatNumber(amount);
}

/**
 * 今週の月曜日を YYYY-MM-DD で返す
 * @returns {string} e.g. "2026-05-11"
 */
function getWeekStartJST() {
  const today = getTodayJST();
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(date.getTime() + diff * 86400000).toISOString().slice(0, 10);
}
