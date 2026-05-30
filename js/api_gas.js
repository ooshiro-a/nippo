/**
 * api_gas.js - Google Apps Script 経由の API 通信
 * Nice Serviceman 日報（GAS 配信版）
 *
 * fetch(APPS_SCRIPT_URL) の代替。google.script.run を使い、
 * 既存の api.js と同一の関数シグネチャを提供する。
 * app.js は一切変更しない。
 */

// ============================================================
// 内部ユーティリティ
// ============================================================

function _callGas(funcName, payload) {
  return new Promise(function(resolve, reject) {
    var runner = google.script.run
      .withSuccessHandler(function(result) {
        try {
          resolve(typeof result === 'string' ? JSON.parse(result) : result);
        } catch (e) {
          resolve(result);
        }
      })
      .withFailureHandler(function(err) {
        reject(new Error(err.message || String(err)));
      });

    if (payload !== undefined) {
      runner[funcName](payload);
    } else {
      runner[funcName]();
    }
  });
}

// ============================================================
// エントリ（日次記録）
// ============================================================

async function getEntries(yearMonth) {
  return _callGas('gasGetEntries', yearMonth || '');
}

async function saveEntry(data) {
  return _callGas('gasSaveEntry', data);
}

// ============================================================
// 予算（KGI設定）
// ============================================================

async function getBudget(yearMonth) {
  return _callGas('gasGetBudget', yearMonth);
}

async function saveBudget(data) {
  return _callGas('gasSaveBudget', data);
}

// ============================================================
// エクスポート（全データ）
// ============================================================

async function getAllData() {
  return _callGas('gasGetAllData');
}

async function deleteEntry(date) {
  return _callGas('gasDeleteEntry', date);
}

// ============================================================
// AI レポート
// ============================================================

async function generateReport(type) {
  return _callGas('gasGenerateReport', type);
}

async function getLatestReport(type) {
  return _callGas('gasGetLatestReport', type);
}

// ============================================================
// 営業所管理機能（Step A1〜）
// ============================================================

async function setupOfficeSheets() {
  return _callGas('gasSetupOfficeSheets');
}

async function getOfficeDaily(params) {
  return _callGas('gasGetOfficeDaily', params ? JSON.stringify(params) : '{}');
}

async function saveOfficeDaily(entries) {
  return _callGas('gasSaveOfficeDaily', JSON.stringify(entries));
}

async function deleteOfficeDaily(params) {
  return _callGas('gasDeleteOfficeDaily', JSON.stringify(params));
}

async function getOfficeSalesPlan(yearMonth) {
  return _callGas('gasGetOfficeSalesPlan', yearMonth || '');
}

async function saveOfficeSalesPlan(entries) {
  return _callGas('gasSaveOfficeSalesPlan', JSON.stringify(entries));
}

async function getOfficeReports(params) {
  return _callGas('gasGetOfficeReports', params ? JSON.stringify(params) : '{}');
}

async function saveOfficeReport(report) {
  return _callGas('gasSaveOfficeReport', JSON.stringify(report));
}

async function generateOfficeReport(type) {
  return _callGas('gasGenerateOfficeReport', type);
}

async function getAllOfficeData() {
  return _callGas('gasGetAllOfficeData');
}

async function getUserSettings() {
  return _callGas('gasGetUserSettings');
}
async function saveUserSettings(data) {
  return _callGas('gasSaveUserSettings', JSON.stringify(data));
}
async function getOfficeSettings() {
  return _callGas('gasGetOfficeSettings');
}
async function saveOfficeSettings(data) {
  return _callGas('gasSaveOfficeSettings', JSON.stringify(data));
}
async function saveFeedback(data) {
  return _callGas('gasSaveFeedback', JSON.stringify(data));
}
