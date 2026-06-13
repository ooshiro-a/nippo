// 日本の祝日リスト生成スクリプト（標準算出ロジック、ライブラリ不使用）
// 振替休日・国民の休日ルールを含む。出力範囲: 2025-01-01 〜 2028-12-31

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function dateFromYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(s, n) {
  const d = dateFromYmd(s);
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
}
function dow(s) { return dateFromYmd(s).getUTCDay(); } // 0=日

// 第N月曜日
function nthMonday(year, month, n) {
  let count = 0;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 1) {
      count++;
      if (count === n) return ymd(year, month, d);
    }
  }
  return null;
}

// 春分の日・秋分の日（近似式、1980-2099年で有効）
function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function baseHolidays(year) {
  const list = [];
  const add = (s, name) => list.push({ date: s, name });

  add(ymd(year, 1, 1), '元日');
  add(nthMonday(year, 1, 2), '成人の日');
  add(ymd(year, 2, 11), '建国記念の日');
  add(ymd(year, 2, 23), '天皇誕生日');
  add(ymd(year, 3, vernalEquinoxDay(year)), '春分の日');
  add(ymd(year, 4, 29), '昭和の日');
  add(ymd(year, 5, 3), '憲法記念日');
  add(ymd(year, 5, 4), 'みどりの日');
  add(ymd(year, 5, 5), 'こどもの日');
  add(nthMonday(year, 7, 3), '海の日');
  add(ymd(year, 8, 11), '山の日');
  add(nthMonday(year, 9, 3), '敬老の日');
  add(ymd(year, 9, autumnalEquinoxDay(year)), '秋分の日');
  add(nthMonday(year, 10, 2), 'スポーツの日');
  add(ymd(year, 11, 3), '文化の日');
  add(ymd(year, 11, 23), '勤労感謝の日');

  return list;
}

// 2024-2029年分の基本祝日セットを作る（前後年の境界チェック用）
const set = new Set();
const nameMap = {};
for (let y = 2024; y <= 2029; y++) {
  baseHolidays(y).forEach(({ date, name }) => { set.add(date); nameMap[date] = name; });
}

// 振替休日: 元の祝日が日曜なら、休日でない直後の日を振替休日とする（基本セットのみで1回算出）
const baseSet = new Set(set);
const toAddSubstitute = [];
Array.from(baseSet).forEach((d) => {
  if (dow(d) === 0) {
    let next = addDays(d, 1);
    while (baseSet.has(next) || toAddSubstitute.includes(next)) next = addDays(next, 1);
    toAddSubstitute.push(next);
  }
});
toAddSubstitute.forEach((d) => { set.add(d); nameMap[d] = nameMap[d] || '振替休日'; });

// 国民の休日: 前後が祝日（振替休日含む）で当日が祝日でなく日曜でない日。2回繰り返して収束させる
for (let pass = 0; pass < 2; pass++) {
  const toAddCitizens = [];
  Array.from(set).forEach((d) => {
    const next = addDays(d, 1);
    const next2 = addDays(d, 2);
    if (set.has(next2) && !set.has(next) && dow(next) !== 0) {
      toAddCitizens.push(next);
    }
  });
  toAddCitizens.forEach((d) => { set.add(d); nameMap[d] = nameMap[d] || '国民の休日'; });
}

const result = Array.from(set)
  .filter((d) => d >= '2025-01-01' && d <= '2028-12-31')
  .sort();

console.log(`// 件数: ${result.length}`);
result.forEach((d) => console.log(`  '${d}', // ${nameMap[d]}`));
