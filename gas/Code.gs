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
 *   POST { action: 'saveEntry',  data: {...} }
 *   POST { action: 'saveBudget', data: {...} }
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

// entries シートの列順（A列から順に）
var ENTRIES_COLS = [
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
      // URLを直接開いたときの疎通確認用
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

    } else {
      result = { error: '不明なアクション: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// エントリ（日次記録）
// ============================================================

/**
 * エントリ一覧を取得
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

  // 数値変換・型変換
  rows = rows.map(function(row) {
    return normalizeEntry(row);
  });

  return rows;
}

/**
 * エントリを保存（date でupsert）
 * @param {Object} data
 */
function saveEntry(data) {
  var sheet = getSheet(SHEET_ENTRIES);
  var date  = String(data.date || '');
  if (!date) throw new Error('date が指定されていません');

  var rowIndex = findRowByKey(sheet, 0, date); // A列(index=0)でdate検索

  var row = ENTRIES_COLS.map(function(col) {
    var val = data[snakeToCamel(col)];
    if (val === undefined) val = data[col]; // snake_case でも受け付ける

    // relationship_actions は配列 → カンマ区切り文字列に変換
    if (col === 'relationship_actions' && Array.isArray(val)) {
      val = val.join(',');
    }
    // notes_important は boolean → TRUE/FALSE 文字列
    if (col === 'notes_important') {
      val = val ? 'TRUE' : 'FALSE';
    }
    return val !== undefined && val !== null ? val : '';
  });

  if (rowIndex > 0) {
    // 既存行を更新
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    // 新規行を追加
    sheet.appendRow(row);
  }

  return { success: true, date: date };
}

// ============================================================
// 予算（KGI設定）
// ============================================================

/**
 * 指定月の予算を取得
 * @param {string} yearMonth - "YYYY-MM"
 * @returns {Object|null}
 */
function getBudget(yearMonth) {
  if (!yearMonth) throw new Error('yearMonth が指定されていません');

  var sheet    = getSheet(SHEET_BUDGET);
  var rows     = sheetToObjects(sheet, BUDGET_COLS);
  var filtered = rows.filter(function(row) {
    return String(row.year_month).trim() === yearMonth;
  });

  if (filtered.length === 0) return null;

  // 重複行がある場合は最後の行を使う
  var row = filtered[filtered.length - 1];
  return normalizeBudget(row);
}

/**
 * 予算を保存（year_month でupsert）
 * @param {Object} data
 */
function saveBudget(data) {
  var sheet     = getSheet(SHEET_BUDGET);
  var yearMonth = String(data.yearMonth || data.year_month || '');
  if (!yearMonth) throw new Error('yearMonth が指定されていません');

  var row = BUDGET_COLS.map(function(col) {
    var val = data[snakeToCamel(col)];
    if (val === undefined) val = data[col];
    return val !== undefined && val !== null ? val : '';
  });

  // 重複行を後ろから削除し、最初の1行だけ残してupsert
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var col = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var matchRows = [];
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]).trim() === yearMonth) matchRows.push(i + 2);
    }
    // 後ろから削除（行番号がずれないよう降順）
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

/** シートを取得（なければエラー） */
function getSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('シート「' + name + '」が見つかりません');
  return sheet;
}

/**
 * シートの全行をオブジェクト配列に変換（1行目=ヘッダーとして使わず、cols定数を使用）
 * データが空のシートは [] を返す
 */
function sheetToObjects(sheet, cols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // 1行目=ヘッダー行のみ or 空

  var data    = sheet.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var results = [];

  data.forEach(function(row) {
    // 全列が空の行はスキップ
    if (row.every(function(cell) { return cell === '' || cell === null; })) return;

    var obj = {};
    cols.forEach(function(col, i) {
      obj[col] = row[i];
    });
    results.push(obj);
  });

  return results;
}

/**
 * 指定列で値を検索し、見つかった行番号を返す（1始まり）
 * 見つからなければ -1
 */
function findRowByKey(sheet, colIndex, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var col  = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(value)) {
      return i + 2; // 1行目=ヘッダーなので +2
    }
  }
  return -1;
}

/** Date型またはISO文字列を "YYYY-MM-DD" に変換（JST基準） */
function dateToYMD(d) {
  if (!d) return '';
  if (d instanceof Date) {
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }
  var s = String(d).trim();
  // ハイフンなし形式 "20260508" → "2026-05-08"
  if (/^\d{8}$/.test(s)) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  return s.slice(0, 10);
}

/** snake_case → camelCase */
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
}

/** JSONレスポンスを生成 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** エントリ行を正規化（型変換・camelCase化） */
function normalizeEntry(row) {
  return {
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

/** 予算行を正規化（型変換・camelCase化） */
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
