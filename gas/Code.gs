/**
 * Code.gs - Nice Serviceman 日報 Apps Script API
 *
 * デプロイ設定:
 *   「次のユーザーとして実行」→「自分」
 *   「アクセスできるユーザー」→「自分のみ」（Step S0 以降）
 *
 * 配信方式:
 *   GET（action なし）→ HtmlService でアプリ本体を配信（個人 Gmail 認証必須）
 *   GET（action あり）→ JSON API（後方互換。github pages 版から呼ばれる場合のみ）
 *   google.script.run → gas* 公開関数（GAS 配信版アプリから呼ばれる）
 */

// シート名定数
var SHEET_BUDGET  = 'budget';
var SHEET_ENTRIES = 'entries';

// budget シートの列順（A列から順に）
var BUDGET_COLS = [
  'year_month',
  'inspection',
  'promotion_amount',
  'promotion_count',
  'maintenance_this_month',
  'maintenance_next_month',
  'maintenance_next2_month',
  'new_acquisition',
  'ac_cleaning',
  'full_maintenance',
  'toss_up',
  'personal_plan',
  'office_plan'
];

// entries シートの列順（A列から順に）  ← Phase3: id/timestamp を先頭に追加
var ENTRIES_COLS = [
  'id',
  'timestamp',
  'date',
  'inspection',
  'promotion_amount',
  'promotion_count',
  'maintenance_this_month',
  'maintenance_next_month',
  'maintenance_next2_month',
  'new_acquisition',
  'ac_cleaning',
  'full_maintenance',
  'toss_up',
  'relationship_actions',
  'positive_feedback',
  'negative_feedback',
  'memorable_visit',
  'notes',
  'notes_important',
  'insight',
  'personal_unsettled',
  'office_unsettled',
  'next_action'
];

// 積み上げ計算する数値フィールド（camelCase）
var NUMERIC_ENTRY_KEYS = [
  'inspection', 'promotionAmount', 'promotionCount',
  'maintenanceThisMonth', 'maintenanceNextMonth', 'maintenanceNext2Month',
  'newAcquisition', 'acCleaning', 'fullMaintenance', 'tossUp',
  'positiveFeedback', 'negativeFeedback'
];

// ============================================================
// メインハンドラ
// ============================================================

function doGet(e) {
  // action なし = アプリ本体を HtmlService で配信（個人 Gmail 認証が通った人のみ到達できる）
  if (!e.parameter.action) {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Nice Serviceman 日報')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // action あり = 後方互換 JSON API（GitHub Pages 版から呼ばれる場合のみ使用）
  try {
    var action = e.parameter.action || '';
    var result;

    if (action === 'getEntries') {
      var yearMonth = e.parameter.yearMonth || '';
      result = getEntriesImpl(yearMonth);

    } else if (action === 'getBudget') {
      var yearMonth = e.parameter.yearMonth || '';
      result = getBudgetImpl(yearMonth);

    } else if (action === 'getAllData') {
      result = getAllDataImpl();

    } else if (action === 'getLatestReport') {
      result = getLatestReportImpl(e.parameter.type || '');

    } else {
      result = { status: 'ok', message: 'Nice Serviceman 日報 API', timestamp: new Date().toISOString() };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  // 後方互換 JSON API（GitHub Pages 版から呼ばれる場合のみ使用）
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var data   = body.data   || {};
    var result;

    if (action === 'saveEntry') {
      result = saveEntryImpl(data);

    } else if (action === 'saveBudget') {
      result = saveBudgetImpl(data);

    } else if (action === 'deleteEntry') {
      result = deleteEntryImpl(data.date);

    } else if (action === 'migrateToV1') {
      result = migrateToV1();

    } else if (action === 'cleanupDuplicates') {
      result = cleanupDuplicateEntries();

    } else if (action === 'generateReport') {
      result = generateReportImpl(data);

    } else {
      result = { error: '不明なアクション: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// DB移行（1回だけ手動実行）
// ============================================================

/**
 * 既存 entries シートを entries_v1 にリネームし、
 * 新スキーマ（id/timestamp付き）の entries シートを作成する。
 * Apps Script エディタから手動で1回だけ実行すること。
 */
function migrateToV1() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var oldSheet = ss.getSheetByName('entries');
  if (!oldSheet) throw new Error('entriesシートが見つかりません');

  var existingV1 = ss.getSheetByName('entries_v1');
  if (existingV1) throw new Error('entries_v1 が既に存在します。手動で確認・削除してください');

  // entries → entries_v1 にリネーム
  oldSheet.setName('entries_v1');

  // 新しい entries シートを作成してヘッダーをセット
  var newSheet = ss.insertSheet('entries');
  newSheet.getRange(1, 1, 1, ENTRIES_COLS.length).setValues([ENTRIES_COLS]);

  return { success: true, message: 'entries → entries_v1 リネーム完了。新 entries シートを作成しました' };
}

// ============================================================
// エントリ（日次記録）
// ============================================================

/**
 * エントリ一覧を取得（同日の複数行を累計集約して返す）
 * @param {string} yearMonth - "YYYY-MM"（空文字なら全件）
 * @returns {Object[]}
 */
function getEntriesImpl(yearMonth) {
  var sheet = getSheet(SHEET_ENTRIES);
  var rows  = sheetToObjects(sheet, ENTRIES_COLS);

  if (yearMonth) {
    rows = rows.filter(function(row) {
      return dateToYMD(row.date).slice(0, 7) === yearMonth;
    });
  }

  var normalized = rows.map(function(row) {
    return normalizeEntry(row);
  });

  return aggregateByDate(normalized);
}

/**
 * 同日の複数行を累計集約する
 * - 数値KPIフィールド: sum
 * - テキスト・boolean: 最新行（timestamp降順）の値を使用
 * - hasNegative: いずれかの数値フィールドが累計マイナスなら true
 */
function aggregateByDate(entries) {
  var dateMap = {};
  var dateOrder = [];

  entries.forEach(function(entry) {
    var d = entry.date;
    if (!d) return;
    if (!dateMap[d]) {
      dateMap[d] = [];
      dateOrder.push(d);
    }
    dateMap[d].push(entry);
  });

  return dateOrder.map(function(date) {
    var rows = dateMap[date];
    // timestamp降順でソートし最新行を取得
    rows.sort(function(a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
    var latest = rows[0];

    var aggregated = {
      date:                date,
      id:                  latest.id,
      timestamp:           latest.timestamp,
      relationshipActions: latest.relationshipActions,
      memorableVisit:      latest.memorableVisit,
      notes:               latest.notes,
      notesImportant:      latest.notesImportant,
      insight:             latest.insight,
      personalUnsettled:   latest.personalUnsettled,
      officeUnsettled:     latest.officeUnsettled,
      nextAction:          latest.nextAction,
    };

    // 数値フィールドを合計
    NUMERIC_ENTRY_KEYS.forEach(function(key) {
      aggregated[key] = rows.reduce(function(sum, r) {
        return sum + (r[key] || 0);
      }, 0);
    });

    // 累計マイナス警告フラグ
    aggregated.hasNegative = NUMERIC_ENTRY_KEYS.some(function(key) {
      return aggregated[key] < 0;
    });

    return aggregated;
  });
}

/**
 * エントリを保存（積み上げ型: 常に新規行をinsert）
 * @param {Object} data
 */
function saveEntryImpl(data) {
  var sheet = getSheet(SHEET_ENTRIES);
  var date  = String(data.date || '');
  if (!date) throw new Error('date が指定されていません');

  var id        = Utilities.getUuid();
  var timestamp = new Date().toISOString();

  var row = ENTRIES_COLS.map(function(col) {
    if (col === 'id')        return id;
    if (col === 'timestamp') return timestamp;

    var val = data[snakeToCamel(col)];
    if (val === undefined) val = data[col];

    if (col === 'relationship_actions' && Array.isArray(val)) {
      val = val.join(',');
    }
    if (col === 'notes_important') {
      val = val ? 'TRUE' : 'FALSE';
    }
    return val !== undefined && val !== null ? val : '';
  });

  sheet.appendRow(row);
  return { success: true, date: date, id: id };
}

/**
 * エントリを削除（指定日の全行を削除）
 * @param {string} date - "YYYY-MM-DD"
 */
function deleteEntryImpl(date) {
  var sheet    = getSheet(SHEET_ENTRIES);
  var lastRow  = sheet.getLastRow();
  if (lastRow < 2) return { success: false, message: '該当データが見つかりません: ' + date };

  var dateColIndex = ENTRIES_COLS.indexOf('date') + 1; // 1-based列番号
  var col = sheet.getRange(2, dateColIndex, lastRow - 1, 1).getValues();
  var rowsToDelete = [];

  for (var i = 0; i < col.length; i++) {
    if (dateToYMD(col[i][0]) === String(date)) {
      rowsToDelete.push(i + 2);
    }
  }

  if (rowsToDelete.length === 0) {
    return { success: false, message: '該当データが見つかりません: ' + date };
  }

  // 後ろから削除（行番号ずれ防止）
  rowsToDelete.sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(r) { sheet.deleteRow(r); });

  return { success: true, date: date, deleted: rowsToDelete.length };
}

// ============================================================
// 予算（KGI設定）
// ============================================================

function getBudgetImpl(yearMonth) {
  if (!yearMonth) throw new Error('yearMonth が指定されていません');

  var sheet    = getSheet(SHEET_BUDGET);
  var rows     = sheetToObjects(sheet, BUDGET_COLS);
  var filtered = rows.filter(function(row) {
    return dateToYMD(row.year_month).slice(0, 7) === yearMonth;
  });

  if (filtered.length === 0) return null;

  var row = filtered[filtered.length - 1];
  return normalizeBudget(row);
}

function saveBudgetImpl(data) {
  var sheet     = getSheet(SHEET_BUDGET);
  var yearMonth = String(data.yearMonth || data.year_month || '');
  if (!yearMonth) throw new Error('yearMonth が指定されていません');

  var row = BUDGET_COLS.map(function(col) {
    var val = data[snakeToCamel(col)];
    if (val === undefined) val = data[col];
    return val !== undefined && val !== null ? val : '';
  });

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var col = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var matchRows = [];
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]).trim() === yearMonth) matchRows.push(i + 2);
    }
    for (var j = matchRows.length - 1; j >= 1; j--) {
      sheet.deleteRow(matchRows[j]);
    }
    if (matchRows.length > 0) {
      sheet.getRange(matchRows[0], 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  } else {
    sheet.appendRow(row);
  }

  return { success: true, yearMonth: yearMonth };
}

/**
 * 同じ日付の重複行を削除（Phase2互換。Phase3では通常不要）
 */
function cleanupDuplicateEntries() {
  var sheet = getSheet(SHEET_ENTRIES);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { cleaned: 0 };

  var dateColIndex = ENTRIES_COLS.indexOf('date') + 1;
  var data = sheet.getRange(2, dateColIndex, lastRow - 1, 1).getValues();
  var seen = {};
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 0; i--) {
    var d = dateToYMD(data[i][0]);
    if (!d) continue;
    if (seen[d]) {
      rowsToDelete.push(i + 2);
    } else {
      seen[d] = true;
    }
  }

  rowsToDelete.sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(r) { sheet.deleteRow(r); });

  return { cleaned: rowsToDelete.length };
}

// ============================================================
// 全データエクスポート
// ============================================================

function getAllDataImpl() {
  var entries = getEntriesImpl('');
  var budgets = sheetToObjects(getSheet(SHEET_BUDGET), BUDGET_COLS).map(normalizeBudget);
  return { entries: entries, budgets: budgets };
}

// ============================================================
// ユーティリティ
// ============================================================

function getSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('シート「' + name + '」が見つかりません');
  return sheet;
}

function sheetToObjects(sheet, cols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data    = sheet.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var results = [];

  data.forEach(function(row) {
    if (row.every(function(cell) { return cell === '' || cell === null; })) return;

    var obj = {};
    cols.forEach(function(col, i) {
      obj[col] = row[i];
    });
    results.push(obj);
  });

  return results;
}

function findRowByKey(sheet, colIndex, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var col  = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(value)) {
      return i + 2;
    }
  }
  return -1;
}

function dateToYMD(d) {
  if (!d) return '';
  if (d instanceof Date) {
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }
  var s = String(d).trim();
  if (/^\d{8}$/.test(s)) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  return s.slice(0, 10);
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeEntry(row) {
  return {
    id:                     String(row.id || ''),
    timestamp:              String(row.timestamp || ''),
    date:                   dateToYMD(row.date),
    inspection:             Number(row.inspection) || 0,
    promotionAmount:        Number(row.promotion_amount) || 0,
    promotionCount:         Number(row.promotion_count) || 0,
    maintenanceThisMonth:   Number(row.maintenance_this_month) || 0,
    maintenanceNextMonth:   Number(row.maintenance_next_month) || 0,
    maintenanceNext2Month:  Number(row.maintenance_next2_month) || 0,
    newAcquisition:         Number(row.new_acquisition) || 0,
    acCleaning:             Number(row.ac_cleaning) || 0,
    fullMaintenance:        Number(row.full_maintenance) || 0,
    tossUp:                 Number(row.toss_up) || 0,
    relationshipActions:    row.relationship_actions ? String(row.relationship_actions).split(',').filter(Boolean) : [],
    positiveFeedback:       Number(row.positive_feedback) || 0,
    negativeFeedback:       Number(row.negative_feedback) || 0,
    memorableVisit:         String(row.memorable_visit || ''),
    notes:                  String(row.notes || ''),
    notesImportant:         String(row.notes_important).toUpperCase() === 'TRUE',
    insight:                String(row.insight || ''),
    personalUnsettled:      Number(row.personal_unsettled) || 0,
    officeUnsettled:        Number(row.office_unsettled) || 0,
    nextAction:             String(row.next_action || '')
  };
}

function normalizeBudget(row) {
  return {
    yearMonth:              String(row.year_month || ''),
    inspection:             Number(row.inspection) || 0,
    promotionAmount:        Number(row.promotion_amount) || 0,
    promotionCount:         Number(row.promotion_count) || 0,
    maintenanceThisMonth:   Number(row.maintenance_this_month) || 0,
    maintenanceNextMonth:   Number(row.maintenance_next_month) || 0,
    maintenanceNext2Month:  Number(row.maintenance_next2_month) || 0,
    newAcquisition:         Number(row.new_acquisition) || 0,
    acCleaning:             Number(row.ac_cleaning) || 0,
    fullMaintenance:        Number(row.full_maintenance) || 0,
    tossUp:                 Number(row.toss_up) || 0,
    personalPlan:           Number(row.personal_plan) || 0,
    officePlan:             Number(row.office_plan) || 0
  };
}

// ============================================================
// AI レポート（Gemini API）
// ============================================================

function _ensureAiReportsSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('AI_Reports');
  if (!sheet) {
    sheet = ss.insertSheet('AI_Reports');
    sheet.getRange(1, 1, 1, 4).setValues([['timestamp', 'type', 'period', 'content']]);
  }
  return sheet;
}

function _callGemini(prompt) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY が設定されていません');
  var url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + key;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    muteHttpExceptions: true,
  });
  var json = JSON.parse(res.getContentText());
  if (!json.candidates || !json.candidates[0]) {
    throw new Error('Gemini応答エラー: ' + res.getContentText().slice(0, 200));
  }
  return json.candidates[0].content.parts[0].text;
}

function generateReportImpl(data) {
  var type = data.type; // 'weekly' | 'monthly'
  var jst  = new Date(new Date().getTime() + 9 * 3600000);
  var todayStr  = jst.toISOString().slice(0, 10);
  var yearMonth = todayStr.slice(0, 7);

  var curEntries = getEntriesImpl(yearMonth); // 配列を返す
  var budget     = getBudgetImpl(yearMonth);  // オブジェクト or null

  var curData, prevData, periodLabel;

  if (type === 'weekly') {
    var dow  = jst.getUTCDay(); // 0=日 〜 6=土
    var diff = dow === 0 ? -6 : 1 - dow;
    var weekStartMs = jst.getTime() + diff * 86400000;
    var weekStart   = new Date(weekStartMs).toISOString().slice(0, 10);

    curData = curEntries.filter(function(e) { return e.date >= weekStart && e.date <= todayStr; });

    var prevStart = new Date(weekStartMs - 7 * 86400000).toISOString().slice(0, 10);
    var prevEnd   = new Date(jst.getTime()  - 7 * 86400000).toISOString().slice(0, 10);
    var prevYm    = prevStart.slice(0, 7);
    var prevAll   = prevYm === yearMonth ? curEntries : getEntriesImpl(prevYm);
    prevData = prevAll.filter(function(e) { return e.date >= prevStart && e.date <= prevEnd; });

    periodLabel = weekStart + ' 〜 ' + todayStr;
  } else {
    curData = curEntries;
    var ym  = yearMonth.split('-').map(Number);
    var pY  = ym[0], pM = ym[1] - 1;
    if (pM === 0) { pY--; pM = 12; }
    var prevYm = pY + '-' + (pM < 10 ? '0' + pM : String(pM));
    prevData   = getEntriesImpl(prevYm);
    periodLabel = yearMonth;
  }

  var KPI_KEYS   = ['inspection','promotionAmount','promotionCount',
    'maintenanceThisMonth','maintenanceNextMonth','maintenanceNext2Month',
    'newAcquisition','acCleaning','fullMaintenance','tossUp'];
  var KPI_LABELS = {
    inspection:'点検件数', promotionAmount:'促進受注額', promotionCount:'促進件数',
    maintenanceThisMonth:'当月保守継続', maintenanceNextMonth:'次月保守継続',
    maintenanceNext2Month:'次々月保守継続', newAcquisition:'新規保守',
    acCleaning:'エアコン洗浄', fullMaintenance:'フルメンテリース', tossUp:'営業トスアップ'
  };

  var sum = function(arr, key) {
    return arr.reduce(function(s, e) { return s + (Number(e[key]) || 0); }, 0);
  };
  var fmt = function(key, v) {
    return key === 'promotionAmount' ? '¥' + v.toLocaleString() : v + '件';
  };

  var kpiLines = KPI_KEYS.map(function(key) {
    var cur  = sum(curData, key);
    var prev = sum(prevData, key);
    var plan = type === 'weekly'
      ? (budget && budget[key] ? Math.round(budget[key] / 3) : 0)
      : (budget ? (budget[key] || 0) : 0);
    var rateStr = plan > 0 ? '（' + Math.round(cur / plan * 100) + '%）' : '';
    var compStr = (type === 'weekly' ? ' 先週比' : ' 先月比') +
                  (cur - prev >= 0 ? '+' : '') + (cur - prev);
    return '  - ' + KPI_LABELS[key] + ': 実績' + fmt(key, cur) + ' / 目標' + fmt(key, plan) + rateStr + compStr;
  }).join('\n');

  var insights    = curData.filter(function(e) { return e.insight; })
    .slice(0, 3).map(function(e) { return '  ・' + e.insight; }).join('\n');
  var nextActions = curData.filter(function(e) { return e.nextAction; })
    .slice(0, 3).map(function(e) { return '  ・' + e.nextAction; }).join('\n');

  var tLabel = type === 'weekly' ? '週次' : '月次';
  var pKey   = type === 'weekly' ? '週' : '月';

  var prompt =
    'あなたは優秀な営業マネージャーです。以下の' + tLabel + '営業データを分析し、' +
    '必ず下記の形式のみで出力してください。形式以外の文言は不要です。\n\n' +
    '【対象期間】' + periodLabel + '\n\n' +
    '【KPI実績 vs ' + tLabel + '目標】\n' + kpiLines + '\n\n' +
    '【今' + pKey + 'の気づき・次の一手】\n' +
    (insights    || '  （記録なし）') + '\n' +
    (nextActions || '') + '\n\n' +
    '# 出力形式（厳守）\n' +
    '① 良点\n・〇〇\n・〇〇\n\n' +
    '② 改善点\n・〇〇\n・〇〇\n\n' +
    '③ まとめ\n150〜200文字で簡潔に記載\n\n' +
    '④ 次回アクション提案\n・〇〇\n・〇〇';

  var content = _callGemini(prompt);

  _ensureAiReportsSheet().appendRow([new Date().toISOString(), type, periodLabel, content]);

  return { success: true, content: content, period: periodLabel };
}

function getLatestReportImpl(type) {
  type = type || '';
  try {
    var sheet   = _ensureAiReportsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, content: null };
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i][1] === type) {
        return { success: true, type: data[i][1], period: String(data[i][2]),
                 content: String(data[i][3]), timestamp: String(data[i][0]) };
      }
    }
  } catch (err) {
    Logger.log('getLatestReport エラー: ' + err.message);
  }
  return { success: true, content: null };
}

// 毎週金曜 18 時に自動実行（setupAiTriggers() で登録）
function weeklyReportTrigger() {
  try { generateReportImpl({ type: 'weekly' }); }
  catch (e) { Logger.log('週次レポート自動生成エラー: ' + e.message); }
}

// ============================================================
// 月末自動判定（Step16）
// ============================================================

function isHolidayOrWeekend(date) {
  var dow = date.getDay(); // 0=日, 6=土
  if (dow === 0 || dow === 6) return true;
  var calId = 'ja.japanese.official#holiday@group.v.calendar.google.com';
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) return false;
  var start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var end   = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return cal.getEvents(start, end).length > 0;
}

function isLastBusinessDayOfMonth() {
  var jst   = new Date(new Date().getTime() + 9 * 3600000);
  var today = jst.toISOString().slice(0, 10);
  var lastDay = new Date(jst.getFullYear(), jst.getMonth() + 1, 0);
  while (isHolidayOrWeekend(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return today === lastDay.toISOString().slice(0, 10);
}

// 毎日 19 時に自動実行 → 月末最終営業日のみ月次レポートを生成
function monthlyReportTrigger() {
  if (!isLastBusinessDayOfMonth()) return;
  try { generateReportImpl({ type: 'monthly' }); }
  catch (e) { Logger.log('月次レポート自動生成エラー: ' + e.message); }
}

// ============================================================
// google.script.run 公開関数（GAS 配信版アプリから呼ばれる）
// api_gas.js の _callGas() が対応する。戻り値は JSON 文字列。
// ============================================================

function gasGetEntries(yearMonth) {
  return JSON.stringify(getEntriesImpl(yearMonth || ''));
}

function gasSaveEntry(data) {
  return JSON.stringify(saveEntryImpl(data));
}

function gasGetBudget(yearMonth) {
  return JSON.stringify(getBudgetImpl(yearMonth));
}

function gasSaveBudget(data) {
  return JSON.stringify(saveBudgetImpl(data));
}

function gasGetAllData() {
  return JSON.stringify(getAllDataImpl());
}

function gasDeleteEntry(date) {
  return JSON.stringify(deleteEntryImpl(date));
}

function gasGenerateReport(type) {
  return JSON.stringify(generateReportImpl({ type: type }));
}

function gasGetLatestReport(type) {
  return JSON.stringify(getLatestReportImpl(type || ''));
}

// ============================================================
// GAS エディタから一度だけ手動実行 → 時刻トリガーを登録
function setupAiTriggers() {
  ['weeklyReportTrigger', 'monthlyReportTrigger'].forEach(function(fn) {
    ScriptApp.getProjectTriggers()
      .filter(function(t) { return t.getHandlerFunction() === fn; })
      .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  });
  ScriptApp.newTrigger('weeklyReportTrigger')
    .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).create();
  ScriptApp.newTrigger('monthlyReportTrigger')
    .timeBased().everyDays(1).atHour(19).create();
  Logger.log('AIトリガー登録完了（週次: 金曜18時 / 月次判定: 毎日19時）');
}
