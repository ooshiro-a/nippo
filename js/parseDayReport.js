/**
 * parseDayReport(workbook, dateStr)
 * SheetJS ワークブックから日計表「一枚目」シートを読み取り、
 * officeDaily 保存用の正規化オブジェクトを返す。
 *
 * @param  {Object} workbook  XLSX.read() の戻り値
 * @param  {string} dateStr   "YYYY-MM-DD"
 * @returns {{ date, office, members, source, importedAt }}
 */
function parseDayReport(workbook, dateStr) {
  var sheetName = DAYREPORT_MAP.sheetName;
  var ws = workbook.Sheets[sheetName];
  // 末尾スペースなしでもフォールバック
  if (!ws) ws = workbook.Sheets[sheetName.trim()];
  if (!ws) {
    throw new Error(
      'シート「' + sheetName + '」が見つかりません。' +
      '利用可能なシート: ' + workbook.SheetNames.join(', ')
    );
  }

  // 数値取得（col + row のセル、例: _n("B", 17)）
  function _n(col, row) {
    var cell = ws[col + row];
    if (!cell) return 0;
    if (typeof cell.v === 'number') return cell.v;
    var p = parseFloat(String(cell.v).replace(/[,%]/g, ''));
    return isNaN(p) ? 0 : p;
  }

  // セルアドレス直指定の数値取得（例: _nAddr("AE37")）
  function _nAddr(addr) {
    var cell = ws[addr];
    if (!cell) return 0;
    if (typeof cell.v === 'number') return cell.v;
    var p = parseFloat(String(cell.v).replace(/[,%]/g, ''));
    return isNaN(p) ? 0 : p;
  }

  // セルアドレス直指定の文字列取得
  function _sAddr(addr) {
    var cell = ws[addr];
    return cell ? String(cell.v).trim() : '';
  }

  var colsTop   = DAYREPORT_MAP.cols.top;
  var colsSales = DAYREPORT_MAP.cols.sales;

  function extractRow(topRow, salesRow) {
    var obj = {};
    Object.keys(colsTop).forEach(function(k) {
      obj[k] = _n(colsTop[k], topRow);
    });
    Object.keys(colsSales).forEach(function(k) {
      obj[k] = _n(colsSales[k], salesRow);
    });
    // J列が空の場合は実績＋A案件で算出
    if (!obj.salesForecast) {
      obj.salesForecast = obj.salesActual + obj.salesAcase;
    }
    return obj;
  }

  var r = DAYREPORT_MAP.rows;

  // 営業所合計
  var office = extractRow(r.office.top, r.office.sales);
  office.renewalRate = _nAddr(DAYREPORT_MAP.singletons.renewalRate);

  // 所員別 a〜e
  var members = r.members.map(function(m) {
    var obj       = extractRow(m.top, m.sales);
    obj.memberId   = m.id;
    obj.memberName = _sAddr(m.nameCell);
    obj.shortfall  = _nAddr(m.shortfallCell);
    return obj;
  });

  return {
    date:       dateStr,
    office:     office,
    members:    members,
    source:     'dayReport',
    importedAt: new Date().toISOString()
  };
}

/**
 * parseSalesPlan(workbook)
 * SheetJS ワークブックから売上計画シートを読み取り、
 * officeSalesPlan 保存用の正規化オブジェクトを返す。
 *
 * @param  {Object} workbook  XLSX.read() の戻り値
 * @returns {{ yearMonth, office, members, source, importedAt }}
 */
function parseSalesPlan(workbook) {
  var sheetName = SALESPLAN_MAP.sheetName;
  var ws = workbook.Sheets[sheetName];
  if (!ws) ws = workbook.Sheets[sheetName.trim()];
  if (!ws) {
    throw new Error(
      'シート「' + sheetName + '」が見つかりません。' +
      '利用可能なシート: ' + workbook.SheetNames.join(', ')
    );
  }

  function _n(col, row) {
    var cell = ws[col + row];
    if (!cell) return 0;
    if (typeof cell.v === 'number') return cell.v;
    var p = parseFloat(String(cell.v).replace(/[,%]/g, ''));
    return isNaN(p) ? 0 : p;
  }

  function _nAddr(addr) {
    var cell = ws[addr];
    if (!cell) return 0;
    if (typeof cell.v === 'number') return cell.v;
    var p = parseFloat(String(cell.v).replace(/[,%]/g, ''));
    return isNaN(p) ? 0 : p;
  }

  // セルが空かどうか（0との区別のため、値の有無そのものを見る）
  function _cellEmpty(col, row) {
    var cell = ws[col + row];
    return !cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === '';
  }

  var year  = Math.round(_nAddr(SALESPLAN_MAP.singletons.yearMonth_year));
  var month = Math.round(_nAddr(SALESPLAN_MAP.singletons.yearMonth_month));
  var yearMonth = (year > 2000 && month >= 1 && month <= 12)
    ? String(year) + '-' + String(month).padStart(2, '0')
    : getCurrentYearMonthJST();

  var cP = SALESPLAN_MAP.cols.personal;
  var cD = SALESPLAN_MAP.cols.paid;
  var cO = SALESPLAN_MAP.cols.other;

  function extractRow(pRow, dRow, oRow) {
    var obj = {};
    Object.keys(cP).forEach(function(k) { obj[k] = _n(cP[k], pRow); });
    Object.keys(cD).forEach(function(k) { obj[k] = _n(cD[k], dRow); });
    Object.keys(cO).forEach(function(k) { obj[k] = _n(cO[k], oRow); });
    obj.maintenancePlanUnits  = obj.renewalPlanUnits  + obj.newPlanUnits;
    obj.maintenancePlanAmount = obj.renewalPlanAmount + obj.newPlanAmount;
    obj.callPlan     = obj.callOwnAmount   + obj.callOtherAmount;
    obj.repairPlan   = obj.repairSerAmount;
    obj.serPromoPlan = obj.serPromoAmount;
    obj.prepaidNew   = obj.prepaidNewAmount;
    obj.prepaidCont  = obj.prepaidContAmount;
    delete obj.callOwnAmount; delete obj.callOtherAmount;
    delete obj.repairSerAmount; delete obj.serPromoAmount;
    delete obj.prepaidNewAmount; delete obj.prepaidContAmount;
    return obj;
  }

  var r = SALESPLAN_MAP.rows;

  var officeData = extractRow(r.office.personal, r.office.paid, r.office.other);
  officeData.annualSalesPlan = _nAddr(SALESPLAN_MAP.singletons.annualSalesPlan);

  var members = r.members.map(function(m) {
    var obj = extractRow(m.personal, m.paid, m.other);
    obj.memberId   = m.id;
    obj.memberName = '';
    return obj;
  });

  // KGIタブ9項目のうち、取込元セルが空だった項目を検出（inspectionPlanAmountは元々対応セルが無いため対象外）
  var missingFields = [];
  var pRow = r.office.personal, oRow = r.office.other;
  var renewalUnitsEmpty  = _cellEmpty(cP.renewalPlanUnits,  pRow);
  var renewalAmountEmpty = _cellEmpty(cP.renewalPlanAmount, pRow);
  var newUnitsEmpty      = _cellEmpty(cP.newPlanUnits,      pRow);
  var newAmountEmpty     = _cellEmpty(cP.newPlanAmount,     pRow);
  if (_cellEmpty(cP.inspectionPlanUnits, pRow)) missingFields.push('inspectionPlanUnits');
  if (renewalUnitsEmpty)  missingFields.push('renewalPlanUnits');
  if (renewalAmountEmpty) missingFields.push('renewalPlanAmount');
  if (newUnitsEmpty)      missingFields.push('newPlanUnits');
  if (newAmountEmpty)     missingFields.push('newPlanAmount');
  if (_cellEmpty(cO.totalSalesPlan, oRow)) missingFields.push('totalSalesPlan');
  if (renewalUnitsEmpty  && newUnitsEmpty)  missingFields.push('maintenancePlanUnits');
  if (renewalAmountEmpty && newAmountEmpty) missingFields.push('maintenancePlanAmount');

  return {
    yearMonth:     yearMonth,
    office:        officeData,
    members:       members,
    missingFields: missingFields,
    source:        'salesPlan',
    importedAt:    new Date().toISOString()
  };
}
