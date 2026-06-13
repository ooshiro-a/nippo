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
 * 指定月の月経過率を返す（0〜100）
 * @param {string} yearMonth - "YYYY-MM"
 * @param {string} [asOfDate] - 基準日 "YYYY-MM-DD"、省略時は今日
 */
function calcElapsedPct(yearMonth, asOfDate) {
  var today = asOfDate || getTodayJST();
  var todayYM = today.slice(0, 7);
  if (todayYM < yearMonth) return 0;
  if (todayYM > yearMonth) return 100;
  var parts = yearMonth.split('-').map(Number);
  var daysInMonth = new Date(parts[0], parts[1], 0).getDate();
  var todayDay = Number(today.slice(8, 10));
  return Math.round(todayDay / daysInMonth * 100);
}

/**
 * 達成率と月経過率からペース判定を返す
 * @param {number} achieveRate
 * @param {number} elapsedPct
 * @returns {{ label: string, colorClass: string }}
 */
function calcPaceBadge(achieveRate, elapsedPct) {
  var diff = achieveRate - elapsedPct;
  if (diff >= 10)  return { label: '先行',    colorClass: 'green' };
  if (diff >= -10) return { label: '順調',    colorClass: 'cyan'  };
  if (diff >= -25) return { label: 'やや遅れ', colorClass: 'amber' };
  return { label: '要注意', colorClass: 'red' };
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

// ------------------------------------------------------------------
// 営業日・必要ペース計算（進捗タブ用）
// JP_HOLIDAYS (holidaysConfig.js) / KGI_DEADLINE_CONFIG (kgiDeadlineConfig.js) に依存
// ------------------------------------------------------------------

function _dateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * 指定日が日本の祝日かどうか
 * @param {string} dateStr - "YYYY-MM-DD"
 */
function isJpHoliday(dateStr) {
  return JP_HOLIDAYS.indexOf(dateStr) >= 0;
}

/**
 * 指定日が営業日かどうか（土日祝は休み）
 * @param {string} dateStr - "YYYY-MM-DD"
 */
function isBusinessDay(dateStr) {
  const dow = _dateUTC(dateStr).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !isJpHoliday(dateStr);
}

/**
 * 暦日を加減算する
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number} n - 加減算する日数（負数可）
 */
function addCalendarDays(dateStr, n) {
  return new Date(_dateUTC(dateStr).getTime() + n * 86400000).toISOString().slice(0, 10);
}

/**
 * 指定日が営業日になるまで日付をずらす
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number} direction - -1: 直前の営業日へ、+1: 直後の営業日へ
 */
function rollToBusinessDay(dateStr, direction) {
  let d = dateStr;
  while (!isBusinessDay(d)) d = addCalendarDays(d, direction);
  return d;
}

/**
 * 期限日から「実質目標日」（期限の2暦日前。営業日でなければ直前の営業日に繰り上げ）を返す
 * @param {string} deadlineDateStr - "YYYY-MM-DD"
 */
function getEffectiveTargetDate(deadlineDateStr) {
  return rollToBusinessDay(addCalendarDays(deadlineDateStr, -2), -1);
}

/**
 * 指定範囲（両端含む）の営業日数を返す
 * @param {string} startDateStr - "YYYY-MM-DD"
 * @param {string} endDateStr - "YYYY-MM-DD"
 */
function countBusinessDays(startDateStr, endDateStr) {
  if (startDateStr > endDateStr) return 0;
  let count = 0;
  let d = startDateStr;
  while (d <= endDateStr) {
    if (isBusinessDay(d)) count++;
    d = addCalendarDays(d, 1);
  }
  return count;
}

/**
 * KGI項目の達成期限日を返す（KGI_DEADLINE_CONFIGに無ければ月末）
 * @param {string} itemKey
 * @param {string} yearMonth - "YYYY-MM"
 */
function getKgiDeadlineDate(itemKey, yearMonth) {
  const cfg = KGI_DEADLINE_CONFIG[itemKey];
  const [y, m] = yearMonth.split('-').map(Number);
  if (cfg && cfg.day) {
    return `${yearMonth}-${String(cfg.day).padStart(2, '0')}`;
  }
  const lastDay = new Date(y, m, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * "YYYY-MM-DD" → "M/D"
 * @param {string} dateStr
 */
function formatMonthDay(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/**
 * 残必要数・必要ペース・期限超過/達成済を判定する
 * @param {object} params
 * @param {string} params.itemKey - KGI_DEADLINE_CONFIGのキー
 * @param {number} params.plan - 月間目標値
 * @param {number} params.actual - 実績累計（基準日時点）
 * @param {number|null} [params.prevActual] - 前日時点の実績累計（前日比表示用、無ければnull）
 * @param {string} params.unit - '円' | '件' | '台' など
 * @param {string} params.yearMonth - "YYYY-MM"
 * @param {string} params.asOfDateStr - 基準日 "YYYY-MM-DD"
 * @returns {{ achieved: boolean, overdue: boolean, text: string, colorClass: string }}
 */
function buildPaceInfo(params) {
  const { itemKey, plan, actual, prevActual, unit, yearMonth, asOfDateStr } = params;

  const remaining = plan - actual;
  if (remaining <= 0) {
    return { achieved: true, overdue: false, text: '達成済 ✓', colorClass: 'green' };
  }

  const deadline = getKgiDeadlineDate(itemKey, yearMonth);
  const effectiveTarget = getEffectiveTargetDate(deadline);
  const isCustom = !!KGI_DEADLINE_CONFIG[itemKey];
  const deadlineLabel = isCustom ? `〆${formatMonthDay(effectiveTarget)}` : '';

  const remainingBizDays = countBusinessDays(asOfDateStr, effectiveTarget);
  if (asOfDateStr > effectiveTarget || remainingBizDays <= 0) {
    const text = '期限超過' + (deadlineLabel ? `（${deadlineLabel}）` : '');
    return { achieved: false, overdue: true, text, colorClass: 'red' };
  }

  const requiredPaceRaw = remaining / remainingBizDays;
  const requiredPace = unit === '円' ? Math.floor(requiredPaceRaw) : Math.ceil(requiredPaceRaw);
  const paceStr = unit === '円' ? formatCurrency(requiredPace) + '/日' : formatNumber(requiredPace) + unit + '/日';

  const monthStart = yearMonth + '-01';
  const elapsedBizDays = countBusinessDays(monthStart, asOfDateStr);
  const currentPace = elapsedBizDays > 0 ? actual / elapsedBizDays : 0;
  const colorClass = currentPace >= requiredPaceRaw ? 'green' : 'red';

  let upMark = '';
  if (typeof prevActual === 'number') {
    const yesterday = addCalendarDays(asOfDateStr, -1);
    if (yesterday >= monthStart && yesterday <= effectiveTarget) {
      const prevRemainingBizDays = countBusinessDays(yesterday, effectiveTarget);
      if (prevRemainingBizDays > 0) {
        const prevRequiredPaceRaw = (plan - prevActual) / prevRemainingBizDays;
        if (requiredPaceRaw > prevRequiredPaceRaw) {
          upMark = ' <span style="color:var(--accent-red)">▲</span>';
        }
      }
    }
  }

  const text = paceStr + (deadlineLabel ? ' ' + deadlineLabel : '') + upMark;
  return { achieved: false, overdue: false, text, colorClass };
}
