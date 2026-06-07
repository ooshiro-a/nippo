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
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
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

    } else if (action === 'getAllOfficeData') {
      result = getOfficeDailyImpl({ scope: 'office' });

    } else if (action === 'getUserSettings') {
      result = getUserSettingsImpl();

    } else if (action === 'getOfficeSettings') {
      result = getOfficeSettingsImpl();

    } else if (action === 'getLatestReport') {
      result = getLatestReportImpl(e.parameter.type || '');

    } else {
      result = { status: 'ok', message: 'Nice Serviceman 日報 API', timestamp: new Date().toISOString() };
    }

    return jsonResponse(result);

  } catch (err) {
    Logger.log('doGet エラー: ' + err.message + '\n' + err.stack);
    return jsonResponse({ error: 'サーバーエラーが発生しました' });
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

    } else if (action === 'generateOfficeReport') {
      result = generateOfficeReportImpl(data);

    } else if (action === 'saveUserSettings') {
      result = saveUserSettingsImpl(data);

    } else if (action === 'saveOfficeSettings') {
      result = saveOfficeSettingsImpl(data);

    } else if (action === 'saveFeedback') {
      result = saveFeedbackImpl(data);

    } else {
      result = { error: '不明なアクション: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    Logger.log('doPost エラー: ' + err.message + '\n' + err.stack);
    return jsonResponse({ error: 'サーバーエラーが発生しました' });
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
      if (dateToYMD(col[i][0]).slice(0, 7) === yearMonth) matchRows.push(i + 2);
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
    yearMonth:              dateToYMD(row.year_month).slice(0, 7),
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

  // ── 注力事項 ──
  var settings   = getUserSettingsImpl();
  var focusItems = (settings.focusItems || '').trim();
  var focusSection = focusItems
    ? '\n【注力事項（ユーザー設定）】\n' + focusItems + '\n'
    : '';

  // ── 遅れ指標（月次のみ、数値根拠付き）──
  var lagSection = '';
  if (type === 'monthly') {
    var bdStats  = _getBusinessDayStats(yearMonth);
    var idealRate = bdStats.total > 0 ? bdStats.elapsed / bdStats.total : 0;
    var remainDays = bdStats.total - bdStats.elapsed;
    var lagLines = KPI_KEYS.filter(function(key) {
      var cur  = sum(curData, key);
      var plan = budget ? (Number(budget[key]) || 0) : 0;
      return plan > 0 && (cur / plan) < idealRate * 0.8;
    }).map(function(key) {
      var cur  = sum(curData, key);
      var plan = Number(budget[key]);
      var remaining = plan - cur;
      var perDay = remainDays > 0 ? Math.ceil(remaining / remainDays) : remaining;
      return '  - ' + KPI_LABELS[key] + ': 計画比' + Math.round(cur / plan * 100)
           + '%、残' + remainDays + '日で1日あたり' + fmt(key, perDay) + '必要';
    }).join('\n');
    if (lagLines) lagSection = '\n【遅れ指標（数値根拠）】\n' + lagLines + '\n';
  }

  // ── 過去フィードバック ──
  var feedbacks  = getRecentFeedbackImpl('personal', 3);
  var fbSection  = '';
  if (feedbacks.length) {
    fbSection = '\n【過去のフィードバック（直近' + feedbacks.length + '件）】\n' +
      feedbacks.map(function(f) {
        return '  ' + (f.score > 0 ? '👍' : '👎') + ' ' + f.reportType
             + '(' + f.reportPeriod + '): '
             + [f.goodComment, f.badComment].filter(Boolean).join(' / ');
      }).join('\n') + '\n';
  }

  var prompt =
    'あなたは優秀な営業マネージャーです。以下の' + tLabel + '営業データを分析し、' +
    '必ず下記の形式のみで出力してください。形式以外の文言は不要です。\n\n' +
    '【対象期間】' + periodLabel + '\n\n' +
    '【KPI実績 vs ' + tLabel + '目標】\n' + kpiLines + '\n\n' +
    '【今' + pKey + 'の気づき・次の一手】\n' +
    (insights    || '  （記録なし）') + '\n' +
    (nextActions || '') + '\n' +
    focusSection + lagSection + fbSection +
    '\n# 出力形式（厳守）\n' +
    '① 良点\n・〇〇\n・〇〇\n\n' +
    '② 改善点\n・〇〇\n・〇〇\n\n' +
    '③ まとめ\n150〜200文字で簡潔に記載\n\n' +
    (focusItems ? '④ 注力事項の進捗コメント\n注力事項それぞれについて1〜2文で現状を評価\n\n' : '') +
    '⑤ ネクストアクション\n' +
    (lagSection ? '・遅れ指標について：「残◯日で1日あたり◯件/◯円」形式で具体的に記載\n' : '') +
    (focusItems ? '・注力事項を加速させる行動を1〜2点提案\n' : '') +
    '・その他改善に直結する行動提案';

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

function generateOfficeReportImpl(data) {
  var type   = data.type;
  var period = data.period || null;
  var today  = dateToYMD(new Date());

  function pad(n) { return String(n).padStart(2, '0'); }

  var dateFrom, dateTo, prevFrom, prevTo, periodLabel, tLabel, pKey;

  if (type === 'yearly') {
    var yr = period ? Number(String(period).slice(0, 4)) : Number(today.slice(0, 4));
    dateFrom = yr + '-01-01'; dateTo = yr + '-12-31';
    prevFrom = (yr - 1) + '-01-01'; prevTo = (yr - 1) + '-12-31';
    periodLabel = yr + '年（年次）'; tLabel = '年次'; pKey = '年';

  } else if (type === 'quarterly') {
    var yr = period ? Number(String(period).slice(0, 4)) : Number(today.slice(0, 4));
    var q  = period ? Number(String(period).slice(-1)) : Math.ceil(Number(today.slice(5, 7)) / 3);
    var sm = (q - 1) * 3 + 1, em = q * 3;
    dateFrom = yr + '-' + pad(sm) + '-01'; dateTo = yr + '-' + pad(em) + '-31';
    prevFrom = (yr - 1) + '-' + pad(sm) + '-01'; prevTo = (yr - 1) + '-' + pad(em) + '-31';
    periodLabel = yr + '年Q' + q; tLabel = '四半期'; pKey = '四半期';

  } else if (type === 'daily') {
    var d = period || today;
    var dParts = d.split('-').map(Number);
    var prevMs = Date.UTC(dParts[0], dParts[1] - 1, dParts[2]) - 86400000;
    prevFrom = prevTo = dateToYMD(new Date(prevMs));
    dateFrom = dateTo = d;
    periodLabel = d; tLabel = '日次'; pKey = '日';

  } else if (type === 'weekly') {
    var ym = period || today.slice(0, 7);
    var isCurrentMonth = (ym === today.slice(0, 7));
    var refDateStr = isCurrentMonth ? today : (function() {
      var yr2 = Number(ym.slice(0, 4)), mo2 = Number(ym.slice(5, 7));
      return ym + '-' + pad(new Date(Date.UTC(yr2, mo2, 0)).getUTCDate());
    })();
    var rp = refDateStr.split('-').map(Number);
    var jstRef = new Date(Date.UTC(rp[0], rp[1] - 1, rp[2]) + 9 * 3600000);
    var dow = jstRef.getUTCDay() || 7;
    var weekStartMs   = jstRef.getTime() - (dow - 1) * 86400000;
    var weekStart     = new Date(weekStartMs).toISOString().slice(0, 10);
    var prevWeekStart = new Date(weekStartMs - 7 * 86400000).toISOString().slice(0, 10);
    var prevWeekEnd   = new Date(weekStartMs - 86400000).toISOString().slice(0, 10);
    dateFrom = weekStart; dateTo = isCurrentMonth ? today : refDateStr;
    prevFrom = prevWeekStart; prevTo = prevWeekEnd;
    periodLabel = weekStart + ' 〜 ' + dateTo; tLabel = '週次'; pKey = '週';

  } else { // monthly (default)
    var ym = period || today.slice(0, 7);
    var parts = ym.split('-').map(Number);
    var pY = parts[0], pM = parts[1] - 1;
    if (pM === 0) { pY--; pM = 12; }
    var prevYm = pY + '-' + pad(pM);
    dateFrom = ym + '-01'; dateTo = ym + '-31';
    prevFrom = prevYm + '-01'; prevTo = prevYm + '-31';
    periodLabel = ym; tLabel = '月次'; pKey = '月';
  }

  var curRows  = getOfficeDailyImpl({ dateFrom: dateFrom, dateTo: dateTo, scope: 'office' });
  var prevRows = getOfficeDailyImpl({ dateFrom: prevFrom, dateTo: prevTo, scope: 'office' });

  function getLatest(rows) {
    if (!rows.length) return {};
    return rows.reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, rows[0]);
  }

  var curEntry  = getLatest(curRows);
  var prevEntry = getLatest(prevRows);

  var n = function(e, key) { return Number(e[key]) || 0; };
  var fmt = function(key, v) {
    return (key === 'salesActual' || key === 'salesForecast') ? '¥' + v.toLocaleString() : v + '件';
  };

  var KPI_DEFS = [
    { key: 'inspectionActual',     planKey: 'inspectionPlan',      label: '点検件数' },
    { key: 'salesActual',          planKey: 'salesPlan',           label: '売上実績' },
    { key: 'salesForecast',        planKey: 'salesPlan',           label: '末見通し' },
    { key: 'renewalNextActualTop', planKey: 'renewalNextPlanTop',  label: '次月継続' },
    { key: 'totalMaintActual',     planKey: 'totalMaintPlan',      label: '総保守台数' },
  ];

  var kpiLines = KPI_DEFS.map(function(def) {
    var cur  = n(curEntry,  def.key);
    var prev = n(prevEntry, def.key);
    var plan = n(curEntry,  def.planKey);
    var rateStr = plan > 0 ? '（' + Math.round(cur / plan * 100) + '%）' : '';
    var diff    = cur - prev;
    var compStr = ' 前' + pKey + '比' + (diff >= 0 ? '+' : '') + diff;
    return '  - ' + def.label + ': 実績' + fmt(def.key, cur) + ' / 目標' + fmt(def.key, plan) + rateStr + compStr;
  }).join('\n');

  // ── 注力事項 ──
  var officeSettings   = getOfficeSettingsImpl();
  var officeFocusItems = (officeSettings.focusItems || '').trim();
  var officeFocusSection = officeFocusItems
    ? '\n【注力事項（管理者設定）】\n' + officeFocusItems + '\n'
    : '';

  // ── 遅れ指標（月次のみ）──
  var officeLagSection = '';
  if (type === 'monthly') {
    var ym2      = period || today.slice(0, 7);
    var bdStats2 = _getBusinessDayStats(ym2);
    var idealRate2   = bdStats2.total > 0 ? bdStats2.elapsed / bdStats2.total : 0;
    var remainDays2  = bdStats2.total - bdStats2.elapsed;
    var officeLagDefs = [
      { key: 'inspectionActual',     planKey: 'inspectionPlan',      label: '点検件数',   isMoney: false },
      { key: 'salesActual',          planKey: 'salesPlan',           label: '売上実績',   isMoney: true  },
      { key: 'renewalNextActualTop', planKey: 'renewalNextPlanTop',  label: '次月継続',   isMoney: false },
      { key: 'totalMaintActual',     planKey: 'totalMaintPlan',      label: '総保守台数', isMoney: false },
    ];
    var officeLagLines = officeLagDefs.filter(function(def) {
      var cur  = n(curEntry, def.key);
      var plan = n(curEntry, def.planKey);
      return plan > 0 && (cur / plan) < idealRate2 * 0.8;
    }).map(function(def) {
      var cur  = n(curEntry, def.key);
      var plan = n(curEntry, def.planKey);
      var remaining = plan - cur;
      var perDay    = remainDays2 > 0 ? Math.ceil(remaining / remainDays2) : remaining;
      var perDayStr = def.isMoney ? '¥' + perDay.toLocaleString() : perDay + '件';
      return '  - ' + def.label + ': 計画比' + Math.round(cur / plan * 100)
           + '%、残' + remainDays2 + '日で1日あたり' + perDayStr + '必要';
    }).join('\n');
    if (officeLagLines) officeLagSection = '\n【遅れ指標（数値根拠）】\n' + officeLagLines + '\n';
  }

  // ── 過去フィードバック ──
  var officeFeedbacks = getRecentFeedbackImpl('office', 3);
  var officeFbSection = '';
  if (officeFeedbacks.length) {
    officeFbSection = '\n【過去のフィードバック（直近' + officeFeedbacks.length + '件）】\n' +
      officeFeedbacks.map(function(f) {
        return '  ' + (f.score > 0 ? '👍' : '👎') + ' ' + f.reportType
             + '(' + f.reportPeriod + '): '
             + [f.goodComment, f.badComment].filter(Boolean).join(' / ');
      }).join('\n') + '\n';
  }

  var prompt =
    'あなたは優秀な営業マネージャーです。以下の' + tLabel + '営業所データを分析し、' +
    '必ず下記の形式のみで出力してください。形式以外の文言は不要です。\n\n' +
    '【対象期間】' + periodLabel + '\n\n' +
    '【KPI実績 vs ' + tLabel + '目標】\n' + kpiLines + '\n' +
    officeFocusSection + officeLagSection + officeFbSection +
    '\n【出力形式】\n' +
    '① 全体評価（2文以内）\n' +
    '② 強み（箇条書き2〜3点）\n' +
    '③ 課題（箇条書き2〜3点）\n' +
    (officeFocusItems ? '④ 注力事項の進捗コメント\n注力事項それぞれについて1〜2文で評価\n' : '') +
    '⑤ ネクストアクション\n' +
    (officeLagSection ? '・遅れ指標について：「残◯日で1日あたり◯件/◯円」形式で具体的に記載\n' : '') +
    (officeFocusItems ? '・注力事項を加速させる行動を1〜2点提案\n' : '') +
    '・その他改善に直結する行動提案';

  var content = _callGemini(prompt);

  saveOfficeReportImpl({
    type: type, period: periodLabel, scope: 'office',
    generatedAt: new Date().toISOString(), modelUsed: 'gemini',
    content: content, metrics: ''
  });

  return { success: true, content: content, period: periodLabel };
}

// ============================================================
// ユーザー設定・フィードバック
// ============================================================

function _ensureSheet(name, cols) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sheet;
}

function _getSettingsImpl(sheetName) {
  var sheet = _ensureSheet(sheetName, USER_SETTINGS_COLS);
  var last  = sheet.getLastRow();
  if (last < 2) return {};
  var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  var obj  = {};
  rows.forEach(function(r) { if (r[0]) obj[r[0]] = r[1]; });
  return obj;
}

function _saveSettingsImpl(sheetName, data) {
  var sheet = _ensureSheet(sheetName, USER_SETTINGS_COLS);
  var last  = sheet.getLastRow();
  var now   = new Date().toISOString();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === data.key) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[data.value, now]]);
        return { success: true };
      }
    }
  }
  sheet.appendRow([data.key, data.value, now]);
  return { success: true };
}

function getUserSettingsImpl()            { return _getSettingsImpl(SHEET_USER_SETTINGS); }
function saveUserSettingsImpl(data)       { return _saveSettingsImpl(SHEET_USER_SETTINGS, data); }
function getOfficeSettingsImpl()          { return _getSettingsImpl(SHEET_OFFICE_SETTINGS); }
function saveOfficeSettingsImpl(data)     { return _saveSettingsImpl(SHEET_OFFICE_SETTINGS, data); }

function saveFeedbackImpl(data) {
  var sheet = _ensureSheet(SHEET_AI_FEEDBACK, AI_FEEDBACK_COLS);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id, data.scope || '', data.reportType || '', data.reportPeriod || '',
    Number(data.score) || 0,
    data.goodComment || '', data.badComment || '',
    new Date().toISOString()
  ]);
  return { success: true, feedbackId: id };
}

function getRecentFeedbackImpl(scope, limit) {
  limit = limit || 3;
  var sheet = _ensureSheet(SHEET_AI_FEEDBACK, AI_FEEDBACK_COLS);
  var last  = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, AI_FEEDBACK_COLS.length).getValues();
  var filtered = rows.filter(function(r) { return r[1] === scope; });
  return filtered.slice(-limit).map(function(r) {
    return {
      feedbackId: r[0], scope: r[1], reportType: r[2], reportPeriod: r[3],
      score: Number(r[4]) || 0, goodComment: r[5], badComment: r[6], createdAt: r[7]
    };
  });
}

// 経過営業日数（土日除く）を返す
function _getBusinessDayStats(ym) {
  var todayStr = dateToYMD(new Date());
  var year     = parseInt(ym.slice(0, 4));
  var month    = parseInt(ym.slice(5, 7));
  var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  var elapsed = 0, total = 0;
  for (var d = 1; d <= daysInMonth; d++) {
    var dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      total++;
      var ds = ym + '-' + (d < 10 ? '0' : '') + d;
      if (ds <= todayStr) elapsed++;
    }
  }
  return { elapsed: elapsed, total: total };
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
  var dow = date.getUTCDay(); // UTC基準（UTC midnight で統一）
  if (dow === 0 || dow === 6) return true;
  var calId = 'ja.japanese.official#holiday@group.v.calendar.google.com';
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) return false;
  var start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  var end   = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return cal.getEvents(start, end).length > 0;
}

function isLastBusinessDayOfMonth() {
  // dateToYMD(new Date()) → JST日付文字列（タイムゾーン非依存）
  var today  = dateToYMD(new Date());
  var parts  = today.split('-');
  var year   = parseInt(parts[0]);
  var month  = parseInt(parts[1]);
  // Date.UTC で月末日を取得（ローカルタイムゾーン不使用）
  var lastDay = new Date(Date.UTC(year, month, 0));
  while (isHolidayOrWeekend(lastDay)) {
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
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

function gasGenerateOfficeReport(payload) {
  var d = {};
  if (typeof payload === 'string') {
    try { d = JSON.parse(payload); } catch(e) { d = { type: payload }; }
  } else { d = payload || {}; }
  return JSON.stringify(generateOfficeReportImpl(d));
}

function gasGetAllOfficeData() {
  return JSON.stringify(getOfficeDailyImpl({ scope: 'office' }));
}

// ============================================================
// 営業所管理機能（Step A1〜）
// ============================================================

// シート名定数
var SHEET_OFFICE_DAILY      = 'officeDaily';
var SHEET_OFFICE_SALES_PLAN = 'officeSalesPlan';
var SHEET_OFFICE_REPORTS    = 'officeReports';

// officeDaily 列順
var OFFICE_DAILY_COLS = [
  'date', 'scope', 'memberId', 'memberName',
  'activityDays', 'activityCount',
  'promotionCount', 'promotionAcase',
  'inspectionPlan', 'inspectionActual',
  'renewalNextPlanTop', 'renewalNextActualTop',
  'salesPlan', 'salesActual', 'salesAcase', 'salesForecast', 'vsPlan',
  'maintActual', 'maintNew', 'maintCont',
  'totalMaintPlan', 'totalMaintActual',
  'newMaintPlan', 'newMaintActual',
  'renewalThisPrev', 'renewalThisPlan', 'renewalThisActual',
  'nextMonthBacklog', 'nextMonthCase',
  'renewalNext2Plan', 'renewalNext2Actual', 'renewalNext2Rate',
  'renewalRate', 'shortfall',
  'source', 'importedAt', 'rawText'
];

// officeSalesPlan 列順
var OFFICE_SALES_PLAN_COLS = [
  'yearMonth', 'scope', 'memberId', 'memberName',
  'maintenancePlanUnits', 'maintenancePlanAmount',
  'inspectionPlanUnits', 'inspectionPlanAmount',
  'renewalTargetUnits', 'renewalPlanUnits', 'renewalPlanAmount',
  'newPlanUnits', 'newPlanAmount',
  'prepaidNew', 'prepaidCont',
  'callPlan', 'repairPlan', 'serPromoPlan',
  'totalSalesPlan', 'unitPrices', 'annualSalesPlan',
  'source', 'importedAt'
];

// officeReports 列順
var OFFICE_REPORTS_COLS = [
  'reportId', 'type', 'period', 'scope',
  'generatedAt', 'modelUsed', 'content', 'metrics'
];

// 設定・フィードバックシート定数
var SHEET_USER_SETTINGS   = 'userSettings';
var SHEET_OFFICE_SETTINGS = 'officeSettings';
var SHEET_AI_FEEDBACK     = 'aiFeedback';

var USER_SETTINGS_COLS   = ['key', 'value', 'updatedAt'];
var OFFICE_SETTINGS_COLS = ['key', 'value', 'updatedAt'];
var AI_FEEDBACK_COLS     = [
  'feedbackId', 'scope', 'reportType', 'reportPeriod',
  'score', 'goodComment', 'badComment', 'createdAt'
];

/**
 * 3つの営業所シートをなければ作成しヘッダーを設定する
 */
function _ensureOfficeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheetsToCreate = [
    { name: SHEET_OFFICE_DAILY,      cols: OFFICE_DAILY_COLS },
    { name: SHEET_OFFICE_SALES_PLAN, cols: OFFICE_SALES_PLAN_COLS },
    { name: SHEET_OFFICE_REPORTS,    cols: OFFICE_REPORTS_COLS },
    { name: SHEET_USER_SETTINGS,     cols: USER_SETTINGS_COLS },
    { name: SHEET_OFFICE_SETTINGS,   cols: OFFICE_SETTINGS_COLS },
    { name: SHEET_AI_FEEDBACK,       cols: AI_FEEDBACK_COLS }
  ];

  var created = [];
  sheetsToCreate.forEach(function(def) {
    if (!ss.getSheetByName(def.name)) {
      var sheet = ss.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.cols.length).setValues([def.cols]);
      // ヘッダー行を太字に
      sheet.getRange(1, 1, 1, def.cols.length).setFontWeight('bold');
      created.push(def.name);
    }
  });

  return { success: true, created: created };
}

// ──────────────────────────────────────────
// officeDaily 読み書き
// ──────────────────────────────────────────

/**
 * officeDaily を取得
 * @param {Object} params - { dateFrom, dateTo, scope }（すべて省略可 = 全件）
 */
function getOfficeDailyImpl(params) {
  params = params || {};
  // シートが存在しない場合は空配列を返す（初回利用時）
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_OFFICE_DAILY);
  if (!sheet) return [];

  var rows = sheetToObjects(sheet, OFFICE_DAILY_COLS);

  // Date型セルを "YYYY-MM-DD" に正規化してから比較
  if (params.dateFrom) {
    rows = rows.filter(function(r) { return dateToYMD(r.date) >= params.dateFrom; });
  }
  if (params.dateTo) {
    rows = rows.filter(function(r) { return dateToYMD(r.date) <= params.dateTo; });
  }
  if (params.scope) {
    rows = rows.filter(function(r) { return r.scope === params.scope; });
  }

  return rows.map(function(r) {
    var obj = {};
    OFFICE_DAILY_COLS.forEach(function(col) {
      // date フィールドは必ず "YYYY-MM-DD" 文字列で返す
      obj[col] = (col === 'date') ? (dateToYMD(r[col]) || '') : (r[col] !== undefined ? r[col] : '');
    });
    return obj;
  });
}

/**
 * officeDaily を保存（upsert: date+scope+memberId で一意）
 * @param {Object[]} entries
 */
function saveOfficeDailyImpl(entries) {
  if (!Array.isArray(entries)) entries = [entries];
  _ensureOfficeSheets();  // シートが存在しない場合は自動作成
  var sheet   = getSheet(SHEET_OFFICE_DAILY);
  var lastRow = sheet.getLastRow();
  var saved   = 0;

  entries.forEach(function(entry) {
    var date     = String(entry.date || '');
    var scope    = String(entry.scope || '');
    var memberId = String(entry.memberId || '');

    var newRow = OFFICE_DAILY_COLS.map(function(col) {
      var v = entry[col];
      return v !== undefined && v !== null ? v : '';
    });

    // 既存行を検索して上書き
    var matchRow = -1;
    if (lastRow >= 2) {
      var dateIdx     = OFFICE_DAILY_COLS.indexOf('date')     + 1;
      var scopeIdx    = OFFICE_DAILY_COLS.indexOf('scope')    + 1;
      var memberIdx   = OFFICE_DAILY_COLS.indexOf('memberId') + 1;
      var keyRange    = sheet.getRange(2, 1, lastRow - 1, OFFICE_DAILY_COLS.length).getValues();
      for (var i = 0; i < keyRange.length; i++) {
        if (dateToYMD(keyRange[i][dateIdx - 1]) === dateToYMD(date) &&
            String(keyRange[i][scopeIdx - 1])  === scope &&
            String(keyRange[i][memberIdx - 1]) === memberId) {
          matchRow = i + 2;
          break;
        }
      }
    }

    if (matchRow > 0) {
      sheet.getRange(matchRow, 1, 1, newRow.length).setValues([newRow]);
    } else {
      sheet.appendRow(newRow);
      lastRow++;
    }
    saved++;
  });

  return { success: true, saved: saved };
}

/**
 * officeDaily の指定行を削除
 * @param {Object} params - { date, scope, memberId }
 */
function deleteOfficeDailyImpl(params) {
  params = params || {};
  var sheet   = getSheet(SHEET_OFFICE_DAILY);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, message: '該当データなし' };

  var dateIdx   = OFFICE_DAILY_COLS.indexOf('date')     + 1;
  var scopeIdx  = OFFICE_DAILY_COLS.indexOf('scope')    + 1;
  var memberIdx = OFFICE_DAILY_COLS.indexOf('memberId') + 1;
  var data      = sheet.getRange(2, 1, lastRow - 1, OFFICE_DAILY_COLS.length).getValues();
  var rowsToDelete = [];

  for (var i = 0; i < data.length; i++) {
    var match = true;
    if (params.date     && String(data[i][dateIdx - 1])   !== String(params.date))     match = false;
    if (params.scope    && String(data[i][scopeIdx - 1])  !== String(params.scope))    match = false;
    if (params.memberId && String(data[i][memberIdx - 1]) !== String(params.memberId)) match = false;
    if (match) rowsToDelete.push(i + 2);
  }

  rowsToDelete.sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(r) { sheet.deleteRow(r); });

  return { success: true, deleted: rowsToDelete.length };
}

// ──────────────────────────────────────────
// officeSalesPlan 読み書き
// ──────────────────────────────────────────

/**
 * officeSalesPlan を取得
 * @param {string} yearMonth - "YYYY-MM"（省略で全件）
 */
function getOfficeSalesPlanImpl(yearMonth) {
  var sheet = getSheet(SHEET_OFFICE_SALES_PLAN);
  var rows  = sheetToObjects(sheet, OFFICE_SALES_PLAN_COLS);

  if (yearMonth) {
    rows = rows.filter(function(r) { return String(r.yearMonth).slice(0, 7) === yearMonth; });
  }

  return rows.map(function(r) {
    var obj = {};
    OFFICE_SALES_PLAN_COLS.forEach(function(col) {
      obj[col] = r[col] !== undefined ? r[col] : '';
    });
    return obj;
  });
}

/**
 * officeSalesPlan を保存（upsert: yearMonth+scope+memberId で一意）
 * @param {Object[]} entries
 */
function saveOfficeSalesPlanImpl(entries) {
  if (!Array.isArray(entries)) entries = [entries];
  var sheet   = getSheet(SHEET_OFFICE_SALES_PLAN);
  var lastRow = sheet.getLastRow();
  var saved   = 0;

  entries.forEach(function(entry) {
    var ym       = String(entry.yearMonth || '');
    var scope    = String(entry.scope || '');
    var memberId = String(entry.memberId || '');

    var newRow = OFFICE_SALES_PLAN_COLS.map(function(col) {
      var v = entry[col];
      return v !== undefined && v !== null ? v : '';
    });

    var matchRow = -1;
    if (lastRow >= 2) {
      var ymIdx     = OFFICE_SALES_PLAN_COLS.indexOf('yearMonth') + 1;
      var scopeIdx  = OFFICE_SALES_PLAN_COLS.indexOf('scope')     + 1;
      var memberIdx = OFFICE_SALES_PLAN_COLS.indexOf('memberId')  + 1;
      var keyRange  = sheet.getRange(2, 1, lastRow - 1, OFFICE_SALES_PLAN_COLS.length).getValues();
      for (var i = 0; i < keyRange.length; i++) {
        if (dateToYMD(keyRange[i][ymIdx - 1]).slice(0, 7) === ym &&
            String(keyRange[i][scopeIdx - 1])          === scope &&
            String(keyRange[i][memberIdx - 1])         === memberId) {
          matchRow = i + 2;
          break;
        }
      }
    }

    if (matchRow > 0) {
      sheet.getRange(matchRow, 1, 1, newRow.length).setValues([newRow]);
    } else {
      sheet.appendRow(newRow);
      lastRow++;
    }
    saved++;
  });

  return { success: true, saved: saved };
}

// ──────────────────────────────────────────
// officeReports 読み書き
// ──────────────────────────────────────────

/**
 * officeReports を取得
 * @param {Object} params - { type, period, scope }（省略可）
 */
function getOfficeReportsImpl(params) {
  params = params || {};
  var sheet = getSheet(SHEET_OFFICE_REPORTS);
  var rows  = sheetToObjects(sheet, OFFICE_REPORTS_COLS);

  if (params.type)   rows = rows.filter(function(r) { return r.type   === params.type;   });
  if (params.period) rows = rows.filter(function(r) { return r.period === params.period; });
  if (params.scope)  rows = rows.filter(function(r) { return r.scope  === params.scope;  });

  return rows.map(function(r) {
    var obj = {};
    OFFICE_REPORTS_COLS.forEach(function(col) {
      obj[col] = r[col] !== undefined ? r[col] : '';
    });
    return obj;
  });
}

/**
 * officeReports にレポートを追記
 * @param {Object} report
 */
function saveOfficeReportImpl(report) {
  var sheet  = getSheet(SHEET_OFFICE_REPORTS);
  var row    = OFFICE_REPORTS_COLS.map(function(col) {
    if (col === 'reportId' && !report[col]) return Utilities.getUuid();
    var v = report[col];
    return v !== undefined && v !== null ? v : '';
  });
  sheet.appendRow(row);
  return { success: true, reportId: row[0] };
}

// ──────────────────────────────────────────
// gas* 公開ラッパー（google.script.run 用）
// ──────────────────────────────────────────

function gasSetupOfficeSheets() {
  return JSON.stringify(_ensureOfficeSheets());
}

function gasGetOfficeDaily(paramsJson) {
  var params = paramsJson ? (typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson) : {};
  return JSON.stringify(getOfficeDailyImpl(params));
}

function gasSaveOfficeDaily(entriesJson) {
  var entries = typeof entriesJson === 'string' ? JSON.parse(entriesJson) : entriesJson;
  return JSON.stringify(saveOfficeDailyImpl(entries));
}

function gasDeleteOfficeDaily(paramsJson) {
  var params = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson;
  return JSON.stringify(deleteOfficeDailyImpl(params));
}

function gasGetOfficeSalesPlan(yearMonth) {
  return JSON.stringify(getOfficeSalesPlanImpl(yearMonth || ''));
}

function gasSaveOfficeSalesPlan(entriesJson) {
  var entries = typeof entriesJson === 'string' ? JSON.parse(entriesJson) : entriesJson;
  return JSON.stringify(saveOfficeSalesPlanImpl(entries));
}

function gasGetOfficeReports(paramsJson) {
  var params = paramsJson ? (typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson) : {};
  return JSON.stringify(getOfficeReportsImpl(params));
}

function gasSaveOfficeReport(reportJson) {
  var report = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
  return JSON.stringify(saveOfficeReportImpl(report));
}

function gasSetupAiTriggers() {
  setupAiTriggers();
  return JSON.stringify({ success: true });
}

function gasGetUserSettings() {
  return JSON.stringify(getUserSettingsImpl());
}
function gasSaveUserSettings(dataJson) {
  var d = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson;
  return JSON.stringify(saveUserSettingsImpl(d));
}
function gasGetOfficeSettings() {
  return JSON.stringify(getOfficeSettingsImpl());
}
function gasSaveOfficeSettings(dataJson) {
  var d = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson;
  return JSON.stringify(saveOfficeSettingsImpl(d));
}
function gasSaveFeedback(dataJson) {
  var d = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson;
  return JSON.stringify(saveFeedbackImpl(d));
}

// ============================================================
// メール通知機能
// ============================================================

function sendEmailNotification(subject, body) {
  var email = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!email) { Logger.log('NOTIFY_EMAIL が未設定です'); return; }
  GmailApp.sendEmail(email, subject, body);
}

// 日曜または祝日のみスキップ（土曜は出勤があるため通知する）
function isSundayOrHoliday(dateStr) {
  var d = new Date(Date.UTC(
    Number(dateStr.slice(0,4)),
    Number(dateStr.slice(5,7)) - 1,
    Number(dateStr.slice(8,10))
  ) + 9 * 3600000);
  if (d.getUTCDay() === 0) return true;
  try {
    var cal = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
    return cal.getEventsForDay(new Date(Date.UTC(
      Number(dateStr.slice(0,4)),
      Number(dateStr.slice(5,7)) - 1,
      Number(dateStr.slice(8,10))
    ))).length > 0;
  } catch(e) { return false; }
}

function checkDailyEntryAndNotify() {
  var today = dateToYMD(new Date());
  if (isSundayOrHoliday(today)) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ENTRIES);
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  var hasEntry = rows.slice(1).some(function(r) { return dateToYMD(r[0]) === today; });
  if (!hasEntry) {
    sendEmailNotification(
      '📋 日報未記入のお知らせ',
      '本日（' + today + '）の日報が未記入です。\n記録をお忘れなく。'
    );
  }
}

// GASエディタから1回だけ実行してトリガー登録
function setupEmailNotifyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkDailyEntryAndNotify') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkDailyEntryAndNotify')
    .timeBased().everyDays(1).atHour(18).nearMinute(30).create();
  Logger.log('メール通知トリガー登録完了（毎日18:30）');
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
