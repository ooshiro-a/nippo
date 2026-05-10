/**
 * Code.gs - Nice Serviceman 日報 Apps Script API
 *
 * デプロイ設定:
 *   「次のユーザーとして実行」→「自分」
 *   「アクセスできるユーザー」→「全員」
 *
 * エンドポイント:
 *   GET  ?action=getEntries[&yearMonth=YYYY-MM]
 *   GET  ?action=getBudget&yearMonth=YYYY-MM
 *   GET  ?action=getAllData
 *   POST { action: 'saveEntry',    data: {...} }
 *   POST { action: 'saveBudget',   data: {...} }
 *   POST { action: 'deleteEntry',  data: { date: 'YYYY-MM-DD' } }
 *   POST { action: 'migrateToV1' }  ← 1回だけ手動実行してDB移行
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
  try {
    var action = e.parameter.action || '';
    var result;

    if (action === 'getEntries') {
      var yearMonth = e.parameter.yearMonth || '';
      result = getEntries(yearMonth);

    } else if (action === 'getBudget') {
      var yearMonth = e.parameter.yearMonth || '';
      result = getBudget(yearMonth);

    } else if (action === 'getAllData') {
      result = getAllData();

    } else {
      result = { status: 'ok', message: 'Nice Serviceman 日報 API', timestamp: new Date().toISOString() };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var data   = body.data   || {};
    var result;

    if (action === 'saveEntry') {
      result = saveEntry(data);

    } else if (action === 'saveBudget') {
      result = saveBudget(data);

    } else if (action === 'deleteEntry') {
      result = deleteEntry(data.date);

    } else if (action === 'migrateToV1') {
      result = migrateToV1();

    } else if (action === 'cleanupDuplicates') {
      result = cleanupDuplicateEntries();

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
function getEntries(yearMonth) {
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
function saveEntry(data) {
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
function deleteEntry(date) {
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

function getBudget(yearMonth) {
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

function saveBudget(data) {
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

function getAllData() {
  var entries = getEntries('');
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
