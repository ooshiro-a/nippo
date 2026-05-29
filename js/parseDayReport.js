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
