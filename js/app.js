/**
 * app.js - メインロジック・タブ切り替え
 * Nice Serviceman 日報
 */

// エラー文字列を安全に表示する（XSS対策: innerHTML に直接文字列を渡さない）
function _renderError(el, msg) {
  const div = document.createElement('div');
  div.style.cssText = 'color:var(--accent-red);font-size:13px';
  div.textContent = msg;
  el.innerHTML = '';
  el.appendChild(div);
}

// HTML特殊文字をエスケープする（XSS対策: ユーザー入力・AI生成テキストをHTMLに埋め込む前に必ず通す）
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------------
// ナビゲーション（2段: メインセクション + サブタブ）
// ------------------------------------------------------------------

var _activeSection   = 'personal';
var _lastPersonalTab = 'tab-input';
var _lastOfficeTab   = 'tab-office-import';

function initNavigation() {
  document.querySelectorAll('.main-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchSection(btn.dataset.section);
    });
  });

  document.querySelectorAll('#sub-nav-personal .sub-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchSubTab('personal', btn.dataset.tab);
    });
  });

  document.querySelectorAll('#sub-nav-office .sub-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      switchSubTab('office', btn.dataset.tab);
    });
  });
}

function switchSection(section) {
  _activeSection = section;

  document.querySelectorAll('.main-nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.section === section);
  });

  var snPersonal = document.getElementById('sub-nav-personal');
  var snOffice   = document.getElementById('sub-nav-office');
  if (snPersonal) snPersonal.style.display = (section === 'personal') ? 'grid' : 'none';
  if (snOffice)   snOffice.style.display   = (section === 'office')   ? 'grid' : 'none';

  document.getElementById('section-personal').classList.toggle('active', section === 'personal');
  document.getElementById('section-office').classList.toggle('active',   section === 'office');

  var lastTab = (section === 'personal') ? _lastPersonalTab : _lastOfficeTab;
  _activateSubTab(section, lastTab);

  if (section === 'office' && lastTab === 'tab-office-dashboard') refreshManagement();
  if (section === 'office' && lastTab === 'tab-office-history')   refreshOfficeHistory();
  if (section === 'office' && lastTab === 'tab-office-kgi')       loadOfficeKgi();

  document.getElementById('content').scrollTop = 0;
}

function switchSubTab(section, tabId) {
  _activateSubTab(section, tabId);

  if (section === 'personal') _lastPersonalTab = tabId;
  else                        _lastOfficeTab   = tabId;

  if (tabId === 'tab-office-dashboard') refreshManagement();
  if (tabId === 'tab-office-history')   refreshOfficeHistory();
  if (tabId === 'tab-office-kgi')       loadOfficeKgi();
  if (tabId === 'tab-office-import')    _ensureXlsx();

  document.getElementById('content').scrollTop = 0;
}

function _activateSubTab(section, tabId) {
  var navId = (section === 'personal') ? 'sub-nav-personal' : 'sub-nav-office';
  document.querySelectorAll('#' + navId + ' .sub-nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  var sectionEl = document.getElementById('section-' + section);
  if (sectionEl) {
    sectionEl.querySelectorAll('.tab-pane').forEach(function(p) {
      p.classList.toggle('active', p.id === tabId);
    });
  }
}

// ------------------------------------------------------------------
// ヘッダー日付表示
// ------------------------------------------------------------------

function updateHeaderDate() {
  const el = document.getElementById('header-date');
  if (!el) return;
  el.textContent = formatDate(getTodayJST());
}

// ------------------------------------------------------------------
// 日次入力タブ
// ------------------------------------------------------------------

const RELATIONSHIP_ACTIONS = [
  '挨拶', '雑談', '提案', 'お礼', '訪問',
  '電話', 'メール', 'フォロー', '紹介依頼', 'クレーム対応',
];

// 日付ごとの前回ロード時の累計値（差分計算用）
const daySnapshot = {};

// 入力タブ: ロード時のフォーム値スナップショット（未保存変更の検知用）
let _inputFormBaseline = null;

function collectInputFormValues() {
  const data = {};
  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    data[field.key] = el ? parseNumericInput(el.value) : 0;
  });
  FORECAST_FIELDS.forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    data[field.key] = el ? parseNumericInput(el.value) : 0;
  });
  data.relationshipActions = Array.from(document.querySelectorAll('#relationship-tags .tag-btn.selected'))
    .map(b => b.textContent).sort().join(',');
  data.positiveFeedback = document.getElementById('positive-count').textContent;
  data.negativeFeedback = document.getElementById('negative-count').textContent;
  data.memorableVisit = document.getElementById('entry-memorable-visit').value;
  data.notes = document.getElementById('entry-notes').value;
  data.notesImportant = document.getElementById('entry-notes-important').checked;
  data.insight = document.getElementById('entry-insight').value;
  data.nextAction = document.getElementById('entry-next-action').value;
  return data;
}

function captureInputFormBaseline() {
  _inputFormBaseline = collectInputFormValues();
}

function hasUnsavedInputChanges() {
  if (!_inputFormBaseline) return false;
  const current = collectInputFormValues();
  return Object.keys(current).some(key => String(current[key]) !== String(_inputFormBaseline[key]));
}

function initInputTab() {
  document.getElementById('entry-date').value = getTodayJST();
  buildInputKpiFields();
  buildRelationshipTags();
  initCounterBtns();

  document.getElementById('entry-notes-important').addEventListener('change', updateNotesImportant);
  document.getElementById('entry-date').addEventListener('change', e => loadEntry(e.target.value));
  document.getElementById('entry-save-btn').addEventListener('click', handleSaveEntry);

  loadEntry(getTodayJST());
}

/**
 * KPI入力欄のHTMLを組み立てる。
 * 金額フィールド(money)はカンマ区切りを表示するため text 入力にする。
 * type="number" はカンマを含む値を保持できず、value が空文字になってしまう。
 * 件数フィールドは type="number" のまま（マイナス入力とスピナーを維持するため）。
 * @param {Object} field - KGI_FIELDS / FORECAST_FIELDS の要素
 * @param {string} idPrefix - 'entry-' | 'kgi-'
 * @param {string} [extraAttr] - 追加属性
 */
function buildKpiInputHtml(field, idPrefix, extraAttr) {
  const id = idPrefix + field.key;
  if (field.money) {
    return `<input type="text" inputmode="numeric" class="kgi-field-input is-money" id="${id}" value="0" />`;
  }
  return `<input type="number" class="kgi-field-input" id="${id}" value="0" ${extraAttr || ''} />`;
}

/**
 * KPI入力欄にフォーカス/ブラー挙動を付ける。
 * 金額欄は focus でカンマを外して素の数値にし、blur でカンマを付け直す。
 * @param {Element} container
 */
function bindKpiInputs(container) {
  container.querySelectorAll('.kgi-field-input').forEach(input => {
    const isMoney = input.classList.contains('is-money');
    input.addEventListener('focus', () => {
      if (isMoney) input.value = String(parseNumericInput(input.value));
      input.select();
    });
    if (isMoney) {
      input.addEventListener('blur', () => {
        input.value = formatNumber(parseNumericInput(input.value));
      });
    }
  });
}

/**
 * KPI入力欄に値をセットする（金額欄はカンマ区切りに整形）
 * @param {HTMLInputElement|null} el
 * @param {Object} field
 * @param {number} value
 */
function setKpiInputValue(el, field, value) {
  if (!el) return;
  el.value = field.money ? formatNumber(value) : value;
}

function buildInputKpiFields() {
  const container = document.getElementById('entry-kpi-container');
  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    const row = document.createElement('div');
    row.className = 'kgi-field-row';
    row.innerHTML = `
      <span class="kgi-field-label">${field.label}</span>
      <div class="kgi-field-input-wrap">
        ${buildKpiInputHtml(field, 'entry-')}
        <span class="kgi-field-unit">${field.unit}</span>
      </div>
    `;
    container.appendChild(row);
  });
  bindKpiInputs(container);

  // 末見額カードを KPI実績カードの直後に追加
  const forecastCard = document.createElement('div');
  forecastCard.className = 'card';
  forecastCard.innerHTML = '<div class="card-title">末見額</div><div id="entry-forecast-container"></div>';
  container.closest('.card').insertAdjacentElement('afterend', forecastCard);

  const forecastContainer = document.getElementById('entry-forecast-container');
  FORECAST_FIELDS.forEach(field => {
    const row = document.createElement('div');
    row.className = 'kgi-field-row';
    row.innerHTML = `
      <span class="kgi-field-label">${field.label}</span>
      <div class="kgi-field-input-wrap">
        ${buildKpiInputHtml(field, 'entry-')}
        <span class="kgi-field-unit">${field.unit}</span>
      </div>
    `;
    forecastContainer.appendChild(row);
  });
  bindKpiInputs(forecastContainer);
}

function buildRelationshipTags() {
  const container = document.getElementById('relationship-tags');
  RELATIONSHIP_ACTIONS.forEach(action => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.textContent = action;
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
    container.appendChild(btn);
  });
}

function initCounterBtns() {
  document.querySelectorAll('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const delta = Number(btn.dataset.delta);
      const el = document.getElementById(targetId);
      el.textContent = Math.max(0, Number(el.textContent) + delta);
    });
  });
}

async function loadEntry(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  try {
    const yearMonth = date.slice(0, 7);
    // allDataキャッシュ優先（未ロードなら待機、失敗時はgetEntriesにフォールバック）
    if (!historyState.allData) {
      await ensureHistData().catch(() => {});
    }
    let entries;
    if (historyState.allData) {
      entries = historyState.allData.entries.filter(e => e.date.startsWith(yearMonth));
    } else {
      entries = await getEntries(yearMonth);
    }
    const entry = entries.find(e => e.date === date);

    KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
      setKpiInputValue(document.getElementById(`entry-${field.key}`), field, 0);
    });

    FORECAST_FIELDS.forEach(field => {
      const el = document.getElementById(`entry-${field.key}`);
      if (!el) return;
      let val = entry ? (entry[field.key] ?? 0) : 0;
      if (!val) {
        const recent = [...entries]
          .filter(e => e.date < date && (e[field.key] || 0) !== 0)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        val = recent ? (recent[field.key] || 0) : 0;
      }
      setKpiInputValue(el, field, val);
    });

    const actions = entry ? (entry.relationshipActions || []) : [];
    document.querySelectorAll('#relationship-tags .tag-btn').forEach(btn => {
      btn.classList.toggle('selected', actions.includes(btn.textContent));
    });

    document.getElementById('positive-count').textContent = 0;
    document.getElementById('negative-count').textContent = 0;
    document.getElementById('entry-memorable-visit').value = entry ? (entry.memorableVisit || '') : '';
    document.getElementById('entry-notes').value = entry ? (entry.notes || '') : '';
    document.getElementById('entry-notes-important').checked = entry ? !!entry.notesImportant : false;
    document.getElementById('entry-insight').value = entry ? (entry.insight || '') : '';
    document.getElementById('entry-next-action').value = entry ? (entry.nextAction || '') : '';

    updateNotesImportant();

    const snap = {};
    KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => { snap[field.key] = 0; });
    FORECAST_FIELDS.forEach(field => { snap[field.key] = 0; });
    snap.positiveFeedback = 0;
    snap.negativeFeedback = 0;
    daySnapshot[date] = snap;

    captureInputFormBaseline();

    // 累計マイナス警告
    if (entry && entry.hasNegative) {
      showNegativeWarning(date);
    } else {
      clearNegativeWarning();
    }
  } catch (e) {
    console.warn('エントリロード失敗:', e);
  }
}

function showNegativeWarning(date) {
  let el = document.getElementById('negative-warning');
  if (!el) {
    el = document.createElement('div');
    el.id = 'negative-warning';
    el.style.cssText = 'background:rgba(248,113,113,0.15);border:1px solid #f87171;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:13px;color:#f87171;';
    const saveBtn = document.getElementById('entry-save-btn');
    saveBtn.insertAdjacentElement('beforebegin', el);
  }
  el.textContent = `⚠ ${formatDate(date)} の累計がマイナスになっています`;
  el.style.display = 'block';
}

function clearNegativeWarning() {
  const el = document.getElementById('negative-warning');
  if (el) el.style.display = 'none';
}

function updateNotesImportant() {
  const checked = document.getElementById('entry-notes-important').checked;
  document.getElementById('entry-notes').classList.toggle('notes-important', checked);
}

async function handleSaveEntry() {
  const btn = document.getElementById('entry-save-btn');
  const date = document.getElementById('entry-date').value;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  btn.disabled = true;
  btn.textContent = '保存中...';

  const snap = daySnapshot[date] || {};

  const actions = Array.from(document.querySelectorAll('#relationship-tags .tag-btn.selected'))
    .map(b => b.textContent);

  const positiveFeedback = Number(document.getElementById('positive-count').textContent) || 0;
  const negativeFeedback = Number(document.getElementById('negative-count').textContent) || 0;

  // 積み上げ型: フォーム値とスナップショットの差分をinsert
  const data = {
    date,
    relationshipActions: actions,
    positiveFeedback: positiveFeedback - (snap.positiveFeedback || 0),
    negativeFeedback: negativeFeedback - (snap.negativeFeedback || 0),
    memorableVisit: document.getElementById('entry-memorable-visit').value,
    notes: document.getElementById('entry-notes').value,
    notesImportant: document.getElementById('entry-notes-important').checked,
    insight: document.getElementById('entry-insight').value,
    nextAction: document.getElementById('entry-next-action').value,
  };

  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    const current = el ? parseNumericInput(el.value) : 0;
    data[field.key] = current - (snap[field.key] || 0);
  });

  FORECAST_FIELDS.forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    const current = el ? parseNumericInput(el.value) : 0;
    data[field.key] = current - (snap[field.key] || 0);
  });

  try {
    const result = await saveEntry(data);
    if (!result || result.success !== true) {
      throw new Error(result && result.error ? result.error : JSON.stringify(result));
    }
    console.log('[saveEntry] 成功:', date);
    historyState.allData = null;
    showSaveFeedback(btn);
    try { await loadEntry(date); } catch (_) {}
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '保存する';
    console.error('[saveEntry] 失敗:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

// ------------------------------------------------------------------
// ダッシュボードタブ
// ------------------------------------------------------------------

let dashboardChart = null;
let _dashboardRefreshing = false;
let _kgiProgressView = 'monthly';

function initDashboardTab() {
  document.querySelector('[data-tab="tab-dashboard"]').addEventListener('click', refreshDashboard);
  document.querySelectorAll('#kgi-progress-toggle .seg-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_kgiProgressView === btn.dataset.view) return;
      _kgiProgressView = btn.dataset.view;
      document.querySelectorAll('#kgi-progress-toggle .seg-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      refreshDashboard();
    });
  });
  refreshDashboard();
}

async function refreshDashboard() {
  if (_dashboardRefreshing) return;
  _dashboardRefreshing = true;
  const yearMonth = getCurrentYearMonthJST();
  try {
    await ensureHistData();
    const allData = historyState.allData;
    const allEntries = allData ? allData.entries : [];
    const entries = allData ? allData.entries.filter(e => e.date.startsWith(yearMonth)) : [];
    const budget  = allData ? (allData.budgets.find(b => String(b.yearMonth || '').slice(0, 7) === yearMonth) || null) : null;
    renderTrustScore(entries);
    const totals = calcMonthlyTotals(entries);
    const promotionActual = totals.promotionAmount || 0;
    renderPlanCard(
      promotionActual,
      budget ? (budget.promotionAmount || 0) : 0,
      { actual: 'personal-plan-actual', budget: 'personal-plan-budget', rate: 'personal-plan-rate', bar: 'personal-plan-bar', shortage: 'personal-plan-shortage' }
    );
    renderKpiChart(totals, budget);

    const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const personalUnsettled = (sortedEntries.find(e => e.personalUnsettled > 0) || {}).personalUnsettled || 0;
    const officeUnsettled   = (sortedEntries.find(e => e.officeUnsettled   > 0) || {}).officeUnsettled   || 0;
    renderPlanCard(
      personalUnsettled,
      budget ? (budget.personalPlan || 0) : 0,
      { actual: 'personal-unsettled-actual', budget: 'personal-unsettled-budget',
        rate: 'personal-unsettled-rate', bar: 'personal-unsettled-bar', shortage: 'personal-unsettled-shortage' }
    );
    renderPlanCard(
      officeUnsettled,
      budget ? (budget.officePlan || 0) : 0,
      { actual: 'office-unsettled-actual', budget: 'office-unsettled-budget',
        rate: 'office-unsettled-rate', bar: 'office-unsettled-bar', shortage: 'office-unsettled-shortage' }
    );
    renderKgiProgressCard(entries, budget);

    const today = getTodayJST();
    const yesterday = addCalendarDays(today, -1);
    const prevEntries = entries.filter(e => e.date <= yesterday);
    const prevSortedEntries = [...prevEntries].sort((a, b) => b.date.localeCompare(a.date));

    renderPaceLine('personal-plan-pace', {
      itemKey: 'promotionAmount',
      plan: budget ? (budget.promotionAmount || 0) : 0,
      actual: promotionActual,
      prevActual: calcMonthlyTotals(prevEntries).promotionAmount || 0,
      unit: '円', yearMonth, asOfDateStr: today,
    });
    renderPaceLine('personal-unsettled-pace', {
      itemKey: 'personalUnsettled',
      plan: budget ? (budget.personalPlan || 0) : 0,
      actual: personalUnsettled,
      prevActual: (prevSortedEntries.find(e => e.personalUnsettled > 0) || {}).personalUnsettled || 0,
      unit: '円', yearMonth, asOfDateStr: today,
    });
    renderPaceLine('office-unsettled-pace', {
      itemKey: 'officeUnsettled',
      plan: budget ? (budget.officePlan || 0) : 0,
      actual: officeUnsettled,
      prevActual: (prevSortedEntries.find(e => e.officeUnsettled > 0) || {}).officeUnsettled || 0,
      unit: '円', yearMonth, asOfDateStr: today,
    });
    renderStreakBadge(allEntries);
  } catch (e) {
    console.warn('ダッシュボードロード失敗:', e);
  } finally {
    _dashboardRefreshing = false;
  }
}

function renderKgiProgressCard(entries, budget) {
  const remainingEl = document.getElementById('kgi-remaining-days');
  if (_kgiProgressView === 'weekly') {
    if (remainingEl) remainingEl.textContent = '';
    renderWeeklyKgiProgress(entries, budget);
  } else {
    renderMonthlyKgiProgress(entries, budget);
  }
}

function renderMonthlyKgiProgress(entries, budget) {
  const today = getTodayJST();
  const yearMonth = today.slice(0, 7);
  const [y, m] = yearMonth.split('-').map(Number);
  const monthEnd = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const remainingEl = document.getElementById('kgi-remaining-days');
  if (remainingEl) remainingEl.textContent = `残${countBusinessDays(today, monthEnd)}営業日（月末まで）`;

  const totals = calcMonthlyTotals(entries);
  const yesterday = addCalendarDays(today, -1);
  const prevTotals = calcMonthlyTotals(entries.filter(e => e.date <= yesterday));

  const rows = KGI_FIELDS.filter(f => f.color === 'cyan').map(f => {
    const actual = totals[f.key] || 0;
    const plan = budget ? (budget[f.key] || 0) : 0;
    const actualStr = formatKpiValue(actual, f);

    if (plan <= 0) {
      if (actual === 0) return '';
      return `<div class="weekly-gauge-row">
        <div class="weekly-gauge-label">
          <span>${f.label}</span>
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${actualStr}</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">目標未設定</span>
        </div>
      </div>`;
    }

    const rate = Math.round(actual / plan * 100);
    const colorClass = getProgressColorClass(rate);
    const color = getAccentColor(colorClass);
    const planStr = formatKpiValue(plan, f);

    const pace = buildPaceInfo({
      itemKey: f.key,
      plan, actual,
      prevActual: prevTotals[f.key] || 0,
      unit: f.unit,
      isMoney: !!f.money,
      yearMonth,
      asOfDateStr: today,
    });
    const paceColor = getAccentColor(pace.colorClass);

    return `<div class="weekly-gauge-row">
      <div class="weekly-gauge-label">
        <span>${f.label}</span>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${actualStr} / ${planStr}</span>
        <span style="font-family:var(--font-mono);font-weight:700;color:${color}">${rate}%</span>
      </div>
      <div class="progress-bar" style="margin-top:4px">
        <div class="progress-fill ${colorClass}" style="width:${Math.min(rate, 100)}%"></div>
      </div>
      <div class="kgi-pace-line" style="color:${paceColor}">${pace.text}</div>
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('weekly-gauge-container').innerHTML =
    rows || '<div style="color:var(--text-muted);font-size:13px">KGI設定タブで計画を入力してください</div>';
}

function renderWeeklyKgiProgress(entries, budget) {
  const weekStart = getWeekStartJST();
  const weekEntries = entries.filter(e => e.date >= weekStart);
  const weekTotals = {};
  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(f => {
    weekTotals[f.key] = weekEntries.reduce((s, e) => s + (e[f.key] || 0), 0);
  });

  const rows = KGI_FIELDS.filter(f => f.color === 'cyan').map(f => {
    const actual = weekTotals[f.key] || 0;
    const weekTarget = budget ? Math.round((budget[f.key] || 0) / 3) : 0;
    const actualStr = formatKpiValue(actual, f);

    if (weekTarget === 0) {
      // 予算未設定: 実績が0の項目はスキップ、あれば目標なしで表示
      if (actual === 0) return '';
      return `<div class="weekly-gauge-row">
        <div class="weekly-gauge-label">
          <span>${f.label}</span>
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${actualStr}</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">目標未設定</span>
        </div>
      </div>`;
    }

    const rate = Math.round(actual / weekTarget * 100);
    const colorClass = getProgressColorClass(rate);
    const color = getAccentColor(colorClass);
    const targetStr = formatKpiValue(weekTarget, f);
    return `<div class="weekly-gauge-row">
      <div class="weekly-gauge-label">
        <span>${f.label}</span>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${actualStr} / ${targetStr}</span>
        <span style="font-family:var(--font-mono);font-weight:700;color:${color}">${rate}%</span>
      </div>
      <div class="progress-bar" style="margin-top:4px">
        <div class="progress-fill ${colorClass}" style="width:${Math.min(rate, 100)}%"></div>
      </div>
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('weekly-gauge-container').innerHTML =
    rows || '<div style="color:var(--text-muted);font-size:13px">KGI設定タブで計画を入力してください</div>';
}

function renderStreakBadge(entries) {
  const badge = document.getElementById('streak-badge');
  if (!badge) return;
  const dateSet = new Set((entries || []).map(e => e.date));
  let streak = 0;
  const today = getTodayJST();
  const [y, m, d] = today.split('-').map(Number);
  let cur = new Date(Date.UTC(y, m - 1, d));
  while (streak <= 365) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dow = cur.getUTCDay();
    if (dow === 0 || dow === 6) {
      cur = new Date(cur.getTime() - 86400000);
      continue;
    }
    if (!dateSet.has(dateStr)) break;
    streak++;
    cur = new Date(cur.getTime() - 86400000);
  }
  if (streak > 0) {
    badge.textContent = `🔥 ${streak}日連続`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

let _aiReportCache = { content: '', period: '', type: '' };

let _aiFeedbackScore = 0;

function initAiReportCard() {
  document.querySelectorAll('.ai-gen-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => handleAiReport(btn.dataset.type));
  });
  document.getElementById('ai-pdf-btn').addEventListener('click', handleAiPdf);

  document.querySelectorAll('[data-feedback-scope="personal"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _aiFeedbackScore = Number(this.dataset.score);
      document.getElementById('ai-feedback-comment-area').style.display = '';
    });
  });
  document.getElementById('ai-feedback-submit').addEventListener('click', async function() {
    const comment  = document.getElementById('ai-feedback-comment').value;
    const statusEl = document.getElementById('ai-feedback-status');
    this.disabled  = true;
    try {
      await saveFeedback({
        scope: 'personal', reportType: _aiReportCache.type,
        reportPeriod: _aiReportCache.period, score: _aiFeedbackScore,
        goodComment: _aiFeedbackScore > 0 ? comment : '',
        badComment:  _aiFeedbackScore < 0 ? comment : '',
      });
      statusEl.textContent = '✓ フィードバックを保存しました';
      document.getElementById('ai-feedback-comment-area').style.display = 'none';
      document.querySelectorAll('[data-feedback-scope="personal"]').forEach(function(b) { b.disabled = true; });
    } catch (e) {
      statusEl.textContent = 'エラー: ' + e.message;
      this.disabled = false;
    }
  });
}

async function handleAiReport(type) {
  const el = document.getElementById('ai-report-content');
  el.innerHTML = '<div class="ai-loading">生成中...</div>';
  document.querySelectorAll('.ai-gen-btn').forEach(b => b.disabled = true);
  try {
    const res = await generateReport(type);
    if (res && res.content) {
      renderAiReportContent(res.content, res.period, type);
    } else {
      const errMsg = (res && res.error) ? res.error : 'レスポンスが空です';
      _renderError(el, 'GASエラー: ' + errMsg);
    }
  } catch (e) {
    _renderError(el, 'エラー: ' + e.message);
  } finally {
    document.querySelectorAll('.ai-gen-btn').forEach(b => b.disabled = false);
  }
}

async function loadLatestAiReport() {
  try {
    const res = await getLatestReport('weekly');
    if (res && res.content) renderAiReportContent(res.content, res.period, 'weekly');
  } catch (_) {}
}

function renderAiReportContent(content, period, type) {
  _aiReportCache = { content, period, type };
  const typeLabel = type === 'weekly' ? '週次' : '月次';
  const formatted = _escapeHtml(content)
    .replace(/([①②③④⑤])/g, '<span class="ai-section-marker">$1</span>')
    .replace(/\n/g, '<br>');
  document.getElementById('ai-report-content').innerHTML =
    '<div class="ai-report-label">' + typeLabel + 'レポート（' + period + '）</div>' +
    '<div class="ai-report-body">' + formatted + '</div>';
  // フィードバックUIをリセット表示
  const fbArea = document.getElementById('ai-feedback-area');
  if (fbArea) {
    fbArea.style.display = '';
    document.getElementById('ai-feedback-comment-area').style.display = 'none';
    document.getElementById('ai-feedback-comment').value = '';
    document.getElementById('ai-feedback-status').textContent = '';
    document.querySelectorAll('[data-feedback-scope="personal"]').forEach(function(b) { b.disabled = false; });
    _aiFeedbackScore = 0;
  }
}

function handleAiPdf() {
  if (!_aiReportCache.content) {
    alert('先にレポートを生成してください');
    return;
  }
  const typeLabel = _aiReportCache.type === 'weekly' ? '週次' : '月次';
  const body = _escapeHtml(_aiReportCache.content).replace(/\n/g, '<br>');
  const html =
    '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<title>' + typeLabel + 'AIレポート</title>' +
    '<style>' +
    'body{font-family:"Hiragino Kaku Gothic ProN",sans-serif;padding:32px;' +
    'max-width:640px;margin:0 auto;color:#111;font-size:14px;line-height:2}' +
    'h2{font-size:17px;margin-bottom:4px}.period{font-size:12px;color:#666;margin-bottom:24px}' +
    '</style></head><body>' +
    '<h2>' + typeLabel + ' AIレポート</h2>' +
    '<div class="period">' + _aiReportCache.period + '</div>' +
    '<div>' + body + '</div>' +
    '</body></html>';

  const win = window.open('', '_blank');
  if (win) {
    // PC：新しいウィンドウで印刷ダイアログ
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 400);
  } else {
    // モバイル（ポップアップブロック時）：現在ページで印刷
    window.print();
  }
}

// ------------------------------------------------------------------
// 営業所 AIレポートカード（B-1）
// ------------------------------------------------------------------

let _officeAiReportCache  = { content: '', period: '', type: '' };
let _officeAiFeedbackScore = 0;

function initOfficeAiReportCard() {
  document.querySelectorAll('[data-office-ai-type]').forEach(btn => {
    btn.addEventListener('click', () => handleOfficeAiReport(btn.dataset.officeAiType));
  });
  document.getElementById('office-ai-pdf-btn').addEventListener('click', handleOfficeAiPdf);

  document.querySelectorAll('[data-feedback-scope="office"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _officeAiFeedbackScore = Number(this.dataset.score);
      document.getElementById('office-ai-feedback-comment-area').style.display = '';
    });
  });
  document.getElementById('office-ai-feedback-submit').addEventListener('click', async function() {
    const comment  = document.getElementById('office-ai-feedback-comment').value;
    const statusEl = document.getElementById('office-ai-feedback-status');
    this.disabled  = true;
    try {
      await saveFeedback({
        scope: 'office', reportType: _officeAiReportCache.type,
        reportPeriod: _officeAiReportCache.period, score: _officeAiFeedbackScore,
        goodComment: _officeAiFeedbackScore > 0 ? comment : '',
        badComment:  _officeAiFeedbackScore < 0 ? comment : '',
      });
      statusEl.textContent = '✓ フィードバックを保存しました';
      document.getElementById('office-ai-feedback-comment-area').style.display = 'none';
      document.querySelectorAll('[data-feedback-scope="office"]').forEach(function(b) { b.disabled = true; });
    } catch (e) {
      statusEl.textContent = 'エラー: ' + e.message;
      this.disabled = false;
    }
  });
}

async function handleOfficeAiReport(type) {
  const el = document.getElementById('office-ai-report-content');
  el.innerHTML = '<div class="ai-loading">生成中...</div>';
  document.querySelectorAll('[data-office-ai-type]').forEach(b => b.disabled = true);
  try {
    const res = await generateOfficeReport(type);
    if (res && res.content) {
      renderOfficeAiReportContent(res.content, res.period, type);
    } else {
      const errMsg = (res && res.error) ? res.error : 'レスポンスが空です';
      _renderError(el, 'GASエラー: ' + errMsg);
    }
  } catch (e) {
    _renderError(el, 'エラー: ' + e.message);
  } finally {
    document.querySelectorAll('[data-office-ai-type]').forEach(b => b.disabled = false);
  }
}

function renderOfficeAiReportContent(content, period, type) {
  _officeAiReportCache = { content, period, type };
  const typeLabel = type === 'weekly' ? '週次' : '月次';
  const formatted = _escapeHtml(content)
    .replace(/([①②③④⑤])/g, '<span class="ai-section-marker">$1</span>')
    .replace(/\n/g, '<br>');
  document.getElementById('office-ai-report-content').innerHTML =
    '<div class="ai-report-label">' + typeLabel + 'レポート（' + period + '）</div>' +
    '<div class="ai-report-body">' + formatted + '</div>';
  // フィードバックUIをリセット表示
  const fbArea = document.getElementById('office-ai-feedback-area');
  if (fbArea) {
    fbArea.style.display = '';
    document.getElementById('office-ai-feedback-comment-area').style.display = 'none';
    document.getElementById('office-ai-feedback-comment').value = '';
    document.getElementById('office-ai-feedback-status').textContent = '';
    document.querySelectorAll('[data-feedback-scope="office"]').forEach(function(b) { b.disabled = false; });
    _officeAiFeedbackScore = 0;
  }
}

function handleOfficeAiPdf() {
  if (!_officeAiReportCache.content) {
    alert('先にレポートを生成してください');
    return;
  }
  const typeLabel = _officeAiReportCache.type === 'weekly' ? '週次' : '月次';
  const body = _escapeHtml(_officeAiReportCache.content).replace(/\n/g, '<br>');
  const html =
    '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<title>' + typeLabel + '営業所AIレポート</title>' +
    '<style>body{font-family:"Hiragino Kaku Gothic ProN",sans-serif;padding:32px;' +
    'max-width:640px;margin:0 auto;color:#111;font-size:14px;line-height:2}' +
    'h2{font-size:17px;margin-bottom:4px}.period{font-size:12px;color:#666;margin-bottom:24px}' +
    '</style></head><body>' +
    '<h2>' + typeLabel + ' 営業所AIレポート</h2>' +
    '<div class="period">' + _officeAiReportCache.period + '</div>' +
    '<div>' + body + '</div></body></html>';
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 400);
  } else {
    window.print();
  }
}

function calcMonthlyTotals(entries) {
  const totals = {};
  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    totals[field.key] = entries.reduce((sum, e) => sum + (e[field.key] || 0), 0);
  });
  return totals;
}

function renderTrustScore(entries) {
  const allActions = entries.flatMap(e => e.relationshipActions || []);
  const posTotal = entries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
  const negTotal = entries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
  const score = calcTrustIndex(allActions, posTotal, negTotal);

  document.getElementById('trust-score-value').textContent = score;
  document.getElementById('trust-action-count').textContent = allActions.length;
  document.getElementById('trust-pos-count').textContent = posTotal;
  document.getElementById('trust-neg-count').textContent = negTotal;
}

function renderPlanCard(actual, plan, ids) {
  const rate = plan > 0 ? Math.round(actual / plan * 100) : 0;
  const shortage = plan - actual;
  const colorClass = getProgressColorClass(rate);

  document.getElementById(ids.actual).textContent = formatCurrency(actual);
  document.getElementById(ids.budget).textContent = formatCurrency(plan);
  document.getElementById(ids.rate).textContent = rate + '%';
  document.getElementById(ids.rate).style.color = getAccentColor(colorClass);

  const shortageEl = document.getElementById(ids.shortage);
  if (shortage < 0) {
    shortageEl.textContent = formatCurrency(-shortage) + '（超過）';
    shortageEl.style.color = 'var(--accent-cyan)';
  } else {
    shortageEl.textContent = formatCurrency(shortage);
    shortageEl.style.color = '';
  }

  const bar = document.getElementById(ids.bar);
  bar.style.width = Math.max(0, Math.min(rate, 100)) + '%';
  bar.className = `progress-fill ${colorClass}`;
}

function getAccentColor(colorClass) {
  return { green: '#4ade80', cyan: '#22d3ee', amber: '#fbbf24', red: '#f87171' }[colorClass] || '#94a3b8';
}

function renderPaceLine(elId, params) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!params.plan || params.plan <= 0) {
    el.innerHTML = '';
    return;
  }
  const pace = buildPaceInfo(params);
  el.innerHTML = pace.text;
  el.style.color = getAccentColor(pace.colorClass);
}

function renderKpiChart(totals, budget) {
  const kpiFields = KGI_FIELDS.filter(f => f.color === 'cyan');

  const labels = [];
  const rates = [];
  const colors = [];

  kpiFields.forEach(field => {
    const b = budget ? (budget[field.key] || 0) : 0;
    if (b === 0) return;
    const a = totals[field.key] || 0;
    const rate = Math.round(a / b * 100);
    labels.push(field.label);
    rates.push(rate);
    colors.push(getAccentColor(getProgressColorClass(rate)) + 'cc');
  });

  const canvas = document.getElementById('kpi-chart');
  const ctx = canvas.getContext('2d');

  // Chart.js 4.x: getChart() でキャンバスに紐づく既存チャートを確実に破棄
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  dashboardChart = null;

  if (labels.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#475569';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KGI設定タブで計画を入力してください', canvas.width / 2, 60);
    return;
  }

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '達成率 (%)',
        data: rates,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.x}%` },
        },
      },
      scales: {
        x: {
          min: 0,
          ticks: { color: '#94a3b8', callback: v => v + '%' },
          grid: { color: '#2d3f5a' },
        },
        y: {
          ticks: { color: '#f1f5f9', font: { size: 11 } },
          grid: { color: '#2d3f5a' },
        },
      },
    },
  });
}

// ------------------------------------------------------------------
// 履歴タブ
// ------------------------------------------------------------------

const historyState = {
  view: 'daily',
  yearMonth: getCurrentYearMonthJST(),
  year: Number(getTodayJST().slice(0, 4)),
  quarter: 'all',
  date: getTodayJST(),
  weekIndex: 1,
  allData: null,
  compareMode: false,
  comparePeriod: { yearMonth: '', year: 0, quarter: 'all', date: '', weekYearMonth: '', weekIndex: 1 },
};

function initHistoryTab() {
  document.getElementById('hist-view-select').addEventListener('change', onHistViewChange);
  document.querySelector('[data-tab="tab-history"]').addEventListener('click', () => {
    renderHistPeriodControl();
    renderHistContent();
  });
  document.getElementById('hist-content').addEventListener('click', e => {
    const editBtn = e.target.closest('.hist-edit-btn');
    const deleteBtn = e.target.closest('.hist-delete-btn');
    if (editBtn) handleEditHistoryEntry(editBtn.dataset.date);
    if (deleteBtn) handleDeleteHistoryEntry(deleteBtn.dataset.date, deleteBtn);
  });
  document.getElementById('hist-compare-btn').addEventListener('click', onHistCompareModeToggle);
  renderHistPeriodControl();
  initReportControls();
}

async function handleEditHistoryEntry(date) {
  document.querySelector('[data-tab="tab-input"]').click();
  document.getElementById('entry-date').value = date;
  await loadEntry(date);
}

async function handleDeleteHistoryEntry(date, btn) {
  if (!confirm(`${formatDate(date)} のデータを削除しますか？\nこの操作は元に戻せません。`)) return;
  btn.disabled = true;
  btn.textContent = '削除中...';
  try {
    await deleteEntry(date);
    historyState.allData = null;
    await renderHistContent();
  } catch (e) {
    alert('削除に失敗しました: ' + e.message);
    btn.disabled = false;
    btn.textContent = '削除';
  }
}

function onHistViewChange() {
  historyState.view = document.getElementById('hist-view-select').value;
  renderHistPeriodControl();
  renderHistContent();
}

function onHistPeriodChange() {
  const view = historyState.view;
  if (view === 'daily') {
    if (historyState.compareMode) {
      const dEl = document.getElementById('hist-date-input');
      if (dEl && dEl.value) { historyState.date = dEl.value; historyState.yearMonth = dEl.value.slice(0, 7); }
    } else {
      historyState.yearMonth = document.getElementById('hist-month-input').value || getCurrentYearMonthJST();
    }
  } else if (view === 'weekly') {
    const mEl = document.getElementById('hist-month-input');
    const wEl = document.getElementById('hist-week-select');
    if (mEl) historyState.yearMonth = mEl.value || getCurrentYearMonthJST();
    if (wEl) historyState.weekIndex = Number(wEl.value) || 1;
  } else if (view === 'monthly') {
    historyState.year = Number(document.getElementById('hist-year-input').value) || Number(getTodayJST().slice(0, 4));
  } else if (view === 'quarterly') {
    const yearEl = document.getElementById('hist-year-input');
    const qEl = document.getElementById('hist-quarter-select');
    if (yearEl) historyState.year = Number(yearEl.value) || Number(getTodayJST().slice(0, 4));
    if (qEl) historyState.quarter = qEl.value;
  } else if (view === 'yearly') {
    const yearEl = document.getElementById('hist-year-input');
    if (yearEl) historyState.year = Number(yearEl.value) || Number(getTodayJST().slice(0, 4));
  }
  renderHistContent();
}

function _onHistCmpPeriodChange() {
  const view = historyState.view;
  const cp = historyState.comparePeriod;
  if (view === 'daily') {
    const el = document.getElementById('hist-cmp-date-input');
    if (el) cp.date = el.value || historyState.date;
  } else if (view === 'weekly') {
    const mEl = document.getElementById('hist-cmp-month-input');
    const wEl = document.getElementById('hist-cmp-week-select');
    if (mEl) cp.weekYearMonth = mEl.value || historyState.yearMonth;
    if (wEl) cp.weekIndex = Number(wEl.value) || 1;
  } else if (view === 'monthly' || view === 'yearly') {
    const el = document.getElementById('hist-cmp-year-input');
    if (el) cp.year = Number(el.value) || (historyState.year - 1);
  } else if (view === 'quarterly') {
    const yEl = document.getElementById('hist-cmp-year-input');
    const qEl = document.getElementById('hist-cmp-quarter-select');
    if (yEl) cp.year    = Number(yEl.value) || (historyState.year - 1);
    if (qEl) cp.quarter = qEl.value;
  }
  renderHistContent();
}

function renderHistPeriodControl() {
  const container = document.getElementById('hist-period-control');
  const view = historyState.view;
  const cp = historyState.comparePeriod;
  const cm = historyState.compareMode;

  function _weekOpts(sel) {
    return [1,2,3,4,5].map(n => `<option value="${n}"${sel === n ? ' selected' : ''}>第${n}週</option>`).join('');
  }
  function _qOpts(sel) {
    return [['all','全四半期'],['Q1','Q1（1〜3月）'],['Q2','Q2（4〜6月）'],['Q3','Q3（7〜9月）'],['Q4','Q4（10〜12月）']]
      .map(([v,l]) => `<option value="${v}"${sel === v ? ' selected' : ''}>${l}</option>`).join('');
  }

  function _mainHTML() {
    if (cm) {
      if (view === 'daily') {
        return `<input type="date" id="hist-date-input" value="${historyState.date}" />`;
      } else if (view === 'weekly') {
        return `<input type="month" id="hist-month-input" value="${historyState.yearMonth}" style="flex:1" />` +
               `<select id="hist-week-select" style="flex:1">${_weekOpts(historyState.weekIndex)}</select>`;
      } else if (view === 'monthly') {
        return `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" />`;
      } else if (view === 'quarterly') {
        return `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" style="flex:1" />` +
               `<select id="hist-quarter-select" style="flex:1">${_qOpts(historyState.quarter)}</select>`;
      } else if (view === 'yearly') {
        return `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" />`;
      }
      return '';
    }
    if (view === 'daily' || view === 'weekly') {
      return `<input type="month" id="hist-month-input" value="${historyState.yearMonth}" />`;
    } else if (view === 'monthly') {
      return `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" />`;
    } else if (view === 'quarterly') {
      return `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" style="flex:1" />` +
             `<select id="hist-quarter-select" style="flex:1">${_qOpts(historyState.quarter)}</select>`;
    }
    return '';
  }

  function _cmpHTML() {
    if (view === 'daily') {
      const d = new Date(historyState.date);
      d.setDate(d.getDate() - 1);
      const v = cp.date || d.toISOString().slice(0, 10);
      return `<input type="date" id="hist-cmp-date-input" value="${v}" />`;
    } else if (view === 'weekly') {
      const vm = cp.weekYearMonth || cp.yearMonth || historyState.yearMonth;
      const vw = cp.weekIndex || 1;
      return `<input type="month" id="hist-cmp-month-input" value="${vm}" style="flex:1" />` +
             `<select id="hist-cmp-week-select" style="flex:1">${_weekOpts(vw)}</select>`;
    } else if (view === 'monthly' || view === 'yearly') {
      const v = cp.year || (historyState.year - 1);
      return `<input type="number" id="hist-cmp-year-input" value="${v}" min="2020" max="2040" />`;
    } else if (view === 'quarterly') {
      const cy = cp.year || (historyState.year - 1);
      const cq = cp.quarter || 'Q4';
      return `<input type="number" id="hist-cmp-year-input" value="${cy}" min="2020" max="2040" style="flex:1" />` +
             `<select id="hist-cmp-quarter-select" style="flex:1">${_qOpts(cq)}</select>`;
    }
    return '';
  }

  if (cm) {
    container.innerHTML = `
      <div class="cmp-period-row">
        <span class="cmp-period-label">当期</span>
        <div class="cmp-period-inputs">${_mainHTML()}</div>
      </div>
      <div class="cmp-period-row">
        <span class="cmp-period-label cmp-period-label-base">比較</span>
        <div class="cmp-period-inputs">${_cmpHTML()}</div>
      </div>`;
  } else {
    container.innerHTML = _mainHTML();
  }

  const dIn  = document.getElementById('hist-date-input');
  const mIn  = document.getElementById('hist-month-input');
  const wSel = document.getElementById('hist-week-select');
  const yIn  = document.getElementById('hist-year-input');
  const qSel = document.getElementById('hist-quarter-select');
  if (dIn)  dIn.addEventListener('change', onHistPeriodChange);
  if (mIn)  mIn.addEventListener('change', onHistPeriodChange);
  if (wSel) wSel.addEventListener('change', onHistPeriodChange);
  if (yIn)  yIn.addEventListener('change', onHistPeriodChange);
  if (qSel) qSel.addEventListener('change', onHistPeriodChange);

  const cdIn  = document.getElementById('hist-cmp-date-input');
  const cmIn  = document.getElementById('hist-cmp-month-input');
  const cwSel = document.getElementById('hist-cmp-week-select');
  const cyIn  = document.getElementById('hist-cmp-year-input');
  const cqSel = document.getElementById('hist-cmp-quarter-select');
  if (cdIn)  cdIn.addEventListener('change', _onHistCmpPeriodChange);
  if (cmIn)  cmIn.addEventListener('change', _onHistCmpPeriodChange);
  if (cwSel) cwSel.addEventListener('change', _onHistCmpPeriodChange);
  if (cyIn)  cyIn.addEventListener('change', _onHistCmpPeriodChange);
  if (cqSel) cqSel.addEventListener('change', _onHistCmpPeriodChange);
}

async function renderHistContent() {
  const content = document.getElementById('hist-content');
  content.innerHTML = '<div class="hist-empty">読み込み中...</div>';
  try {
    await ensureHistData();
    const { entries, budgets } = historyState.allData;
    const view = historyState.view;
    if (view === 'daily') {
      const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
      renderDailyView(filtered);
    } else if (view === 'weekly') {
      const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
      renderWeeklyView(filtered);
    } else if (view === 'monthly') {
      const filtered = entries.filter(e => e.date.startsWith(String(historyState.year)));
      renderMonthlyView(filtered, budgets);
    } else if (view === 'quarterly') {
      const filtered = entries.filter(e => e.date.startsWith(String(historyState.year)));
      renderQuarterlyView(filtered, budgets);
    } else if (view === 'yearly') {
      renderYearlyView(entries, budgets);
    }
    renderCompareContent(view);
  } catch (e) {
    console.warn('履歴ロード失敗:', e);
    document.getElementById('hist-content').innerHTML = '<div class="hist-empty">データの読み込みに失敗しました</div>';
  }
}

var _ensureHistDataPromise = null;
async function ensureHistData() {
  if (historyState.allData) return;
  if (_ensureHistDataPromise) return _ensureHistDataPromise;
  _ensureHistDataPromise = getAllData().then(function(data) {
    const dateMap = new Map();
    (Array.isArray(data.entries) ? data.entries : []).forEach(function(e) { dateMap.set(e.date, e); });
    historyState.allData = {
      entries: [...dateMap.values()],
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
    };
    _ensureHistDataPromise = null;
  }).catch(function(err) {
    _ensureHistDataPromise = null;
    throw err;
  });
  return _ensureHistDataPromise;
}

// ------ 集計ヘルパー ------

function groupEntriesByWeek(entries, yearMonth) {
  const weeks = [];
  entries.forEach(entry => {
    const day = Number(entry.date.slice(8, 10));
    const weekNum = Math.ceil(day / 7);
    if (!weeks[weekNum - 1]) weeks[weekNum - 1] = [];
    weeks[weekNum - 1].push(entry);
  });
  return weeks.map((wEntries, i) => {
    if (!wEntries) return null;
    const days = wEntries.map(e => Number(e.date.slice(8, 10)));
    const minDay = Math.min(...days);
    const maxDay = Math.max(...days);
    const [y, m] = yearMonth.split('-');
    return { label: `第${i + 1}週（${Number(m)}/${minDay}〜${Number(m)}/${maxDay}）`, entries: wEntries };
  }).filter(Boolean);
}

function groupEntriesByMonth(entries, year) {
  const map = {};
  entries.forEach(entry => {
    const ym = entry.date.slice(0, 7);
    if (!map[ym]) map[ym] = [];
    map[ym].push(entry);
  });
  return map;
}

function groupEntriesByQuarter(entries, year) {
  const quarters = { Q1: [], Q2: [], Q3: [], Q4: [] };
  entries.forEach(entry => {
    const month = Number(entry.date.slice(5, 7));
    if (month <= 3) quarters.Q1.push(entry);
    else if (month <= 6) quarters.Q2.push(entry);
    else if (month <= 9) quarters.Q3.push(entry);
    else quarters.Q4.push(entry);
  });
  return quarters;
}

function groupEntriesByYear(entries) {
  const map = {};
  entries.forEach(entry => {
    const yr = entry.date.slice(0, 4);
    if (!map[yr]) map[yr] = [];
    map[yr].push(entry);
  });
  return map;
}

function sumBudgets(budgets, yearMonths) {
  const result = {};
  KGI_FIELDS.forEach(f => { result[f.key] = 0; });
  budgets.filter(b => yearMonths.includes(b.yearMonth.slice(0, 7))).forEach(b => {
    KGI_FIELDS.forEach(f => { result[f.key] = (result[f.key] || 0) + (b[f.key] || 0); });
  });
  return result;
}

// ------ カード描画ヘルパー ------

function buildKgiSummaryRows(totals, budget) {
  return KGI_FIELDS.filter(f => f.color === 'cyan').map(field => {
    const actual = totals[field.key] || 0;
    const plan = budget ? (budget[field.key] || 0) : 0;
    const rate = plan > 0 ? Math.round(actual / plan * 100) : null;
    const color = rate !== null ? getAccentColor(getProgressColorClass(rate)) : 'var(--text-secondary)';
    const rateText = rate !== null ? `<span style="color:${color};font-family:var(--font-mono)">${rate}%</span>` : '';
    const actualStr = formatKpiValue(actual, field);
    const planStr = plan > 0 ? ' / ' + formatKpiValue(plan, field) : '';
    return `<div class="kgi-field-row">
      <span class="kgi-field-label">${field.label}</span>
      <span style="font-family:var(--font-mono);font-size:13px">${actualStr}${planStr}</span>
      ${rateText ? `<span style="min-width:40px;text-align:right">${rateText}</span>` : ''}
    </div>`;
  }).join('');
}

function buildDailyCard(entry) {
  const kpiRows = KGI_FIELDS.filter(f => f.color === 'cyan').map(field => {
    const val = entry[field.key] || 0;
    if (val === 0) return '';
    return `<div class="kgi-field-row">
      <span class="kgi-field-label">${field.label}</span>
      <span style="font-family:var(--font-mono);font-size:13px">${formatKpiValue(val, field)}</span>
    </div>`;
  }).filter(Boolean).join('');

  const actions = entry.relationshipActions || [];
  const trustScore = calcTrustIndex(actions, entry.positiveFeedback || 0, entry.negativeFeedback || 0);
  const metaItems = [];
  if (actions.length > 0) metaItems.push(`<span class="hist-entry-meta-item">アクション ${actions.length}件</span>`);
  if (entry.positiveFeedback > 0) metaItems.push(`<span class="hist-entry-meta-item">ポジFB ${entry.positiveFeedback}件</span>`);
  if (entry.negativeFeedback > 0) metaItems.push(`<span class="hist-entry-meta-item">ネガFB ${entry.negativeFeedback}件</span>`);
  if (trustScore > 0) metaItems.push(`<span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${trustScore}pt</span>`);

  const importantNote = entry.notesImportant && entry.notes
    ? `<div class="hist-important-note">${entry.notes}</div>` : '';
  const normalNote = !entry.notesImportant && entry.notes
    ? `<div class="hist-text-item"><span class="hist-text-label">メモ</span>${entry.notes}</div>` : '';
  const visit = entry.memorableVisit
    ? `<div class="hist-text-item"><span class="hist-text-label">訪問先</span>${entry.memorableVisit}</div>` : '';
  const insight = entry.insight
    ? `<div class="hist-text-item"><span class="hist-text-label">気づき</span>${entry.insight}</div>` : '';
  const nextAction = entry.nextAction
    ? `<div class="hist-text-item"><span class="hist-text-label">次の一手</span>${entry.nextAction}</div>` : '';

  return `<div class="card">
    <div class="hist-card-header">
      <span class="card-title">${formatDate(entry.date)}</span>
      <div class="hist-card-actions">
        <button class="hist-edit-btn" data-date="${entry.date}">編集</button>
        <button class="hist-delete-btn" data-date="${entry.date}">削除</button>
      </div>
    </div>
    ${kpiRows || '<div style="font-size:12px;color:var(--text-muted)">KPI実績なし</div>'}
    ${metaItems.length > 0 ? `<div class="hist-entry-meta">${metaItems.join('')}</div>` : ''}
    ${importantNote}${normalNote}${visit}${insight}${nextAction}
  </div>`;
}

// ------ ビュー描画 ------

function renderDailyView(entries) {
  const content = document.getElementById('hist-content');
  if (entries.length === 0) {
    content.innerHTML = `<div class="hist-empty">この月のデータはありません</div>`;
    return;
  }
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  content.innerHTML = sorted.map(buildDailyCard).join('');
}

function renderWeeklyView(entries) {
  const content = document.getElementById('hist-content');
  if (entries.length === 0) {
    content.innerHTML = `<div class="hist-empty">この月のデータはありません</div>`;
    return;
  }
  const weeks = groupEntriesByWeek(entries, historyState.yearMonth);
  content.innerHTML = weeks.map(week => {
    const totals = calcMonthlyTotals(week.entries);
    const allActions = week.entries.flatMap(e => e.relationshipActions || []);
    const pos = week.entries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = week.entries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);
    return `<div class="card">
      <div class="card-title">${week.label}</div>
      ${buildKgiSummaryRows(totals, null)}
      <div class="hist-entry-meta" style="margin-top:10px">
        <span class="hist-entry-meta-item">アクション ${allActions.length}件</span>
        <span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${trust}pt</span>
        <span class="hist-entry-meta-item">${week.entries.length}日分のデータ</span>
      </div>
    </div>`;
  }).join('');
}

function renderMonthlyView(entries, budgets) {
  const content = document.getElementById('hist-content');
  const year = historyState.year;
  const monthMap = groupEntriesByMonth(entries, year);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const cards = months.filter(ym => monthMap[ym] && monthMap[ym].length > 0).map(ym => {
    const mEntries = monthMap[ym];
    const totals = calcMonthlyTotals(mEntries);
    const budget = budgets.find(b => b.yearMonth.slice(0, 7) === ym) || null;
    const allActions = mEntries.flatMap(e => e.relationshipActions || []);
    const pos = mEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = mEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);
    return `<div class="card">
      <div class="card-title">${formatYearMonth(ym)}</div>
      ${buildKgiSummaryRows(totals, budget)}
      <div class="hist-entry-meta" style="margin-top:10px">
        <span class="hist-entry-meta-item">${mEntries.length}日分のデータ</span>
        <span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${trust}pt</span>
      </div>
    </div>`;
  });
  content.innerHTML = cards.length > 0 ? cards.join('') : `<div class="hist-empty">${year}年のデータはありません</div>`;
}

function renderQuarterlyView(entries, budgets) {
  const content = document.getElementById('hist-content');
  const year = historyState.year;
  const selectedQ = historyState.quarter;
  const quarters = groupEntriesByQuarter(entries, year);
  const allQDefs = [
    { key: 'Q1', label: 'Q1（1月〜3月）',   months: ['01','02','03'] },
    { key: 'Q2', label: 'Q2（4月〜6月）',   months: ['04','05','06'] },
    { key: 'Q3', label: 'Q3（7月〜9月）',   months: ['07','08','09'] },
    { key: 'Q4', label: 'Q4（10月〜12月）', months: ['10','11','12'] },
  ];
  const qDefs = selectedQ === 'all' ? allQDefs : allQDefs.filter(q => q.key === selectedQ);

  const cards = qDefs.filter(q => quarters[q.key].length > 0).map(q => {
    const qEntries = quarters[q.key];
    const totals = calcMonthlyTotals(qEntries);
    const yearMonths = q.months.map(m => `${year}-${m}`);
    const budget = sumBudgets(budgets, yearMonths);
    const allActions = qEntries.flatMap(e => e.relationshipActions || []);
    const pos = qEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = qEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);

    // 特定四半期選択時は月別内訳も表示
    let monthBreakdown = '';
    if (selectedQ !== 'all') {
      const monthMap = groupEntriesByMonth(qEntries, year);
      const monthCards = q.months
        .map(m => `${year}-${m}`)
        .filter(ym => monthMap[ym] && monthMap[ym].length > 0)
        .map(ym => {
          const mEntries = monthMap[ym];
          const mTotals = calcMonthlyTotals(mEntries);
          const mBudget = budgets.find(b => b.yearMonth.slice(0, 7) === ym) || null;
          const mActions = mEntries.flatMap(e => e.relationshipActions || []);
          const mPos = mEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
          const mNeg = mEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
          const mTrust = calcTrustIndex(mActions, mPos, mNeg);
          return `<div class="card" style="margin-top:8px;margin-bottom:0;border-left:3px solid var(--accent-cyan)">
            <div class="card-title">${formatYearMonth(ym)}</div>
            ${buildKgiSummaryRows(mTotals, mBudget)}
            <div class="hist-entry-meta" style="margin-top:8px">
              <span class="hist-entry-meta-item">${mEntries.length}日分のデータ</span>
              <span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${mTrust}pt</span>
            </div>
          </div>`;
        });
      if (monthCards.length > 0) {
        monthBreakdown = `<div style="margin-top:12px">${monthCards.join('')}</div>`;
      }
    }

    return `<div class="card">
      <div class="card-title">${q.label}</div>
      ${buildKgiSummaryRows(totals, budget)}
      <div class="hist-entry-meta" style="margin-top:10px">
        <span class="hist-entry-meta-item">${qEntries.length}日分のデータ</span>
        <span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${trust}pt</span>
      </div>
      ${monthBreakdown}
    </div>`;
  });

  const emptyMsg = selectedQ === 'all'
    ? `${year}年のデータはありません`
    : `${year}年 ${selectedQ} のデータはありません`;
  content.innerHTML = cards.length > 0 ? cards.join('') : `<div class="hist-empty">${emptyMsg}</div>`;
}

function renderYearlyView(entries, budgets) {
  const content = document.getElementById('hist-content');
  const yearMap = groupEntriesByYear(entries);
  const years = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));
  if (years.length === 0) {
    content.innerHTML = `<div class="hist-empty">データがありません</div>`;
    return;
  }
  content.innerHTML = years.map(yr => {
    const yEntries = yearMap[yr];
    const totals = calcMonthlyTotals(yEntries);
    const yearMonths = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`);
    const budget = sumBudgets(budgets, yearMonths);
    const allActions = yEntries.flatMap(e => e.relationshipActions || []);
    const pos = yEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = yEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);
    return `<div class="card">
      <div class="card-title">${yr}年</div>
      ${buildKgiSummaryRows(totals, budget)}
      <div class="hist-entry-meta" style="margin-top:10px">
        <span class="hist-entry-meta-item">${yEntries.length}日分のデータ</span>
        <span class="hist-entry-meta-item" style="color:var(--accent-rose)">Trust ${trust}pt</span>
      </div>
    </div>`;
  }).join('');
}

// ------------------------------------------------------------------
// 期間比較機能
// ------------------------------------------------------------------

let _compareChart = null;

function onHistCompareModeToggle() {
  historyState.compareMode = !historyState.compareMode;
  if (historyState.compareMode) {
    const view = historyState.view;
    const cp = historyState.comparePeriod;
    if (view === 'daily') {
      if (!historyState.date) historyState.date = getTodayJST();
      const d = new Date(historyState.date);
      d.setDate(d.getDate() - 1);
      cp.date = d.toISOString().slice(0, 10);
    } else if (view === 'weekly') {
      if (!historyState.weekIndex) historyState.weekIndex = 1;
      const [y, m] = historyState.yearMonth.split('-').map(Number);
      const pd = new Date(y, m - 2, 1);
      cp.weekYearMonth = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
      cp.weekIndex = historyState.weekIndex;
    } else if (view === 'monthly' || view === 'yearly') {
      cp.year = historyState.year - 1;
    } else if (view === 'quarterly') {
      if (historyState.quarter === 'all') {
        cp.year = historyState.year - 1;
        cp.quarter = 'all';
      } else {
        const qOrder = ['Q1','Q2','Q3','Q4'];
        const qi = qOrder.indexOf(historyState.quarter);
        cp.year    = qi === 0 ? historyState.year - 1 : historyState.year;
        cp.quarter = qi === 0 ? 'Q4' : qOrder[qi - 1];
      }
    }
  }
  const btn = document.getElementById('hist-compare-btn');
  if (btn) btn.classList.toggle('hist-compare-btn-active', historyState.compareMode);
  renderHistPeriodControl();
  renderHistContent();
}

function getPrevPeriodInfo(view) {
  const { yearMonth, year, quarter, allData, comparePeriod } = historyState;
  if (!allData) return null;
  const entries = allData.entries;
  const cp = comparePeriod;
  const qMonths = { Q1: ['01','02','03'], Q2: ['04','05','06'], Q3: ['07','08','09'], Q4: ['10','11','12'] };

  if (view === 'daily') {
    const currDate = historyState.date || getTodayJST();
    const dd = new Date(currDate); dd.setDate(dd.getDate() - 1);
    const cmpDate = cp.date || dd.toISOString().slice(0, 10);
    return {
      currentLabel: formatDate(currDate),
      prevLabel: formatDate(cmpDate),
      currentEntries: entries.filter(e => e.date === currDate),
      prevEntries: entries.filter(e => e.date === cmpDate),
    };
  } else if (view === 'weekly') {
    const currYM = yearMonth;
    const currWI = historyState.weekIndex || 1;
    const cmpYM = cp.weekYearMonth || (function() {
      const [y, m] = yearMonth.split('-').map(Number);
      const pd = new Date(y, m - 2, 1);
      return pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
    })();
    const cmpWI = cp.weekIndex || 1;
    function _filterWeek(ym, wi) {
      return entries.filter(e => {
        if (!e.date.startsWith(ym)) return false;
        return Math.ceil(Number(e.date.slice(8, 10)) / 7) === wi;
      });
    }
    return {
      currentLabel: formatYearMonth(currYM) + ' 第' + currWI + '週',
      prevLabel: formatYearMonth(cmpYM) + ' 第' + cmpWI + '週',
      currentEntries: _filterWeek(currYM, currWI),
      prevEntries: _filterWeek(cmpYM, cmpWI),
    };
  } else if (view === 'monthly') {
    const cmpYear = cp.year || year - 1;
    return {
      currentLabel: year + '年',
      prevLabel: cmpYear + '年',
      currentEntries: entries.filter(e => e.date.startsWith(String(year))),
      prevEntries: entries.filter(e => e.date.startsWith(String(cmpYear))),
    };
  } else if (view === 'quarterly') {
    if (quarter === 'all') {
      const cmpYear = cp.year || year - 1;
      return {
        currentLabel: year + '年（全期）',
        prevLabel: cmpYear + '年（全期）',
        currentEntries: entries.filter(e => e.date.startsWith(String(year))),
        prevEntries: entries.filter(e => e.date.startsWith(String(cmpYear))),
      };
    }
    const qOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qIdx = qOrder.indexOf(quarter);
    const cmpYear = cp.year || (qIdx === 0 ? year - 1 : year);
    const cmpQ    = cp.quarter || (qIdx === 0 ? 'Q4' : qOrder[qIdx - 1]);
    const curMonths  = qMonths[quarter] || [];
    const prevMonths = qMonths[cmpQ]    || [];
    return {
      currentLabel: year + '年 ' + quarter,
      prevLabel: cmpYear + '年 ' + cmpQ,
      currentEntries: entries.filter(e => e.date.startsWith(String(year))    && curMonths.includes(e.date.slice(5, 7))),
      prevEntries:    entries.filter(e => e.date.startsWith(String(cmpYear)) && prevMonths.includes(e.date.slice(5, 7))),
    };
  } else if (view === 'yearly') {
    const cmpYear = cp.year || (() => {
      const yMap = groupEntriesByYear(entries);
      const ys = Object.keys(yMap).sort((a, b) => b.localeCompare(a));
      return ys.length >= 2 ? Number(ys[1]) : year - 1;
    })();
    return {
      currentLabel: year + '年',
      prevLabel: cmpYear + '年',
      currentEntries: entries.filter(e => e.date.startsWith(String(year))),
      prevEntries:    entries.filter(e => e.date.startsWith(String(cmpYear))),
    };
  }
  return null;
}

function buildComparisonCard(info) {
  const { currentLabel, prevLabel, currentEntries, prevEntries } = info;
  const currTotals = calcMonthlyTotals(currentEntries);
  const prevTotals = calcMonthlyTotals(prevEntries);

  const kpiRows = KGI_FIELDS.filter(f => f.color === 'cyan').map(field => {
    const curr = currTotals[field.key] || 0;
    const prev = prevTotals[field.key] || 0;
    if (curr === 0 && prev === 0) return '';
    const diff = curr - prev;
    const rate = prev !== 0 ? Math.round(diff / prev * 100) : null;
    const fmt = v => formatKpiValue(v, field);
    const diffStr = (diff >= 0 ? '+' : '') + fmt(diff);
    const rateStr = rate !== null ? (rate >= 0 ? '+' : '') + rate + '%' : '--';
    const cls = diff > 0 ? 'cmp-pos' : diff < 0 ? 'cmp-neg' : '';
    return `<tr>
      <td class="cmp-label">${field.label}</td>
      <td class="cmp-val">${fmt(curr)}</td>
      <td class="cmp-val cmp-base">${fmt(prev)}</td>
      <td class="cmp-val ${cls}">${diffStr}</td>
      <td class="cmp-val ${cls}">${rateStr}</td>
    </tr>`;
  }).filter(Boolean).join('');

  const trustFn = arr => calcTrustIndex(
    arr.flatMap(e => e.relationshipActions || []),
    arr.reduce((s, e) => s + (e.positiveFeedback || 0), 0),
    arr.reduce((s, e) => s + (e.negativeFeedback || 0), 0)
  );
  const currTrust = trustFn(currentEntries);
  const prevTrust = trustFn(prevEntries);
  const trustDiff = currTrust - prevTrust;
  const trustRate = prevTrust !== 0 ? Math.round(trustDiff / prevTrust * 100) : null;
  const trustCls = trustDiff > 0 ? 'cmp-pos' : trustDiff < 0 ? 'cmp-neg' : '';
  const trustRow = `<tr>
    <td class="cmp-label">信頼関係指数</td>
    <td class="cmp-val">${currTrust}pt</td>
    <td class="cmp-val cmp-base">${prevTrust}pt</td>
    <td class="cmp-val ${trustCls}">${(trustDiff >= 0 ? '+' : '') + trustDiff}pt</td>
    <td class="cmp-val ${trustCls}">${trustRate !== null ? (trustRate >= 0 ? '+' : '') + trustRate + '%' : '--'}</td>
  </tr>`;

  const hasRows = kpiRows || (currTrust > 0 || prevTrust > 0);
  const tableHtml = hasRows
    ? `<div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead><tr>
            <th>指標</th>
            <th>${currentLabel}</th>
            <th class="cmp-base">${prevLabel}</th>
            <th>差分</th>
            <th>増減率</th>
          </tr></thead>
          <tbody>${kpiRows}${trustRow}</tbody>
        </table>
      </div>`
    : '<div class="hist-empty" style="padding:16px 0">比較データがありません</div>';

  return `<div class="card cmp-card">
    <div class="cmp-header">
      <span class="card-title" style="margin-bottom:0">期間比較</span>
      <div class="cmp-legends">
        <span class="cmp-legend-curr">${currentLabel}</span>
        <span class="cmp-legend-base">${prevLabel}</span>
      </div>
    </div>
    ${tableHtml}
    <div class="cmp-chart-wrap"><canvas id="cmp-chart"></canvas></div>
  </div>`;
}

function renderCompareChart(info) {
  const canvas = document.getElementById('cmp-chart');
  if (!canvas) return;
  if (_compareChart) { _compareChart.destroy(); _compareChart = null; }

  const { currentLabel, prevLabel, currentEntries, prevEntries } = info;
  const currTotals = calcMonthlyTotals(currentEntries);
  const prevTotals = calcMonthlyTotals(prevEntries);
  const countFields = KGI_FIELDS.filter(f => f.color === 'cyan' && !f.money);
  const labels = countFields.map(f =>
    f.label.replace('保守継続', '保守').replace('エアコン洗浄', 'AC洗浄').replace('フルメンテリース', 'フルメンテ').replace('営業トスアップ', 'トスアップ')
  );
  const currData = countFields.map(f => currTotals[f.key] || 0);
  const prevData = countFields.map(f => prevTotals[f.key] || 0);

  const ctx = canvas.getContext('2d');
  _compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: currentLabel,
          data: currData,
          backgroundColor: 'rgba(34, 211, 238, 0.7)',
          borderColor: 'rgba(34, 211, 238, 1)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: prevLabel,
          data: prevData,
          backgroundColor: 'rgba(148, 163, 184, 0.35)',
          borderColor: 'rgba(148, 163, 184, 0.6)',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { bodyColor: '#f1f5f9', titleColor: '#94a3b8' },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  });
}

function renderCompareContent(view) {
  const container = document.getElementById('hist-compare-content');
  if (!container) return;
  if (!historyState.compareMode) {
    container.innerHTML = '';
    if (_compareChart) { _compareChart.destroy(); _compareChart = null; }
    return;
  }
  const info = getPrevPeriodInfo(view);
  if (!info) {
    container.innerHTML = '<div class="hist-empty" style="font-size:12px">比較対象のデータが見つかりませんでした</div>';
    return;
  }
  container.innerHTML = buildComparisonCard(info);
  renderCompareChart(info);
}

// ------------------------------------------------------------------
// レポート出力
// ------------------------------------------------------------------

// 出力設定（デフォルト全ON）
const reportSettings = {
  // KGI フィールド（key: boolean）
  inspection: true,
  promotionAmount: true,
  promotionCount: true,
  maintenanceThisMonth: true,
  maintenanceNextMonth: true,
  maintenanceNext2Month: true,
  newAcquisition: true,
  acCleaning: true,
  fullMaintenance: true,
  tossUp: true,
  // その他セクション
  trustScore: true,
  importantNotes: true,
  insights: true,
  nextActions: true,
  memorableVisit: true,
  notes: true,
};

const REPORT_EXTRA_FIELDS = [
  { key: 'trustScore',     label: '信頼関係指数' },
  { key: 'importantNotes', label: '重要メモ' },
  { key: 'insights',       label: '気づき' },
  { key: 'nextActions',    label: '次の一手' },
  { key: 'memorableVisit', label: '訪問先' },
  { key: 'notes',          label: 'メモ' },
];

function initReportControls() {
  document.getElementById('report-csv-btn').addEventListener('click', handleCsvExport);
  document.getElementById('report-print-btn').addEventListener('click', handlePrintReport);
  document.getElementById('report-copy-btn').addEventListener('click', handleCopyReport);
  document.getElementById('report-settings-btn').addEventListener('click', toggleReportSettings);
  document.getElementById('export-json-btn').addEventListener('click', handleExportAllJson);
  document.getElementById('export-csv-btn').addEventListener('click', handleExportAllCsv);
  buildReportSettingsPanel();
}

async function handleExportAllJson() {
  const btn = document.getElementById('export-json-btn');
  btn.disabled = true;
  btn.textContent = '生成中...';
  try {
    await ensureHistData();
    const { entries, budgets } = historyState.allData;
    const payload = {
      exportedAt: new Date().toISOString(),
      entries,
      budgets,
    };
    const today = getTodayJST();
    downloadJson(`日報_全データ_${today}.json`, payload);
  } catch (e) {
    console.error('[exportJson] 失敗:', e);
    alert('JSONエクスポートに失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '全データJSON';
  }
}

async function handleExportAllCsv() {
  const btn = document.getElementById('export-csv-btn');
  btn.disabled = true;
  btn.textContent = '生成中...';
  try {
    await ensureHistData();
    const { entries } = historyState.allData;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const header = [
      '日付', '点検件数', '促進受注額', '促進件数',
      '当月保守継続', '次月保守継続', '次々月保守継続',
      '新規保守', 'AC洗浄', 'フルメンテ', 'トスアップ',
      '信頼関係アクション', 'ポジFB', 'ネガFB', 'Trust指数',
      '訪問先', 'メモ', '重要', '気づき', '次の一手',
      '末見額(個人)', '末見額(営業所)',
    ];
    const rows = sorted.map(e => {
      const actions = e.relationshipActions || [];
      const trust = calcTrustIndex(actions, e.positiveFeedback || 0, e.negativeFeedback || 0);
      return [
        e.date,
        e.inspection || 0,
        e.promotionAmount || 0,
        e.promotionCount || 0,
        e.maintenanceThisMonth || 0,
        e.maintenanceNextMonth || 0,
        e.maintenanceNext2Month || 0,
        e.newAcquisition || 0,
        e.acCleaning || 0,
        e.fullMaintenance || 0,
        e.tossUp || 0,
        actions.join('|'),
        e.positiveFeedback || 0,
        e.negativeFeedback || 0,
        trust,
        e.memorableVisit || '',
        e.notes || '',
        e.notesImportant ? '★' : '',
        e.insight || '',
        e.nextAction || '',
        e.personalUnsettled || 0,
        e.officeUnsettled || 0,
      ];
    });
    const today = getTodayJST();
    downloadCsv(`日報_全エントリ_${today}.csv`, [header, ...rows]);
  } catch (e) {
    console.error('[exportCsv] 失敗:', e);
    alert('CSVエクスポートに失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '全データCSV';
  }
}

function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportSettingsPanel() {
  const panel = document.getElementById('report-settings');
  const kpiFields = KGI_FIELDS.filter(f => f.color === 'cyan');

  const kpiCheckboxes = kpiFields.map(f => `
    <label class="report-chk-label">
      <input type="checkbox" data-key="${f.key}" ${reportSettings[f.key] !== false ? 'checked' : ''} />
      ${f.label}
    </label>`).join('');

  const extraCheckboxes = REPORT_EXTRA_FIELDS.map(f => `
    <label class="report-chk-label">
      <input type="checkbox" data-key="${f.key}" ${reportSettings[f.key] !== false ? 'checked' : ''} />
      ${f.label}
    </label>`).join('');

  panel.innerHTML = `
    <div class="report-settings-section-title">KPI項目</div>
    <div class="report-settings-grid">${kpiCheckboxes}</div>
    <div class="report-settings-section-title">その他</div>
    <div class="report-settings-grid">${extraCheckboxes}</div>
  `;

  panel.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', () => {
      reportSettings[chk.dataset.key] = chk.checked;
    });
  });
}

function toggleReportSettings() {
  const panel = document.getElementById('report-settings');
  const btn = document.getElementById('report-settings-btn');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  btn.classList.toggle('report-settings-btn-active', !isVisible);
}

// ------ PDF印刷 ------

function _getPeriodLabel(view) {
  if (view === 'daily')     return formatDate(historyState.date || getTodayJST());
  if (view === 'weekly')    return formatYearMonth(historyState.yearMonth) + ' 第' + (historyState.weekIndex || 1) + '週';
  if (view === 'monthly')   return historyState.year + '年';
  if (view === 'quarterly') return historyState.year + '年 ' + (historyState.quarter === 'all' ? '全四半期' : historyState.quarter);
  if (view === 'yearly')    return historyState.year + '年';
  return '';
}

function _buildPrintHtml({ title, periodText, today, cmpHtml, histHtml }) {
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + title + '</title>' +
    '<style>' +
    'body{font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;padding:20px 24px;max-width:800px;margin:0 auto;color:#111;font-size:13px;line-height:1.6}' +
    '.print-header{margin-bottom:18px;border-bottom:2px solid #333;padding-bottom:10px}' +
    '.print-title{font-size:18px;font-weight:700;margin-bottom:4px}' +
    '.print-period{font-size:13px;color:#333;font-weight:600;margin-bottom:2px}' +
    '.print-date{font-size:11px;color:#888}' +
    '.card{border:1px solid #ccc;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid;background:#fff;border-radius:0}' +
    '.card-title{font-size:14px;font-weight:700;margin-bottom:8px;color:#333;text-transform:none;letter-spacing:normal}' +
    '.kgi-field-label{color:#333;font-size:13px}' +
    '.kgi-field-value{color:#111;font-size:15px;font-weight:700}' +
    '.kgi-field-unit{color:#555;font-size:12px}' +
    '.hist-empty{color:#999}' +
    '.hist-entry-meta{color:#555;font-size:12px}' +
    '.hist-text-item{color:#555;font-size:12px}' +
    '.hist-important-note{background:#fff8f8;border:1px solid #c00;color:#c00;padding:4px 8px;border-radius:4px}' +
    '.hist-section-title{font-size:13px;font-weight:700;color:#333;margin:10px 0 6px}' +
    '.kgi-field-row{padding:8px 0;border-bottom:1px solid #eee}' +
    '.kgi-field-row:last-child{border-bottom:none}' +
    '.hist-entry-meta-item{font-size:12px;color:#555;margin-right:8px}' +
    '.hist-card-actions,.hist-edit-btn,.hist-delete-btn{display:none}' +
    /* 比較カード */
    '.cmp-card{border-left:3px solid #aaa}' +
    '.cmp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}' +
    '.cmp-legends{display:flex;gap:10px;font-size:11px}' +
    '.cmp-legend-curr{color:#0088aa;font-weight:700}' +
    '.cmp-legend-base{color:#666}' +
    '.cmp-table-wrap{overflow:visible;margin-bottom:12px}' +
    '.cmp-table{width:100%;border-collapse:collapse;font-size:12px}' +
    '.cmp-table th{color:#555;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:6px;text-align:right;border-bottom:1px solid #999}' +
    '.cmp-table th:first-child{text-align:left}' +
    '.cmp-table td{padding:6px;border-top:1px solid #eee;vertical-align:middle}' +
    '.cmp-label{font-size:12px;color:#333;white-space:nowrap}' +
    '.cmp-val{font-size:12px;text-align:right;white-space:nowrap;color:#111}' +
    '.cmp-base{color:#666}' +
    '.cmp-pos{color:#167a16;font-weight:700}' +
    '.cmp-neg{color:#c00;font-weight:700}' +
    '.cmp-chart-wrap{margin-top:8px;text-align:center}' +
    /* 非表示要素 */
    '.hist-compare-btn,.report-controls,.hist-controls,.streak-badge,.dash-gauge-wrap{display:none}' +
    '</style></head><body>' +
    '<div class="print-header">' +
    '<div class="print-title">' + title + '</div>' +
    (periodText ? '<div class="print-period">' + periodText + '</div>' : '') +
    '<div class="print-date">出力日：' + today + '</div>' +
    '</div>' +
    cmpHtml +
    histHtml +
    '</body></html>';
}

function _printWithFallback(periodText) {
  const tabHistory = document.getElementById('tab-history');

  // 期間ラベルをDOMに一時挿入
  let headerEl = null;
  if (periodText && tabHistory) {
    headerEl = document.createElement('div');
    headerEl.id = '_print-header-tmp';
    headerEl.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:4px">' + periodText + '</div>' +
      '<div style="font-size:11px;color:#888">出力日：' + getTodayJST() + '</div>';
    tabHistory.insertBefore(headerEl, tabHistory.firstChild);
  }

  // Canvas → img 差し替え（比較グラフ）
  const canvas = document.getElementById('cmp-chart');
  let canvasParent, canvasImg;
  if (canvas) {
    canvasImg = document.createElement('img');
    canvasImg.src = canvas.toDataURL('image/png');
    canvasImg.style.cssText = 'width:100%;max-height:220px;object-fit:contain';
    canvasParent = canvas.parentElement;
    canvasParent.replaceChild(canvasImg, canvas);
  }

  const restore = () => {
    if (headerEl && headerEl.parentElement) headerEl.parentElement.removeChild(headerEl);
    if (canvas && canvasParent && canvasImg) canvasParent.replaceChild(canvas, canvasImg);
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

async function handlePrintReport() {
  const btn = document.getElementById('report-print-btn');
  if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }

  try {
    // データ未ロード時はロードを待つ
    await ensureHistData();
    const view = historyState.view;
    // データロード後に表示を更新（集計カードが確実に描画されるよう）
    await renderHistContent();

    const today = getTodayJST();
    let periodText = '';
    if (historyState.compareMode) {
      const info = getPrevPeriodInfo(view);
      if (info) periodText = '当期：' + info.currentLabel + '　／　比較期：' + info.prevLabel;
    } else {
      periodText = _getPeriodLabel(view);
    }

    let cmpHtml = '';
    if (historyState.compareMode) {
      const cmpEl = document.getElementById('hist-compare-content');
      if (cmpEl) {
        const canvas = document.getElementById('cmp-chart');
        let inner = cmpEl.innerHTML;
        if (canvas) {
          const imgSrc = canvas.toDataURL('image/png');
          inner = inner.replace(
            /<canvas[^>]*id="cmp-chart"[^>]*><\/canvas>/,
            '<img src="' + imgSrc + '" style="width:100%;max-height:220px;object-fit:contain">'
          );
        }
        cmpHtml = inner;
      }
    }

    const histEl = document.getElementById('hist-content');
    const histHtml = histEl ? histEl.innerHTML : '';

    const html = _buildPrintHtml({ title: '履歴レポート', periodText, today, cmpHtml, histHtml });

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function() { win.print(); }, 400);
    } else {
      // フォールバック：期間ラベルをDOMに一時挿入してwindow.print()
      _printWithFallback(periodText);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '印刷/PDF'; }
  }
}

// ------ CSV出力 ------

async function handleCsvExport() {
  const btn = document.getElementById('report-csv-btn');
  btn.disabled = true;
  btn.textContent = '生成中...';
  try {
    await ensureHistData();
    const { entries, budgets } = historyState.allData;
    const view = historyState.view;
    let rows, filename;

    if (view === 'weekly') {
      const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
      rows = buildWeeklyCsvRows(filtered, historyState.yearMonth);
      filename = `日報_週次_${historyState.yearMonth}.csv`;
    } else if (view === 'monthly') {
      const filtered = entries.filter(e => e.date.startsWith(String(historyState.year)));
      rows = buildMonthlyCsvRows(filtered, budgets, historyState.year);
      filename = `日報_月次_${historyState.year}.csv`;
    } else {
      // 日次・その他 → 日次CSV
      const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
      rows = buildDailyCsvRows(filtered);
      filename = `日報_日次_${historyState.yearMonth}.csv`;
    }

    downloadCsv(filename, rows);
  } catch (e) {
    console.error('[CSV] 失敗:', e);
    alert('CSV出力に失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'CSV';
  }
}

function buildDailyCsvRows(entries) {
  const kpiFields = KGI_FIELDS.filter(f => f.color === 'cyan' && reportSettings[f.key] !== false);
  const header = ['日付', ...kpiFields.map(f => f.label)];
  if (reportSettings.trustScore) header.push('アクション数', 'ポジFB', 'ネガFB', 'Trust指数');
  if (reportSettings.memorableVisit) header.push('訪問先');
  if (reportSettings.notes) header.push('メモ', '重要');
  if (reportSettings.insights) header.push('気づき');
  if (reportSettings.nextActions) header.push('次の一手');

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const rows = sorted.map(e => {
    const actions = e.relationshipActions || [];
    const trust = calcTrustIndex(actions, e.positiveFeedback || 0, e.negativeFeedback || 0);
    const row = [e.date, ...kpiFields.map(f => e[f.key] || 0)];
    if (reportSettings.trustScore) row.push(actions.length, e.positiveFeedback || 0, e.negativeFeedback || 0, trust);
    if (reportSettings.memorableVisit) row.push(e.memorableVisit || '');
    if (reportSettings.notes) row.push(e.notes || '', e.notesImportant ? '★' : '');
    if (reportSettings.insights) row.push(e.insight || '');
    if (reportSettings.nextActions) row.push(e.nextAction || '');
    return row;
  });
  return [header, ...rows];
}

function buildWeeklyCsvRows(entries, yearMonth) {
  const kpiFields = KGI_FIELDS.filter(f => f.color === 'cyan' && reportSettings[f.key] !== false);
  const header = ['年月', '週', '開始日', '終了日', ...kpiFields.map(f => f.label)];
  if (reportSettings.trustScore) header.push('アクション数', 'ポジFB', 'ネガFB', 'Trust指数');
  header.push('記録日数');

  const weeks = groupEntriesByWeek(entries, yearMonth);
  const rows = weeks.map(week => {
    const totals = calcMonthlyTotals(week.entries);
    const allActions = week.entries.flatMap(e => e.relationshipActions || []);
    const pos = week.entries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = week.entries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);
    const days = week.entries.map(e => e.date).sort();
    const row = [yearMonth, week.label, days[0] || '', days[days.length - 1] || '', ...kpiFields.map(f => totals[f.key] || 0)];
    if (reportSettings.trustScore) row.push(allActions.length, pos, neg, trust);
    row.push(week.entries.length);
    return row;
  });
  return [header, ...rows];
}

function buildMonthlyCsvRows(entries, budgets, year) {
  const kpiFields = KGI_FIELDS.filter(f => f.color === 'cyan' && reportSettings[f.key] !== false);
  const header = ['年月', ...kpiFields.flatMap(f => [f.label + '(実績)', f.label + '(計画)', f.label + '(達成率%)'])];
  if (reportSettings.trustScore) header.push('アクション数', 'ポジFB', 'ネガFB', 'Trust指数');
  header.push('記録日数');

  const monthMap = groupEntriesByMonth(entries, year);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const rows = months.filter(ym => monthMap[ym] && monthMap[ym].length > 0).map(ym => {
    const mEntries = monthMap[ym];
    const totals = calcMonthlyTotals(mEntries);
    const budget = budgets.find(b => b.yearMonth.slice(0, 7) === ym) || null;
    const allActions = mEntries.flatMap(e => e.relationshipActions || []);
    const pos = mEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
    const neg = mEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
    const trust = calcTrustIndex(allActions, pos, neg);
    const kpiCells = kpiFields.flatMap(f => {
      const actual = totals[f.key] || 0;
      const plan = budget ? (budget[f.key] || 0) : 0;
      const rate = plan > 0 ? Math.round(actual / plan * 100) : '';
      return [actual, plan, rate];
    });
    const row = [ym, ...kpiCells];
    if (reportSettings.trustScore) row.push(allActions.length, pos, neg, trust);
    row.push(mEntries.length);
    return row;
  });
  return [header, ...rows];
}

function downloadCsv(filename, rows) {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r =>
    r.map(cell => {
      const s = String(cell ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    }).join(',')
  ).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------ 上長報告（テキストコピー） ------

async function handleCopyReport() {
  const btn = document.getElementById('report-copy-btn');
  btn.disabled = true;
  btn.textContent = '生成中...';
  try {
    await ensureHistData();
    const text = buildReportText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // フォールバック
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showCopyFeedback();
  } catch (e) {
    console.error('[上長報告] 失敗:', e);
    alert('コピーに失敗しました: ' + e.message);
    btn.disabled = false;
    btn.textContent = '上長報告';
  }
}

function buildReportText() {
  const { entries, budgets } = historyState.allData;
  const view = historyState.view;

  // ── 週次 ──
  if (view === 'weekly') {
    const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
    const weeks = groupEntriesByWeek(filtered, historyState.yearMonth);
    if (weeks.length === 0) {
      return `【週次営業報告】${formatYearMonth(historyState.yearMonth)}\n報告日: ${getTodayJST()}\nデータがありません`;
    }
    return weeks.map(w => buildWeeklyReportText(w, historyState.yearMonth)).join('\n\n');
  }

  // ── 月次（選択年の全月をループして生成）──
  if (view === 'monthly') {
    const filtered = entries.filter(e => e.date.startsWith(String(historyState.year)));
    const monthMap = groupEntriesByMonth(filtered, historyState.year);
    const months = Array.from({ length: 12 }, (_, i) =>
      `${historyState.year}-${String(i + 1).padStart(2, '0')}`
    );
    const monthsWithData = months.filter(ym => monthMap[ym] && monthMap[ym].length > 0);
    if (monthsWithData.length === 0) {
      return `【月次営業報告】${historyState.year}年\n報告日: ${getTodayJST()}\nデータがありません`;
    }
    return monthsWithData.map(ym => {
      const budget = budgets.find(b => b.yearMonth.slice(0, 7) === ym) || null;
      return buildMonthlyReportText(ym, monthMap[ym], budget);
    }).join('\n\n');
  }

  // ── 日次・四半期・年次 → 当月報告 ──
  const ym = historyState.yearMonth;
  const filtered = entries.filter(e => e.date.startsWith(ym));
  const budget = budgets.find(b => b.yearMonth.slice(0, 7) === ym) || null;
  return buildMonthlyReportText(ym, filtered, budget);
}

function buildWeeklyReportText(week, yearMonth) {
  const totals = calcMonthlyTotals(week.entries);
  const allActions = week.entries.flatMap(e => e.relationshipActions || []);
  const pos = week.entries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
  const neg = week.entries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
  const trust = calcTrustIndex(allActions, pos, neg);
  const importantNotes = week.entries.filter(e => e.notesImportant && e.notes).map(e => `  ・${e.notes}`);
  const insights = week.entries.filter(e => e.insight).map(e => `  気づき: ${e.insight}`);
  const nextActions = week.entries.filter(e => e.nextAction).map(e => `  次の一手: ${e.nextAction}`);

  const kpiLines = KGI_FIELDS.filter(f => f.color === 'cyan' && reportSettings[f.key] !== false).map(f => {
    const val = totals[f.key] || 0;
    const formatted = formatKpiValue(val, f);
    return `  ${f.label.padEnd(12, '　')}: ${formatted}`;
  });

  const lines = [
    `【週次営業報告】${formatYearMonth(yearMonth)} ${week.label}`,
    `報告日: ${getTodayJST()}`,
    '─────────────────────',
  ];
  if (kpiLines.length > 0) { lines.push('■ KPI実績'); lines.push(...kpiLines); }
  if (reportSettings.trustScore) {
    lines.push('■ 信頼関係指数');
    lines.push(`  Trust: ${trust}pt（アクション${allActions.length}件×2 + ポジFB${pos}件×5 - ネガFB${neg}件×3）`);
  }
  if (reportSettings.importantNotes && importantNotes.length > 0) {
    lines.push('■ 重要メモ');
    lines.push(...importantNotes);
  }
  if ((reportSettings.insights || reportSettings.nextActions) && (insights.length > 0 || nextActions.length > 0)) {
    lines.push('■ 気づき・次の一手');
    if (reportSettings.insights) lines.push(...insights);
    if (reportSettings.nextActions) lines.push(...nextActions);
  }
  lines.push('─────────────────────');
  return lines.join('\n');
}

function buildMonthlyReportText(ym, mEntries, budget) {
  const totals = calcMonthlyTotals(mEntries);
  const allActions = mEntries.flatMap(e => e.relationshipActions || []);
  const pos = mEntries.reduce((s, e) => s + (e.positiveFeedback || 0), 0);
  const neg = mEntries.reduce((s, e) => s + (e.negativeFeedback || 0), 0);
  const trust = calcTrustIndex(allActions, pos, neg);
  const importantNotes = mEntries.filter(e => e.notesImportant && e.notes).map(e => `  ・[${e.date}] ${e.notes}`);
  const insights = mEntries.filter(e => e.insight).map(e => `  [${e.date}] ${e.insight}`);
  const nextActions = mEntries.filter(e => e.nextAction).map(e => `  [${e.date}] ${e.nextAction}`);

  const kpiLines = KGI_FIELDS.filter(f => f.color === 'cyan' && reportSettings[f.key] !== false).map(f => {
    const actual = totals[f.key] || 0;
    const plan = budget ? (budget[f.key] || 0) : 0;
    const actualStr = formatKpiValue(actual, f);
    const planStr = plan > 0
      ? ` / ${formatKpiValue(plan, f)}（${Math.round(actual / plan * 100)}%）`
      : '';
    return `  ${f.label.padEnd(12, '　')}: ${actualStr}${planStr}`;
  });

  const lines = [
    `【月次営業報告】${formatYearMonth(ym)}`,
    `報告日: ${getTodayJST()}`,
    '─────────────────────',
  ];
  if (kpiLines.length > 0) { lines.push('■ KPI実績'); lines.push(...kpiLines); }
  if (reportSettings.trustScore) {
    lines.push('■ 信頼関係指数');
    lines.push(`  Trust: ${trust}pt（アクション${allActions.length}件×2 + ポジFB${pos}件×5 - ネガFB${neg}件×3）`);
  }
  if (reportSettings.importantNotes && importantNotes.length > 0) {
    lines.push('■ 重要メモ');
    lines.push(...importantNotes);
  }
  if (reportSettings.insights && insights.length > 0) {
    lines.push('■ 気づき・学び');
    lines.push(...insights);
  }
  if (reportSettings.nextActions && nextActions.length > 0) {
    lines.push('■ 次の一手');
    lines.push(...nextActions);
  }
  lines.push('─────────────────────');
  return lines.join('\n');
}

function showCopyFeedback() {
  const btn = document.getElementById('report-copy-btn');
  btn.disabled = false;
  btn.textContent = 'コピー済み';
  btn.classList.add('btn-save-success');
  setTimeout(() => {
    btn.textContent = '上長報告';
    btn.classList.remove('btn-save-success');
  }, 2000);
}

// ------------------------------------------------------------------
// KGI設定タブ
// ------------------------------------------------------------------

// money:true は金額フィールド。表示は千円（3桁区切り）。
// 判定を unit の文字列比較でやらないこと（単位ラベルを変えた瞬間に壊れる）。
const FORECAST_FIELDS = [
  { key: 'personalUnsettled', label: '個人末見額',   unit: '円', money: true },
  { key: 'officeUnsettled',   label: '営業所末見額', unit: '円', money: true },
];

const KGI_FIELDS = [
  { key: 'inspection',            label: '点検件数',         unit: '件', color: 'cyan' },
  { key: 'promotionAmount',       label: '促進受注額',       unit: '円', money: true, color: 'cyan' },
  { key: 'promotionCount',        label: '促進件数',         unit: '件', color: 'cyan' },
  { key: 'maintenanceThisMonth',  label: '当月保守継続',     unit: '件', color: 'cyan' },
  { key: 'maintenanceNextMonth',  label: '次月保守継続',     unit: '件', color: 'cyan' },
  { key: 'maintenanceNext2Month', label: '次々月保守継続',   unit: '件', color: 'cyan' },
  { key: 'newAcquisition',        label: '新規保守',         unit: '件', color: 'cyan' },
  { key: 'acCleaning',            label: 'エアコン洗浄',     unit: '件', color: 'cyan' },
  { key: 'fullMaintenance',       label: 'フルメンテリース', unit: '件', color: 'cyan' },
  { key: 'tossUp',                label: '営業トスアップ',   unit: '件', color: 'cyan' },
  { key: 'personalPlan',          label: '個人計画額',       unit: '円', money: true, color: 'emerald' },
  { key: 'officePlan',            label: '営業所計画額',     unit: '円', money: true, color: 'amber' },
];

function initKgiTab() {
  const monthInput = document.getElementById('kgi-month');
  monthInput.value = getTodayJST().slice(0, 7);

  buildKgiFields();

  monthInput.addEventListener('change', () => loadBudget(monthInput.value));
  document.getElementById('kgi-save-btn').addEventListener('click', handleSaveBudget);

  // 注力事項
  document.getElementById('save-focus-items-btn').addEventListener('click', async function() {
    const statusEl = document.getElementById('focus-items-status');
    statusEl.textContent = '保存中...';
    try {
      await saveUserSettings({ key: 'focusItems', value: document.getElementById('focus-items-input').value });
      statusEl.textContent = '✓ 保存しました';
    } catch (e) {
      statusEl.textContent = 'エラー: ' + e.message;
    }
    setTimeout(function() { statusEl.textContent = ''; }, 2000);
  });
  getUserSettings().then(function(s) {
    if (s && s.focusItems) document.getElementById('focus-items-input').value = s.focusItems;
  }).catch(function() {});

  loadBudget(monthInput.value);
}

function buildKgiFields() {
  const container = document.getElementById('kgi-fields-container');
  container.innerHTML = '';

  const groups = [
    { color: 'cyan',    fields: KGI_FIELDS.filter(f => f.color === 'cyan') },
    { color: 'emerald', fields: KGI_FIELDS.filter(f => f.color === 'emerald') },
    { color: 'amber',   fields: KGI_FIELDS.filter(f => f.color === 'amber') },
  ];

  groups.forEach(({ color, fields }) => {
    const card = document.createElement('div');
    card.className = `card kgi-card-${color}`;

    fields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'kgi-field-row';
      row.innerHTML = `
        <span class="kgi-field-label">${field.label}</span>
        <div class="kgi-field-input-wrap">
          ${buildKpiInputHtml(field, 'kgi-', 'min="0" inputmode="numeric"')}
          <span class="kgi-field-unit">${field.unit}</span>
        </div>
      `;
      card.appendChild(row);
    });

    container.appendChild(card);
  });

  bindKpiInputs(container);
}

async function loadBudget(yearMonth) {
  if (!yearMonth) return;
  try {
    const data = await getBudget(yearMonth);
    console.log('[loadBudget]', yearMonth, '->', data);
    KGI_FIELDS.forEach(field => {
      const el = document.getElementById(`kgi-${field.key}`);
      setKpiInputValue(el, field, data ? (data[field.key] ?? 0) : 0);
    });
  } catch (e) {
    console.error('[loadBudget] 失敗:', e);
  }
}

async function handleSaveBudget() {
  const btn = document.getElementById('kgi-save-btn');
  const yearMonth = document.getElementById('kgi-month').value;
  if (!yearMonth) return;

  btn.disabled = true;
  btn.textContent = '保存中...';

  const data = { yearMonth };
  KGI_FIELDS.forEach(field => {
    const el = document.getElementById(`kgi-${field.key}`);
    data[field.key] = el ? parseNumericInput(el.value) : 0;
  });

  try {
    const result = await saveBudget(data);
    if (!result || result.success !== true) {
      throw new Error(result && result.error ? result.error : JSON.stringify(result));
    }
    console.log('[saveBudget] 成功:', yearMonth);
    historyState.allData = null; // 履歴キャッシュを無効化
    showSaveFeedback(btn);
    // 保存後にサーバーから再読み込みして確認
    try { await loadBudget(yearMonth); } catch (_) {}
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '保存する';
    console.error('[saveBudget] 失敗:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

function showSaveFeedback(btn) {
  btn.disabled = false;
  btn.textContent = '✓ 保存しました';
  btn.classList.add('btn-save-success');
  setTimeout(() => {
    btn.textContent = '保存する';
    btn.classList.remove('btn-save-success');
  }, 2000);
}

// ------------------------------------------------------------------
// 営業所 日次取込
// ------------------------------------------------------------------

var _officeDailyParsed = null;
var _officeDailyScope  = 'office';

var OFFICE_DAILY_LABELS = {
  activityCount:        '総活動件数',
  promotionCount:       '新規促進件数',
  promotionAcase:       '促進A案件',
  inspectionPlan:       '点検 計画',
  inspectionActual:     '点検 実績',
  renewalNextPlanTop:   '次月継続 計画',
  renewalNextActualTop: '次月継続 実績',
  salesPlan:            '売上 計画',
  salesActual:          '売上 実績',
  salesAcase:           '売上 A案件',
  salesForecast:        '末見通し',
  vsPlan:               '対計画',
  maintActual:          '保守売上 実績',
  maintNew:             '保守 新規',
  maintCont:            '保守 継続',
  totalMaintPlan:       '総保守台数 計画',
  totalMaintActual:     '総保守台数 実績',
  newMaintPlan:         '新規保守台数 計画',
  newMaintActual:       '新規保守台数 実績',
  renewalThisPrev:      '当月継続 前受',
  renewalThisPlan:      '当月継続 計画',
  renewalThisActual:    '当月継続 実績',
  nextMonthBacklog:     '翌月分 受注残',
  nextMonthCase:        '翌月案件',
  renewalNext2Plan:     '次々月継続 計画',
  renewalNext2Actual:   '次々月継続 実績',
  renewalNext2Rate:     '次々月継続 受注率',
  renewalRate:          '継続率',
  shortfall:            '過不足'
};

var OFFICE_ONLY_FIELDS  = ['renewalRate'];
var MEMBER_ONLY_FIELDS  = ['shortfall'];
var OFFICE_RATE_FIELDS  = ['vsPlan', 'renewalRate', 'renewalNext2Rate'];

function _fmtOfficeVal(key, val) {
  var n = Number(val) || 0;
  if (OFFICE_RATE_FIELDS.indexOf(key) >= 0) {
    return Math.floor(n < 5 ? n * 100 : n) + '%';
  }
  return formatNumber(n);
}

function _gaugeRateHtml(plan, actual, showBar) {
  var rate = (plan && plan > 0) ? Math.min(Math.round(actual / plan * 100), 999) : 0;
  var colorClass = getProgressColorClass(rate);
  var color      = getAccentColor(colorClass);
  var pct        = Math.min(rate, 100);
  var html = '<span class="import-rate" style="color:' + color + '">' + rate + '%</span>';
  if (showBar !== false) {
    html += '<div class="progress-bar" style="margin-top:3px">' +
            '<div class="progress-fill ' + colorClass + '" style="width:' + pct + '%"></div></div>';
  }
  return { rate: rate, html: html };
}

// ------------------------------------------------------------------
// 管理タブ
// ------------------------------------------------------------------

var _officeChart = null;
var _officeProgressView = 'monthly';

function initOfficeDashboardTab() {
  document.querySelectorAll('#office-progress-toggle .seg-toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (_officeProgressView === btn.dataset.view) return;
      _officeProgressView = btn.dataset.view;
      document.querySelectorAll('#office-progress-toggle .seg-toggle-btn').forEach(function(b) {
        b.classList.toggle('active', b === btn);
      });
      refreshManagement();
    });
  });
}

async function refreshManagement() {
  var container = document.getElementById('management-container');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px">読み込み中...</div>';

  try {
    var today = getTodayJST();
    var ym    = today.slice(0, 7);
    var rows  = await getOfficeDaily({ dateFrom: ym + '-01', dateTo: ym + '-31', scope: 'office' });

    var officeRows = (rows || []).filter(function(r) { return r.scope === 'office'; });
    if (!officeRows.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0">日次取込からExcelを取り込むとここに表示されます</div>';
      return;
    }

    officeRows.sort(function(a, b) {
      return String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10));
    });
    renderManagementDashboard(officeRows[0], officeRows);
  } catch (e) {
    _renderError(container, '読み込みエラー: ' + e.message);
  }
}

function renderManagementDashboard(entry, officeRows) {
  var container = document.getElementById('management-container');
  if (!container) return;

  var lastDate  = String(entry.date).slice(0, 10);
  var yearMonth = lastDate.slice(0, 7);
  var yesterday = addCalendarDays(lastDate, -1);
  var prevEntry = (officeRows || []).find(function(r) { return String(r.date).slice(0, 10) === yesterday; }) || null;

  var isWeekly    = _officeProgressView === 'weekly';
  var weekStart   = getWeekStartJST();
  var baselineEntry = (officeRows || []).find(function(r) { return String(r.date).slice(0, 10) < weekStart; }) || null;

  function n(key) { return Number(entry[key]) || 0; }
  function pn(key) { return prevEntry ? (Number(prevEntry[key]) || 0) : null; }
  function wn(key) { return n(key) - (baselineEntry ? (Number(baselineEntry[key]) || 0) : 0); }
  function rate(plan, actual) {
    return (plan && plan > 0) ? Math.min(Math.round(actual / plan * 100), 999) : 0;
  }
  function gaugeBlock(label, plan, actual, itemKey, unit, prevActual, weekActual) {
    var displayPlan   = isWeekly ? Math.round(plan / 3) : plan;
    var displayActual = isWeekly ? weekActual : actual;
    var r  = rate(displayPlan, displayActual);
    var cc = getProgressColorClass(r);
    var cl = getAccentColor(cc);
    var html = '<div class="office-gauge-block">' +
           '<div class="office-gauge-row">' +
           '<span class="office-gauge-label">' + label + '</span>' +
           '<span class="office-gauge-vals">' + formatNumber(displayActual) + ' / ' + formatNumber(displayPlan) + '</span>' +
           '<span class="import-rate" style="color:' + cl + '">' + r + '%</span>' +
           '</div>' +
           '<div class="progress-bar"><div class="progress-fill ' + cc + '" style="width:' + Math.min(r,100) + '%"></div></div>';
    if (!isWeekly && itemKey && plan > 0) {
      var pace = buildPaceInfo({
        itemKey: itemKey, plan: plan, actual: actual,
        prevActual: (typeof prevActual === 'number') ? prevActual : null,
        unit: unit, yearMonth: yearMonth, asOfDateStr: lastDate,
      });
      html += '<div class="kgi-pace-line" style="color:' + getAccentColor(pace.colorClass) + '">' + pace.text + '</div>';
    }
    html += '</div>';
    return html;
  }
  function fieldRow(label, val) {
    return '<div class="office-field-row">' +
           '<span class="office-field-label">' + label + '</span>' +
           '<span class="office-field-val">' + val + '</span>' +
           '</div>';
  }

  var vsPlanVal   = n('vsPlan');
  var vsPlanPct   = Math.floor(vsPlanVal   < 5 ? vsPlanVal   * 100 : vsPlanVal);
  var rrVal       = n('renewalRate');
  var rrPct       = Math.floor(rrVal       < 5 ? rrVal       * 100 : rrVal);
  var rn2RateVal  = n('renewalNext2Rate');
  var rn2RatePct  = Math.floor(rn2RateVal  < 5 ? rn2RateVal  * 100 : rn2RateVal);

  var monthEnd = yearMonth + '-' + String(new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate()).padStart(2, '0');
  var remainingBizDays = countBusinessDays(lastDate, monthEnd);
  var remainingDaysText = isWeekly ? '' : '残' + remainingBizDays + '営業日（月末まで）';

  var html = '<div class="mgmt-header">' +
             '<span class="card-title" style="font-size:14px">営業所 日次管理</span>' +
             '<span class="kgi-remaining-days">' + remainingDaysText + '</span>' +
             '<span class="mgmt-last-date">最終取込: ' + lastDate + '</span>' +
             '</div>';

  // 促進
  html += '<div class="office-section">' +
          '<div class="office-section-title">促進</div>' +
          fieldRow('総活動件数', formatNumber(n('activityCount'))) +
          fieldRow('新規促進件数', formatNumber(n('promotionCount'))) +
          fieldRow('促進A案件', formatNumber(n('promotionAcase'))) +
          '</div>';

  // 点検
  html += '<div class="office-section">' +
          '<div class="office-section-title">点検</div>' +
          gaugeBlock('点検', n('inspectionPlan'), n('inspectionActual'), 'office_inspection', '件', pn('inspectionActual'), wn('inspectionActual')) +
          '</div>';

  // 売上
  var forecastVal = _officeSalesForecast(entry);
  var prevForecastVal = prevEntry ? _officeSalesForecast(prevEntry) : null;
  var weekForecastVal = forecastVal - (baselineEntry ? _officeSalesForecast(baselineEntry) : 0);
  var fRate = rate(n('salesPlan'), forecastVal);
  html += '<div class="office-section">' +
          '<div class="office-section-title">売上</div>' +
          gaugeBlock('売上 実績', n('salesPlan'), n('salesActual'), null, null, null, wn('salesActual')) +
          gaugeBlock('末見通し', n('salesPlan'), forecastVal, 'office_forecast', '円', prevForecastVal, weekForecastVal) +
          fieldRow('A案件', formatNumber(n('salesAcase'))) +
          fieldRow('対計画率', '<span style="color:' + getAccentColor(getProgressColorClass(vsPlanPct)) + '">' + vsPlanPct + '%</span>') +
          '</div>';

  // 保守
  html += '<div class="office-section">' +
          '<div class="office-section-title">保守</div>' +
          gaugeBlock('総保守台数', n('totalMaintPlan'), n('totalMaintActual'), 'office_totalMaint', '台', pn('totalMaintActual'), wn('totalMaintActual')) +
          gaugeBlock('新規保守台数', n('newMaintPlan'), n('newMaintActual'), 'office_newMaint', '台', pn('newMaintActual'), wn('newMaintActual')) +
          fieldRow('保守売上 実績', formatNumber(n('maintActual'))) +
          fieldRow('保守 新規', formatNumber(n('maintNew'))) +
          fieldRow('保守 継続', formatNumber(n('maintCont'))) +
          '</div>';

  // 継続
  html += '<div class="office-section">' +
          '<div class="office-section-title">継続</div>' +
          gaugeBlock('次月継続', n('renewalNextPlanTop'), n('renewalNextActualTop'), 'office_renewalNext', '件', pn('renewalNextActualTop'), wn('renewalNextActualTop')) +
          gaugeBlock('当月継続', n('renewalThisPlan'), n('renewalThisActual'), 'office_renewalThis', '件', pn('renewalThisActual'), wn('renewalThisActual')) +
          fieldRow('当月継続 前受', formatNumber(n('renewalThisPrev'))) +
          fieldRow('当月継続 計画', formatNumber(n('renewalThisPlan'))) +
          fieldRow('当月継続 実績', formatNumber(n('renewalThisActual'))) +
          fieldRow('継続率', '<span style="color:' + getAccentColor(getProgressColorClass(rrPct)) + '">' + rrPct + '%</span>') +
          '</div>';

  // 翌月以降
  html += '<div class="office-section office-section-next">' +
          '<div class="office-section-title">翌月以降</div>' +
          fieldRow('翌月分 受注残', formatNumber(n('nextMonthBacklog'))) +
          fieldRow('翌月案件', formatNumber(n('nextMonthCase'))) +
          gaugeBlock('次々月継続', n('renewalNext2Plan'), n('renewalNext2Actual'), 'office_renewalNext2', '件', pn('renewalNext2Actual'), wn('renewalNext2Actual')) +
          fieldRow('次々月継続受注率', '<span style="color:' + getAccentColor(getProgressColorClass(rn2RatePct)) + '">' + rn2RatePct + '%</span>') +
          '</div>';

  // KPIチャート
  html += '<div class="card" style="margin-top:10px">' +
          '<div class="card-title">KPI達成率</div>' +
          '<div class="office-kpi-wrap"><canvas id="office-kpi-chart"></canvas></div>' +
          '</div>';

  container.innerHTML = html;
  _renderKpiAlerts(entry, container);
  renderOfficeKpiChart(entry);
}

function _renderKpiAlerts(entry, container) {
  var WATCH = [
    { planKey: 'inspectionPlan',     actualKey: 'inspectionActual',    label: '点検' },
    { planKey: 'salesPlan',          actualKey: 'salesActual',         label: '売上' },
    { planKey: 'renewalNextPlanTop', actualKey: 'renewalNextActualTop',label: '次月継続' },
    { planKey: 'totalMaintPlan',     actualKey: 'totalMaintActual',    label: '総保守台数' }
  ];
  var alerts = WATCH.filter(function(w) {
    var plan   = Number(entry[w.planKey])   || 0;
    var actual = Number(entry[w.actualKey]) || 0;
    return plan > 0 && (actual / plan * 100) < 40;
  }).map(function(w) { return w.label; });

  if (!alerts.length) return;
  var banner = document.createElement('div');
  banner.className = 'kpi-alert-banner';
  banner.textContent = '⚠️ 達成率40%未満: ' + alerts.join(' / ');
  container.insertBefore(banner, container.firstChild);
}

function renderOfficeKpiChart(entry) {
  var canvas = document.getElementById('office-kpi-chart');
  if (!canvas) return;
  if (_officeChart) { _officeChart.destroy(); _officeChart = null; }

  function n(key) { return Number(entry[key]) || 0; }
  function pct(plan, actual) {
    return (plan && plan > 0) ? Math.min(Math.round(actual / plan * 100), 999) : 0;
  }

  var items = [
    { label: '点検',      rate: pct(n('inspectionPlan'),      n('inspectionActual')) },
    { label: '売上',      rate: pct(n('salesPlan'),           n('salesActual')) },
    { label: '末見通し',  rate: pct(n('salesPlan'),           _officeSalesForecast(entry)) },
    { label: '総保守台数', rate: pct(n('totalMaintPlan'),     n('totalMaintActual')) },
    { label: '次月継続',  rate: pct(n('renewalNextPlanTop'),  n('renewalNextActualTop')) }
  ].filter(function(item) { return item.rate > 0; });

  if (!items.length) return;

  var colors = items.map(function(item) { return getAccentColor(getProgressColorClass(item.rate)); });

  _officeChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(function(i) { return i.label; }),
      datasets: [{
        data: items.map(function(i) { return i.rate; }),
        backgroundColor: colors.map(function(c) { return c + '33'; }),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          min: 0, max: 120,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 },
            callback: function(v) { return v + '%'; } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#cbd5e1', font: { size: 11 } }
        }
      }
    }
  });
}

// ------------------------------------------------------------------
// 営業所 取込タブ（売上計画）
// ------------------------------------------------------------------

var _officeSalesPlanParsed = null;
var _officePlanScope = 'office';

var OFFICE_SALES_PLAN_LABELS = {
  renewalTargetUnits:    '継続対象台数',
  renewalPlanUnits:      '継続計画台数',
  renewalPlanAmount:     '継続計画金額',
  newPlanUnits:          '新規計画台数',
  newPlanAmount:         '新規計画金額',
  maintenancePlanUnits:  '保守計画台数',
  maintenancePlanAmount: '保守計画金額',
  inspectionPlanUnits:   '点検計画台数',
  prepaidNew:            '前受（新規）',
  prepaidCont:           '前受（継続）',
  callPlan:              'コール計画',
  repairPlan:            '修理計画',
  serPromoPlan:          '促進修理計画',
  totalSalesPlan:        '総売上計画',
  annualSalesPlan:       '営業年計',
};

function initOfficeImportTab() {
  var btn  = document.getElementById('btn-office-plan-import');
  var file = document.getElementById('office-plan-file');
  if (!btn || !file) return;

  btn.addEventListener('click', function() { file.click(); });
  file.addEventListener('change', onOfficePlanFileSelect);

  document.getElementById('office-plan-cancel')
    .addEventListener('click', closeOfficePlanModal);
  document.getElementById('office-plan-save')
    .addEventListener('click', saveOfficePlanFromModal);

  document.querySelectorAll('#office-plan-modal .modal-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('#office-plan-modal .modal-tab')
        .forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      _officePlanScope = tab.dataset.scope;
      document.getElementById('office-plan-member-select-wrap').style.display =
        (_officePlanScope === 'member') ? 'block' : 'none';
      renderOfficePlanFields();
    });
  });

  var memberSel = document.getElementById('office-plan-member-select');
  if (memberSel) memberSel.addEventListener('change', renderOfficePlanFields);
}

async function onOfficePlanFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    await _ensureXlsx();
    var buf = await file.arrayBuffer();
    var wb  = XLSX.read(new Uint8Array(buf), { type: 'array' });
    _officeSalesPlanParsed = parseSalesPlan(wb);
    openOfficePlanConfirm(_officeSalesPlanParsed);
  } catch (err) {
    alert('取込エラー: ' + err.message);
  }
}

function openOfficePlanConfirm(parsed) {
  document.getElementById('office-plan-yearmonth').textContent = parsed.yearMonth;
  _officePlanScope = 'office';
  document.querySelectorAll('#office-plan-modal .modal-tab').forEach(function(t, i) {
    t.classList.toggle('active', i === 0);
  });
  document.getElementById('office-plan-member-select-wrap').style.display = 'none';
  renderOfficePlanFields();
  document.getElementById('office-plan-modal').style.display = 'flex';
}

function renderOfficePlanFields() {
  var container = document.getElementById('office-plan-fields');
  var isOffice  = (_officePlanScope === 'office');
  var data;

  if (isOffice) {
    data = _officeSalesPlanParsed ? _officeSalesPlanParsed.office : {};
  } else {
    var memberId = document.getElementById('office-plan-member-select').value;
    data = (_officeSalesPlanParsed ? _officeSalesPlanParsed.members : [])
           .find(function(m) { return m.memberId === memberId; }) || {};
  }

  function v(key) { return (data[key] !== undefined) ? data[key] : 0; }

  function simpleRow(key) {
    return '<div class="office-field-row">' +
           '<span class="office-field-label">' + (OFFICE_SALES_PLAN_LABELS[key] || key) + '</span>' +
           '<input class="office-field-input plan-field-input" type="number" step="any"' +
           ' data-key="' + key + '" value="' + v(key) + '">' +
           '</div>';
  }

  var html = '';

  // KGIタブ9項目のうち取込元セルが空だった項目があれば警告（取込自体はブロックしない）
  var missing = (isOffice && _officeSalesPlanParsed) ? (_officeSalesPlanParsed.missingFields || []) : [];
  if (missing.length) {
    html += '<div style="color:var(--accent-amber, #d97706);font-size:12px;margin-bottom:8px">' +
            '⚠ 以下の項目が日計表上で空欄でした（取込はそのまま実行できます。反映後にKGIタブで手入力してください）：' +
            missing.map(function(k) { return OFFICE_SALES_PLAN_LABELS[k] || k; }).join('、') +
            '</div>';
  }

  html += '<div class="office-section"><div class="office-section-title">保守</div>' +
          simpleRow('maintenancePlanUnits') +
          simpleRow('maintenancePlanAmount') +
          simpleRow('renewalTargetUnits') +
          simpleRow('renewalPlanUnits') +
          simpleRow('renewalPlanAmount') +
          simpleRow('newPlanUnits') +
          simpleRow('newPlanAmount') +
          '</div>';

  html += '<div class="office-section"><div class="office-section-title">点検</div>' +
          simpleRow('inspectionPlanUnits') +
          '</div>';

  html += '<div class="office-section"><div class="office-section-title">前受</div>' +
          simpleRow('prepaidNew') +
          simpleRow('prepaidCont') +
          '</div>';

  html += '<div class="office-section"><div class="office-section-title">有償</div>' +
          simpleRow('callPlan') +
          simpleRow('repairPlan') +
          simpleRow('serPromoPlan') +
          '</div>';

  html += '<div class="office-section"><div class="office-section-title">集計</div>' +
          simpleRow('totalSalesPlan') +
          (isOffice ? simpleRow('annualSalesPlan') : '') +
          '</div>';

  container.innerHTML = html;
}

function _collectPlanFields() {
  var result = {};
  document.querySelectorAll('#office-plan-fields .plan-field-input').forEach(function(f) {
    result[f.dataset.key] = parseFloat(f.value) || 0;
  });
  return result;
}

function closeOfficePlanModal() {
  document.getElementById('office-plan-modal').style.display = 'none';
  _officeSalesPlanParsed = null;
}

async function saveOfficePlanFromModal() {
  var saveBtn = document.getElementById('office-plan-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    var p        = _officeSalesPlanParsed;
    var now      = p.importedAt;
    var src      = p.source;
    var ym       = p.yearMonth;
    var modified = _collectPlanFields();

    if (_officePlanScope === 'office') {
      Object.assign(p.office, modified);
    } else {
      var mid = document.getElementById('office-plan-member-select').value;
      var m = p.members.find(function(x) { return x.memberId === mid; });
      if (m) Object.assign(m, modified);
    }

    var officeEntry = Object.assign(
      { yearMonth: ym, scope: 'office', memberId: '', memberName: '', source: src, importedAt: now },
      p.office
    );
    var memberEntries = p.members.map(function(mem) {
      return Object.assign(
        { yearMonth: ym, scope: 'member', source: src, importedAt: now },
        mem
      );
    });

    await saveOfficeSalesPlan([officeEntry].concat(memberEntries));
    closeOfficePlanModal();

    var missing = p.missingFields || [];
    var fb = document.getElementById('office-plan-import-feedback');
    if (fb) {
      fb.textContent = missing.length
        ? '✓ 取込完了 (' + ym + ') ※未入力項目あり: ' + missing.map(function(k) { return OFFICE_SALES_PLAN_LABELS[k] || k; }).join('、')
        : '✓ 取込完了 (' + ym + ')';
      fb.style.color = missing.length ? 'var(--accent-amber, #d97706)' : 'var(--accent-emerald)';
      fb.style.fontSize = '13px';
      fb.style.marginTop = '8px';
      setTimeout(function() { if (fb) fb.textContent = ''; }, 5000);
    }

    // KGIタブが読み込み済みならlocation.reload不使用で最新値に反映（進捗タブと同じ「表示時に再読込」パターンも維持）
    if (document.getElementById('office-kgi-fields')) loadOfficeKgi();
  } catch (err) {
    alert('保存エラー: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存する';
  }
}

// ------------------------------------------------------------------
// 営業所 履歴タブ（B-2）
// ------------------------------------------------------------------

function _officeSalesForecast(e) {
  return (Number(e.salesActual) || 0) + (Number(e.salesAcase) || 0);
}

var _OFFICE_KPI_DEFS = [
  { id: 'inspection', label: '点検',    planKey: 'inspectionPlan',    actualKey: 'inspectionActual',    unit: '件' },
  { id: 'sales',      label: '売上',    planKey: 'salesPlan',         actualKey: 'salesActual',         unit: '円',
    forecastCalc: _officeSalesForecast, showForecast: true },
  { id: 'renewal',    label: '次月継続', planKey: 'renewalNextPlanTop', actualKey: 'renewalNextActualTop', unit: '件' },
  { id: 'maint',      label: '保全',    planKey: 'totalMaintPlan',    actualKey: 'totalMaintActual',    unit: '件' },
];

var officeReportSettings = {
  inspection:   true,
  sales:        true,
  renewal:      true,
  maint:        true,
  showDelta:    true,
  showForecast: true,
};

const officeHistState = {
  view:          'daily',
  yearMonth:     getCurrentYearMonthJST(),
  year:          Number(getTodayJST().slice(0, 4)),
  quarter:       'all',
  date:          getTodayJST(),
  weekIndex:     1,
  allData:       null,
  compareMode:   false,
  comparePeriod: { yearMonth: '', year: 0, quarter: 'all', date: '', weekYearMonth: '', weekIndex: 1 },
};

function initOfficeHistoryTab() {
  document.getElementById('office-hist-view-select').addEventListener('change', _onOfficeHistViewChange);
  document.querySelector('[data-tab="tab-office-history"]').addEventListener('click', function() {
    _renderOfficeHistPeriodControl();
    renderOfficeHistContent();
  });
  document.getElementById('office-report-csv-btn').addEventListener('click',      _handleOfficeHistCsv);
  document.getElementById('office-report-print-btn').addEventListener('click',    _handleOfficeHistPrint);
  document.getElementById('office-report-copy-btn').addEventListener('click',     _handleOfficeHistCopy);
  document.getElementById('office-report-settings-btn').addEventListener('click', _toggleOfficeReportSettings);
  document.getElementById('office-hist-compare-btn').addEventListener('click',    _onOfficeHistCompareModeToggle);
  _buildOfficeReportSettingsPanel();
  _renderOfficeHistPeriodControl();
}

async function refreshOfficeHistory() {
  _renderOfficeHistPeriodControl();
  await renderOfficeHistContent();
}

function _onOfficeHistViewChange() {
  officeHistState.view = document.getElementById('office-hist-view-select').value;
  _renderOfficeHistPeriodControl();
  renderOfficeHistContent();
}

function _onOfficeHistPeriodChange() {
  const view = officeHistState.view;
  if (view === 'daily') {
    if (officeHistState.compareMode) {
      const dEl = document.getElementById('office-hist-date-input');
      if (dEl && dEl.value) { officeHistState.date = dEl.value; officeHistState.yearMonth = dEl.value.slice(0, 7); }
    } else {
      officeHistState.yearMonth = document.getElementById('office-hist-month-input').value || getCurrentYearMonthJST();
    }
  } else if (view === 'weekly') {
    const mEl = document.getElementById('office-hist-month-input');
    const wEl = document.getElementById('office-hist-week-select');
    if (mEl) officeHistState.yearMonth = mEl.value || getCurrentYearMonthJST();
    if (wEl) officeHistState.weekIndex = Number(wEl.value) || 1;
  } else if (view === 'quarterly') {
    const yearEl = document.getElementById('office-hist-year-input');
    const qEl   = document.getElementById('office-hist-quarter-select');
    if (yearEl) officeHistState.year    = Number(yearEl.value) || Number(getTodayJST().slice(0, 4));
    if (qEl)   officeHistState.quarter = qEl.value;
  } else {
    officeHistState.year = Number(document.getElementById('office-hist-year-input').value) || Number(getTodayJST().slice(0, 4));
  }
  renderOfficeHistContent();
}

function _onOfficeHistCmpPeriodChange() {
  const view = officeHistState.view;
  const cp = officeHistState.comparePeriod;
  if (view === 'daily') {
    const el = document.getElementById('office-hist-cmp-date-input');
    if (el) cp.date = el.value || officeHistState.date;
  } else if (view === 'weekly') {
    const mEl = document.getElementById('office-hist-cmp-month-input');
    const wEl = document.getElementById('office-hist-cmp-week-select');
    if (mEl) cp.weekYearMonth = mEl.value || officeHistState.yearMonth;
    if (wEl) cp.weekIndex = Number(wEl.value) || 1;
  } else if (view === 'monthly' || view === 'yearly') {
    const el = document.getElementById('office-hist-cmp-year-input');
    if (el) cp.year = Number(el.value) || (officeHistState.year - 1);
  } else if (view === 'quarterly') {
    const yEl = document.getElementById('office-hist-cmp-year-input');
    const qEl = document.getElementById('office-hist-cmp-quarter-select');
    if (yEl) cp.year    = Number(yEl.value) || (officeHistState.year - 1);
    if (qEl) cp.quarter = qEl.value;
  }
  renderOfficeHistContent();
}

function _renderOfficeHistPeriodControl() {
  const container = document.getElementById('office-hist-period-control');
  if (!container) return;
  const view = officeHistState.view;
  const cp = officeHistState.comparePeriod;
  const cm = officeHistState.compareMode;

  function _weekOpts(sel) {
    return [1,2,3,4,5].map(function(n) {
      return '<option value="' + n + '"' + (sel === n ? ' selected' : '') + '>第' + n + '週</option>';
    }).join('');
  }
  function _qOpts(sel) {
    return [['all','全四半期'],['Q1','Q1（1〜3月）'],['Q2','Q2（4〜6月）'],['Q3','Q3（7〜9月）'],['Q4','Q4（10〜12月）']].map(function(p) {
      return '<option value="' + p[0] + '"' + (sel === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');
  }

  function _mainHTML() {
    if (cm) {
      if (view === 'daily') {
        return '<input type="date" id="office-hist-date-input" value="' + officeHistState.date + '" />';
      } else if (view === 'weekly') {
        return '<input type="month" id="office-hist-month-input" value="' + officeHistState.yearMonth + '" style="flex:1" />' +
               '<select id="office-hist-week-select" style="flex:1">' + _weekOpts(officeHistState.weekIndex) + '</select>';
      } else if (view === 'monthly') {
        return '<input type="number" id="office-hist-year-input" value="' + officeHistState.year + '" min="2020" max="2040" />';
      } else if (view === 'quarterly') {
        return '<input type="number" id="office-hist-year-input" value="' + officeHistState.year + '" min="2020" max="2040" style="flex:1" />' +
               '<select id="office-hist-quarter-select" style="flex:1">' + _qOpts(officeHistState.quarter) + '</select>';
      } else if (view === 'yearly') {
        return '<input type="number" id="office-hist-year-input" value="' + officeHistState.year + '" min="2020" max="2040" />';
      }
      return '';
    }
    if (view === 'daily' || view === 'weekly') {
      return '<input type="month" id="office-hist-month-input" value="' + officeHistState.yearMonth + '" />';
    } else if (view === 'quarterly') {
      return '<input type="number" id="office-hist-year-input" value="' + officeHistState.year + '" min="2020" max="2040" style="flex:1" />' +
             '<select id="office-hist-quarter-select" style="flex:1">' + _qOpts(officeHistState.quarter) + '</select>';
    } else if (view !== 'yearly') {
      return '<input type="number" id="office-hist-year-input" value="' + officeHistState.year + '" min="2020" max="2040" />';
    }
    return '';
  }

  function _cmpHTML() {
    if (view === 'daily') {
      var dd = new Date(officeHistState.date); dd.setDate(dd.getDate() - 1);
      var v = cp.date || dd.toISOString().slice(0, 10);
      return '<input type="date" id="office-hist-cmp-date-input" value="' + v + '" />';
    } else if (view === 'weekly') {
      var vm = cp.weekYearMonth || cp.yearMonth || officeHistState.yearMonth;
      var vw = cp.weekIndex || 1;
      return '<input type="month" id="office-hist-cmp-month-input" value="' + vm + '" style="flex:1" />' +
             '<select id="office-hist-cmp-week-select" style="flex:1">' + _weekOpts(vw) + '</select>';
    } else if (view === 'monthly' || view === 'yearly') {
      var v2 = cp.year || (officeHistState.year - 1);
      return '<input type="number" id="office-hist-cmp-year-input" value="' + v2 + '" min="2020" max="2040" />';
    } else if (view === 'quarterly') {
      var cy = cp.year || (officeHistState.year - 1);
      var cq = cp.quarter || 'Q4';
      return '<input type="number" id="office-hist-cmp-year-input" value="' + cy + '" min="2020" max="2040" style="flex:1" />' +
             '<select id="office-hist-cmp-quarter-select" style="flex:1">' + _qOpts(cq) + '</select>';
    }
    return '';
  }

  if (cm) {
    container.innerHTML =
      '<div class="cmp-period-row">' +
        '<span class="cmp-period-label">当期</span>' +
        '<div class="cmp-period-inputs">' + _mainHTML() + '</div>' +
      '</div>' +
      '<div class="cmp-period-row">' +
        '<span class="cmp-period-label cmp-period-label-base">比較</span>' +
        '<div class="cmp-period-inputs">' + _cmpHTML() + '</div>' +
      '</div>';
  } else {
    container.innerHTML = _mainHTML();
  }

  var dIn  = document.getElementById('office-hist-date-input');
  var mIn  = document.getElementById('office-hist-month-input');
  var wSel = document.getElementById('office-hist-week-select');
  var yIn  = document.getElementById('office-hist-year-input');
  var qSel = document.getElementById('office-hist-quarter-select');
  if (dIn)  dIn.addEventListener('change', _onOfficeHistPeriodChange);
  if (mIn)  mIn.addEventListener('change', _onOfficeHistPeriodChange);
  if (wSel) wSel.addEventListener('change', _onOfficeHistPeriodChange);
  if (yIn)  yIn.addEventListener('change', _onOfficeHistPeriodChange);
  if (qSel) qSel.addEventListener('change', _onOfficeHistPeriodChange);

  var cdIn  = document.getElementById('office-hist-cmp-date-input');
  var cmIn  = document.getElementById('office-hist-cmp-month-input');
  var cwSel = document.getElementById('office-hist-cmp-week-select');
  var cyIn  = document.getElementById('office-hist-cmp-year-input');
  var cqSel = document.getElementById('office-hist-cmp-quarter-select');
  if (cdIn)  cdIn.addEventListener('change', _onOfficeHistCmpPeriodChange);
  if (cmIn)  cmIn.addEventListener('change', _onOfficeHistCmpPeriodChange);
  if (cwSel) cwSel.addEventListener('change', _onOfficeHistCmpPeriodChange);
  if (cyIn)  cyIn.addEventListener('change', _onOfficeHistCmpPeriodChange);
  if (cqSel) cqSel.addEventListener('change', _onOfficeHistCmpPeriodChange);
}

async function ensureOfficeHistData() {
  if (!officeHistState.allData) {
    const rows = await getAllOfficeData();
    officeHistState.allData = (rows || []);
  }
}

async function renderOfficeHistContent() {
  const container = document.getElementById('office-history-container');
  if (!container) return;
  container.innerHTML = '<div class="hist-empty">読み込み中...</div>';
  try {
    await ensureOfficeHistData();
    const rows = officeHistState.allData;
    const view = officeHistState.view;
    if (view === 'daily') {
      const filtered = rows.filter(function(r) { return String(r.date).startsWith(officeHistState.yearMonth); });
      _renderOfficeDailyView(filtered, container);
    } else if (view === 'weekly') {
      const filtered = rows.filter(function(r) { return String(r.date).startsWith(officeHistState.yearMonth); });
      _renderOfficeWeeklyView(filtered, container);
    } else if (view === 'monthly') {
      const filtered = rows.filter(function(r) { return String(r.date).startsWith(String(officeHistState.year)); });
      _renderOfficeMonthlyView(filtered, container);
    } else if (view === 'quarterly') {
      const filtered = rows.filter(function(r) { return String(r.date).startsWith(String(officeHistState.year)); });
      _renderOfficeQuarterlyView(filtered, container);
    } else {
      _renderOfficeYearlyView(rows, container);
    }
    _renderOfficeCompareContent(view);
  } catch (e) {
    _renderError(container, '読み込みエラー: ' + e.message);
  }
}

function _groupOfficeByWeek(entries) {
  const weeks = {};
  entries.forEach(function(e) {
    const p   = String(e.date).split('-').map(Number);
    const d   = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    const dow = d.getUTCDay() || 7;
    const mon = new Date(d.getTime() - (dow - 1) * 86400000);
    const key = mon.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(e);
  });
  return Object.entries(weeks).sort(function(a, b) { return a[0].localeCompare(b[0]); }).map(function(kv) {
    var latest = kv[1].reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, kv[1][0]);
    return { weekStart: kv[0], entries: kv[1], latest: latest };
  });
}

function _groupOfficeByMonth(entries) {
  const months = {};
  entries.forEach(function(e) {
    const ym = String(e.date).slice(0, 7);
    if (!months[ym]) months[ym] = [];
    months[ym].push(e);
  });
  return Object.entries(months).sort(function(a, b) { return a[0].localeCompare(b[0]); }).map(function(kv) {
    var latest = kv[1].reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, kv[1][0]);
    return { ym: kv[0], entries: kv[1], latest: latest };
  });
}

function _groupOfficeByQuarter(entries) {
  const quarters = { Q1: [], Q2: [], Q3: [], Q4: [] };
  entries.forEach(function(e) {
    const month = Number(String(e.date).slice(5, 7));
    if (month <= 3) quarters.Q1.push(e);
    else if (month <= 6) quarters.Q2.push(e);
    else if (month <= 9) quarters.Q3.push(e);
    else quarters.Q4.push(e);
  });
  return quarters;
}

function _renderOfficeQuarterlyView(entries, container) {
  var year     = officeHistState.year;
  var selectedQ = officeHistState.quarter;
  var quarters = _groupOfficeByQuarter(entries);
  var allQDefs = [
    { key: 'Q1', label: 'Q1（1月〜3月）'   },
    { key: 'Q2', label: 'Q2（4月〜6月）'   },
    { key: 'Q3', label: 'Q3（7月〜9月）'   },
    { key: 'Q4', label: 'Q4（10月〜12月）' },
  ];
  var qDefs = selectedQ === 'all' ? allQDefs : allQDefs.filter(function(q) { return q.key === selectedQ; });
  var cards = [];
  qDefs.forEach(function(qDef) {
    var qEntries = quarters[qDef.key];
    if (!qEntries.length) return;
    var latest = qEntries.reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, qEntries[0]);

    // 月別内訳（折りたたみ）
    var monthMap = _groupOfficeByMonth(qEntries).reverse();
    var monthBreakdown = '';
    if (monthMap.length > 1) {
      var rows = monthMap.map(function(m) {
        var parts = _OFFICE_KPI_DEFS.map(function(d) {
          var r = _calcOfficeKpiRate(m.latest, d);
          if (r === null) return '';
          var cl = getAccentColor(getProgressColorClass(r));
          return '<span style="color:' + cl + '">' + d.label + ' ' + r + '%</span>';
        }).filter(Boolean).join(' / ');
        var forecastPart = (function() {
          var fd = _OFFICE_KPI_DEFS.find(function(d) { return d.showForecast && d.forecastCalc; });
          if (!fd) return '';
          var fc = fd.forecastCalc(m.latest);
          var fp = Number(m.latest[fd.planKey]) || 0;
          var fr = fp > 0 ? Math.min(Math.round(fc / fp * 100), 999) : null;
          var fcl = fr !== null ? getAccentColor(getProgressColorClass(fr)) : 'var(--text-muted)';
          return '<span style="color:' + fcl + ';font-weight:700">末見通し ' + formatCurrency(fc) + (fr !== null ? '(' + fr + '%)' : '') + '</span>';
        })();
        return '<div style="font-size:11px;padding:2px 0;color:var(--text-secondary)">' + formatYearMonth(m.ym) + ': ' + (parts || '—') +
          (forecastPart ? ' / ' + forecastPart : '') + '</div>';
      }).join('');
      monthBreakdown = '<details style="margin-top:8px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">月別内訳を見る</summary>' +
        '<div style="padding:4px 0">' + rows + '</div></details>';
    }
    cards.push(_buildOfficeHistoryCard(latest, year + '年 ' + qDef.label + '（期末実績）', { extra: monthBreakdown }));
  });
  if (!cards.length) {
    container.innerHTML = '<div class="hist-empty">' + year + '年' + (selectedQ !== 'all' ? ' ' + selectedQ : '') + 'のデータはありません</div>';
    return;
  }
  container.innerHTML = cards.join('');
}

function _renderOfficeDailyView(entries, container) {
  if (!entries.length) { container.innerHTML = '<div class="hist-empty">この月のデータはありません</div>'; return; }
  const sorted = entries.slice().sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });
  container.innerHTML = sorted.map(function(e) { return _buildOfficeHistoryCard(e); }).join('');
}

function _renderOfficeWeeklyView(entries, container) {
  var weeks = _groupOfficeByWeek(entries).reverse(); // 新→旧
  if (!weeks.length) { container.innerHTML = '<div class="hist-empty">この月のデータはありません</div>'; return; }

  var ym        = officeHistState.yearMonth;
  var currentYM = getCurrentYearMonthJST();
  var allData   = officeHistState.allData || [];

  // 第1週の prevEntry 用：前月末データを検索
  var prevMonthYM = (function() {
    var p = ym.split('-').map(Number);
    var m = p[1] - 1, y = p[0];
    if (m === 0) { m = 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  })();
  var pmEntries = allData.filter(function(r) { return String(r.date).startsWith(prevMonthYM); });
  var pmLatest  = pmEntries.length
    ? pmEntries.reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, pmEntries[0])
    : null;

  container.innerHTML = weeks.map(function(w, i) {
    // weeks は新→旧なので、weeks[i+1] が「前週」
    var prevEntry = i < weeks.length - 1 ? weeks[i + 1].latest : pmLatest;
    var weekLabel = w.weekStart + ' 〜 ' + String(w.latest.date).slice(0, 10);

    var paceInfo = null;
    if (ym === currentYM) {
      var ep    = calcElapsedPct(ym);
      var rates = _OFFICE_KPI_DEFS.map(function(d) { return _calcOfficeKpiRate(w.latest, d); }).filter(function(r) { return r !== null; });
      if (rates.length) {
        var avg = Math.round(rates.reduce(function(s, r) { return s + r; }, 0) / rates.length);
        paceInfo = { elapsedPct: ep, badge: calcPaceBadge(avg, ep) };
      }
    }
    return _buildOfficeHistoryCard(w.latest, weekLabel, { prevEntry: prevEntry, paceInfo: paceInfo });
  }).join('');
}

function _renderOfficeMonthlyView(entries, container) {
  var allMonths = _groupOfficeByMonth(entries).reverse(); // 新→旧
  if (!allMonths.length) { container.innerHTML = '<div class="hist-empty">この年のデータはありません</div>'; return; }

  var currentYM = getCurrentYearMonthJST();
  var allData   = officeHistState.allData || [];

  container.innerHTML = allMonths.map(function(m, i) {
    // allMonths は新→旧なので、[i+1] が「前月」
    var prevEntry = null;
    if (i < allMonths.length - 1) {
      prevEntry = allMonths[i + 1].latest;
    } else {
      // 最古月の前月を全データから探す
      var prevYM = (function() {
        var p = m.ym.split('-').map(Number);
        var pm = p[1] - 1, py = p[0];
        if (pm === 0) { pm = 12; py--; }
        return py + '-' + String(pm).padStart(2, '0');
      })();
      var prevEs = allData.filter(function(r) { return String(r.date).startsWith(prevYM); });
      if (prevEs.length) prevEntry = prevEs.reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, prevEs[0]);
    }

    var paceInfo = null;
    if (m.ym === currentYM) {
      var ep    = calcElapsedPct(m.ym);
      var rates = _OFFICE_KPI_DEFS.map(function(d) { return _calcOfficeKpiRate(m.latest, d); }).filter(function(r) { return r !== null; });
      if (rates.length) {
        var avg = Math.round(rates.reduce(function(s, r) { return s + r; }, 0) / rates.length);
        paceInfo = { elapsedPct: ep, badge: calcPaceBadge(avg, ep) };
      }
    }

    var monthLabel = formatYearMonth(m.ym) + (m.ym < currentYM ? '（月末実績）' : '');
    return _buildOfficeHistoryCard(m.latest, monthLabel, { prevEntry: prevEntry, paceInfo: paceInfo });
  }).join('');
}

function _renderOfficeYearlyView(entries, container) {
  var years = {};
  entries.forEach(function(e) {
    var y = String(e.date).slice(0, 4);
    if (!years[y]) years[y] = [];
    years[y].push(e);
  });
  var list = Object.entries(years).sort(function(a, b) { return b[0].localeCompare(a[0]); }).map(function(kv) {
    var latest = kv[1].reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, kv[1][0]);
    return { year: kv[0], entries: kv[1], latest: latest };
  });
  if (!list.length) { container.innerHTML = '<div class="hist-empty">データがありません</div>'; return; }
  container.innerHTML = list.map(function(y) {
    var monthMap = _groupOfficeByMonth(y.entries).reverse();
    var monthBreakdown = '';
    if (monthMap.length > 1) {
      var rows = monthMap.map(function(m) {
        var parts = _OFFICE_KPI_DEFS.map(function(d) {
          var r = _calcOfficeKpiRate(m.latest, d);
          if (r === null) return '';
          var cl = getAccentColor(getProgressColorClass(r));
          return '<span style="color:' + cl + '">' + d.label + ' ' + r + '%</span>';
        }).filter(Boolean).join(' / ');
        var forecastPart = (function() {
          var fd = _OFFICE_KPI_DEFS.find(function(d) { return d.showForecast && d.forecastCalc; });
          if (!fd) return '';
          var fc = fd.forecastCalc(m.latest);
          var fp = Number(m.latest[fd.planKey]) || 0;
          var fr = fp > 0 ? Math.min(Math.round(fc / fp * 100), 999) : null;
          var fcl = fr !== null ? getAccentColor(getProgressColorClass(fr)) : 'var(--text-muted)';
          return '<span style="color:' + fcl + ';font-weight:700">末見通し ' + formatCurrency(fc) + (fr !== null ? '(' + fr + '%)' : '') + '</span>';
        })();
        return '<div style="font-size:11px;padding:2px 0;color:var(--text-secondary)">' + formatYearMonth(m.ym) + ': ' + (parts || '—') +
          (forecastPart ? ' / ' + forecastPart : '') + '</div>';
      }).join('');
      monthBreakdown = '<details style="margin-top:8px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">月別内訳を見る</summary>' +
        '<div style="padding:4px 0">' + rows + '</div></details>';
    }
    return _buildOfficeHistoryCard(y.latest, y.year + '年（年末実績）', { extra: monthBreakdown });
  }).join('');
}

// ── 営業所 比較機能 ──────────────────────────────────────────
let _officeCompareChart = null;

function _onOfficeHistCompareModeToggle() {
  officeHistState.compareMode = !officeHistState.compareMode;
  if (officeHistState.compareMode) {
    const view = officeHistState.view;
    const cp = officeHistState.comparePeriod;
    if (view === 'daily') {
      if (!officeHistState.date) officeHistState.date = getTodayJST();
      const d = new Date(officeHistState.date);
      d.setDate(d.getDate() - 1);
      cp.date = d.toISOString().slice(0, 10);
    } else if (view === 'weekly') {
      if (!officeHistState.weekIndex) officeHistState.weekIndex = 1;
      const parts = officeHistState.yearMonth.split('-').map(Number);
      const pd = new Date(Date.UTC(parts[0], parts[1] - 2, 1));
      cp.weekYearMonth = pd.toISOString().slice(0, 7);
      cp.weekIndex = officeHistState.weekIndex;
    } else if (view === 'monthly' || view === 'yearly') {
      cp.year = officeHistState.year - 1;
    } else if (view === 'quarterly') {
      if (officeHistState.quarter === 'all') {
        cp.year = officeHistState.year - 1;
        cp.quarter = 'all';
      } else {
        const qOrder = ['Q1','Q2','Q3','Q4'];
        const qi = qOrder.indexOf(officeHistState.quarter);
        cp.year    = qi === 0 ? officeHistState.year - 1 : officeHistState.year;
        cp.quarter = qi === 0 ? 'Q4' : qOrder[qi - 1];
      }
    }
  }
  const btn = document.getElementById('office-hist-compare-btn');
  if (btn) btn.classList.toggle('hist-compare-btn-active', officeHistState.compareMode);
  _renderOfficeHistPeriodControl();
  renderOfficeHistContent();
}

function _getOfficePrevPeriodInfo(view) {
  const { yearMonth, year, quarter, allData, comparePeriod } = officeHistState;
  if (!allData) return null;
  const rows = allData;
  const cp = comparePeriod;

  function sumRows(list) {
    if (!list.length) return null;
    const s = { inspectionPlan:0, inspectionActual:0, salesPlan:0, salesActual:0,
                salesAcase:0, renewalNextPlanTop:0, renewalNextActualTop:0,
                totalMaintPlan:0, totalMaintActual:0 };
    list.forEach(function(r) {
      Object.keys(s).forEach(function(k) { s[k] += (Number(r[k]) || 0); });
    });
    s.salesForecast = _officeSalesForecast(s);
    return s;
  }

  let currLabel, prevLabel, currRows, prevRows;

  if (view === 'daily') {
    var currDate = officeHistState.date || getTodayJST();
    var ddd = new Date(currDate); ddd.setDate(ddd.getDate() - 1);
    var cmpDate = cp.date || ddd.toISOString().slice(0, 10);
    currLabel = formatDate(currDate);
    prevLabel = formatDate(cmpDate);
    currRows  = rows.filter(function(r) { return String(r.date) === currDate; });
    prevRows  = rows.filter(function(r) { return String(r.date) === cmpDate; });
  } else if (view === 'weekly') {
    var currYM = yearMonth;
    var currWI = officeHistState.weekIndex || 1;
    var cmpYM = cp.weekYearMonth || (function() {
      var pts = yearMonth.split('-').map(Number);
      return new Date(Date.UTC(pts[0], pts[1] - 2, 1)).toISOString().slice(0, 7);
    })();
    var cmpWI = cp.weekIndex || 1;
    function _filterOfficeWeek(ym, wi) {
      return rows.filter(function(r) {
        var d = String(r.date);
        if (!d.startsWith(ym)) return false;
        return Math.ceil(Number(d.slice(8, 10)) / 7) === wi;
      });
    }
    currLabel = formatYearMonth(currYM) + ' 第' + currWI + '週';
    prevLabel = formatYearMonth(cmpYM) + ' 第' + cmpWI + '週';
    currRows  = _filterOfficeWeek(currYM, currWI);
    prevRows  = _filterOfficeWeek(cmpYM, cmpWI);
  } else if (view === 'monthly') {
    const cmpYear = cp.year || year - 1;
    currLabel = year + '年';
    prevLabel = cmpYear + '年';
    currRows  = rows.filter(function(r) { return String(r.date).startsWith(String(year)); });
    prevRows  = rows.filter(function(r) { return String(r.date).startsWith(String(cmpYear)); });
  } else if (view === 'quarterly') {
    const qMap = { Q1:[1,2,3], Q2:[4,5,6], Q3:[7,8,9], Q4:[10,11,12], all:null };
    const qOrder = ['Q1','Q2','Q3','Q4'];
    var cmpYear, cmpQ;
    if (quarter === 'all') {
      cmpYear = cp.year || year - 1;
      cmpQ    = 'all';
    } else {
      const qi = qOrder.indexOf(quarter);
      cmpYear = cp.year || (qi === 0 ? year - 1 : year);
      cmpQ    = cp.quarter || (qi === 0 ? 'Q4' : qOrder[qi - 1]);
    }
    currLabel = year + ' ' + (quarter === 'all' ? '通年' : quarter);
    prevLabel = cmpYear + ' ' + (cmpQ === 'all' ? '通年' : cmpQ);
    function filterQ(ys, qKey) {
      var mths = qMap[qKey];
      return rows.filter(function(r) {
        var d = String(r.date);
        if (!d.startsWith(String(ys))) return false;
        if (!mths) return true;
        return mths.indexOf(Number(d.slice(5, 7))) >= 0;
      });
    }
    currRows = filterQ(year,    quarter);
    prevRows = filterQ(cmpYear, cmpQ);
  } else if (view === 'yearly') {
    const cmpYear = cp.year || year - 1;
    currLabel = year + '年';
    prevLabel = cmpYear + '年';
    currRows  = rows.filter(function(r) { return String(r.date).startsWith(String(year)); });
    prevRows  = rows.filter(function(r) { return String(r.date).startsWith(String(cmpYear)); });
  } else {
    return null;
  }

  const curr = sumRows(currRows);
  const prev = sumRows(prevRows);
  if (!curr && !prev) return null;
  return { currentLabel: currLabel, prevLabel: prevLabel, curr: curr || {}, prev: prev || {} };
}

const OFFICE_CMP_METRICS = [
  { key: 'inspectionPlan',       label: '点検計画',     unit: '件' },
  { key: 'inspectionActual',     label: '点検実績',     unit: '件' },
  { key: 'salesPlan',            label: '売上計画',     unit: '万円' },
  { key: 'salesActual',          label: '売上実績',     unit: '万円' },
  { key: 'salesForecast',        label: '末見通し',     unit: '万円' },
  { key: 'renewalNextPlanTop',   label: '次月継続計画', unit: '件' },
  { key: 'renewalNextActualTop', label: '次月継続実績', unit: '件' },
  { key: 'totalMaintPlan',       label: '総保守計画',   unit: '件' },
  { key: 'totalMaintActual',     label: '総保守実績',   unit: '件' },
];

function _buildOfficeComparisonCard(info) {
  const rows = OFFICE_CMP_METRICS.map(function(m) {
    const c = Number(info.curr[m.key] || 0);
    const p = Number(info.prev[m.key] || 0);
    const diff = c - p;
    const pct  = p !== 0 ? ((diff / Math.abs(p)) * 100).toFixed(1) + '%' : '—';
    const cls  = diff > 0 ? 'cmp-pos' : diff < 0 ? 'cmp-neg' : '';
    const sign = diff > 0 ? '+' : '';
    const fmt  = m.unit === '万円'
      ? function(v) { return (v / 10000).toFixed(1) + '万'; }
      : function(v) { return v + m.unit; };
    return `<tr>
      <td class="cmp-label">${m.label}</td>
      <td class="cmp-val">${fmt(c)}</td>
      <td class="cmp-base">${fmt(p)}</td>
      <td class="cmp-val ${cls}">${sign}${fmt(diff)}</td>
      <td class="cmp-val ${cls}">${sign}${pct}</td>
    </tr>`;
  }).join('');
  return `<div class="cmp-card">
    <div class="cmp-header">期間比較</div>
    <div class="cmp-legends">
      <span class="cmp-legend-curr">■ ${info.currentLabel}（当期）</span>
      <span class="cmp-legend-base">■ ${info.prevLabel}（比較）</span>
    </div>
    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr>
          <th>指標</th><th>当期</th><th>比較期</th><th>差分</th><th>増減率</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cmp-chart-wrap"><canvas id="office-cmp-chart"></canvas></div>
  </div>`;
}

function _renderOfficeCompareChart(info) {
  const canvas = document.getElementById('office-cmp-chart');
  if (!canvas) return;
  if (_officeCompareChart) { _officeCompareChart.destroy(); _officeCompareChart = null; }
  const labels = ['点検計画', '点検実績', '次月継続計画', '次月継続実績', '総保守計画', '総保守実績'];
  const keys   = ['inspectionPlan', 'inspectionActual', 'renewalNextPlanTop', 'renewalNextActualTop', 'totalMaintPlan', 'totalMaintActual'];
  _officeCompareChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: info.currentLabel,
          data: keys.map(function(k) { return Number(info.curr[k] || 0); }),
          backgroundColor: 'rgba(0, 212, 255, 0.7)',
        },
        {
          label: info.prevLabel,
          data: keys.map(function(k) { return Number(info.prev[k] || 0); }),
          backgroundColor: 'rgba(255, 255, 255, 0.25)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#c8d6e5', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#8899aa', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#8899aa', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.08)' } },
      },
    },
  });
}

function _renderOfficeCompareContent(view) {
  const container = document.getElementById('office-hist-compare-content');
  if (!container) return;
  if (!officeHistState.compareMode) {
    container.innerHTML = '';
    if (_officeCompareChart) { _officeCompareChart.destroy(); _officeCompareChart = null; }
    return;
  }
  const info = _getOfficePrevPeriodInfo(view);
  if (!info) {
    container.innerHTML = '<div class="hist-empty" style="font-size:12px">比較対象のデータが見つかりませんでした</div>';
    return;
  }
  container.innerHTML = _buildOfficeComparisonCard(info);
  _renderOfficeCompareChart(info);
}

// ─────────────────────────────────────────────────────────────

async function _handleOfficeHistCsv(evt) {
  const btn = evt.target;
  btn.disabled = true; btn.textContent = '生成中...';
  try {
    await ensureOfficeHistData();
    const rows = officeHistState.allData.slice().sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });

    // 出力設定に応じて列を絞り込む
    const csvColDefs = [
      { key: 'inspection', headers: ['点検計画', '点検実績'], vals: function(e) { return [e.inspectionPlan, e.inspectionActual]; } },
      { key: 'sales',      headers: ['売上計画', '売上実績', '末見通し'], vals: function(e) { return [e.salesPlan, e.salesActual, _officeSalesForecast(e)]; } },
      { key: 'renewal',    headers: ['次月継続計画', '次月継続実績'], vals: function(e) { return [e.renewalNextPlanTop, e.renewalNextActualTop]; } },
      { key: 'maint',      headers: ['総保守計画', '総保守実績'], vals: function(e) { return [e.totalMaintPlan, e.totalMaintActual]; } },
    ].filter(function(col) { return officeReportSettings[col.key] !== false; });

    const header = ['日付'].concat(csvColDefs.flatMap(function(c) { return c.headers; }));
    const csvRows = [header].concat(rows.map(function(e) {
      return [e.date].concat(csvColDefs.flatMap(function(c) { return c.vals(e); }));
    }));
    downloadCsv('営業所_全データ.csv', csvRows);
  } finally { btn.disabled = false; btn.textContent = 'CSV'; }
}

function _getOfficePeriodLabel(view) {
  var viewLabels = { daily: '日次', weekly: '週次', monthly: '月次', quarterly: '四半期', yearly: '年次' };
  var base = '営業所 ' + (viewLabels[view] || '') + 'レポート';
  if (view === 'daily')     return base + '（' + formatDate(officeHistState.date || getTodayJST()) + '）';
  if (view === 'weekly')    return base + '（' + formatYearMonth(officeHistState.yearMonth) + ' 第' + (officeHistState.weekIndex || 1) + '週）';
  if (view === 'monthly')   return base + '（' + officeHistState.year + '年）';
  if (view === 'quarterly') return base + '（' + officeHistState.year + '年 ' + (officeHistState.quarter === 'all' ? '全四半期' : officeHistState.quarter) + '）';
  if (view === 'yearly')    return base + '（' + officeHistState.year + '年）';
  return base;
}

function _buildOfficePrintHtml(opts) {
  var periodText = opts.periodText || '';
  var today      = opts.today || getTodayJST();
  var cmpHtml    = opts.cmpHtml || '';
  var histHtml   = opts.histHtml || '';

  // 出力設定に基づく KPI 非表示 CSS を動的生成
  var kpiHideCss = _OFFICE_KPI_DEFS.map(function(d) {
    return officeReportSettings[d.id] === false
      ? '.ohist-kpi-section[data-kpi-id="' + d.id + '"]{display:none}'
      : '';
  }).join('');
  if (officeReportSettings.showDelta    === false) kpiHideCss += '.ohist-delta-row{display:none}';
  if (officeReportSettings.showForecast === false) kpiHideCss += '.ohist-forecast-row{display:none}';

  var viewLabels = { daily: '日次', weekly: '週次', monthly: '月次', quarterly: '四半期', yearly: '年次' };
  var title = '営業所 ' + (viewLabels[officeHistState.view] || '') + 'レポート';

  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' + title + '</title>' +
    '<style>' +
    'body{font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;padding:20px 24px;max-width:800px;margin:0 auto;color:#111;font-size:13px;line-height:1.6}' +
    '.print-header{margin-bottom:18px;border-bottom:2px solid #333;padding-bottom:10px}' +
    '.print-title{font-size:18px;font-weight:700;margin-bottom:4px}' +
    '.print-period{font-size:13px;color:#333;font-weight:600;margin-bottom:2px}' +
    '.print-date{font-size:11px;color:#888}' +
    '.card{border:1px solid #ccc;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid;background:#fff;border-radius:0}' +
    '.mgmt-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '.ohist-summary-bar{display:flex;align-items:center;gap:8px;padding:4px 0 8px;border-bottom:1px solid #e5e5e5;margin-bottom:8px;flex-wrap:wrap}' +
    '.ohist-overall-rate{font-weight:700;font-size:15px}' +
    '.ohist-status-badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;border:1px solid #ccc}' +
    '.ohist-pace-row,.ohist-pace-bar-wrap{display:none}' +
    '.ohist-kpi-section{padding:6px 0;border-bottom:1px solid #f0f0f0}' +
    '.ohist-kpi-section:last-child{border-bottom:none}' +
    '.ohist-kpi-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}' +
    '.ohist-kpi-title{font-size:11px;font-weight:700;color:#b45309}' +
    '.ohist-kpi-vals{display:flex;align-items:center;gap:4px}' +
    '.ohist-actual{font-weight:700;font-size:13px}' +
    '.ohist-plan{font-size:11px;color:#999}' +
    '.ohist-rate{font-weight:700;font-size:12px;min-width:40px;text-align:right}' +
    '.ohist-forecast-row{display:flex;justify-content:space-between;font-size:12px;margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.08)}' +
    '.ohist-delta-row{font-size:11px;color:#555;padding-top:3px;margin-top:3px;border-top:1px solid #f0f0f0}' +
    '.ohist-delta-pos{color:#167a16;font-weight:700}.ohist-delta-neg{color:#c00;font-weight:700}' +
    '.ohist-delta-label{color:#999;margin-right:2px}' +
    '.progress-bar{display:none}' +
    /* 比較カード */
    '.cmp-card{border-left:3px solid #aaa;padding:10px 12px;margin-bottom:12px}' +
    '.cmp-header{font-size:13px;font-weight:700;color:#333;margin-bottom:8px}' +
    '.cmp-legends{display:flex;gap:10px;font-size:11px;margin-bottom:8px}' +
    '.cmp-legend-curr{color:#0088aa;font-weight:700}' +
    '.cmp-legend-base{color:#666}' +
    '.cmp-table{width:100%;border-collapse:collapse;font-size:12px}' +
    '.cmp-table th{color:#555;font-size:11px;font-weight:700;padding:6px;text-align:right;border-bottom:1px solid #999}' +
    '.cmp-table th:first-child{text-align:left}' +
    '.cmp-table td{padding:6px;border-top:1px solid #eee;vertical-align:middle}' +
    '.cmp-label{font-size:12px;color:#333}' +
    '.cmp-val{font-size:12px;text-align:right;color:#111}' +
    '.cmp-base{color:#666;text-align:right}' +
    '.cmp-pos{color:#167a16;font-weight:700;text-align:right}' +
    '.cmp-neg{color:#c00;font-weight:700;text-align:right}' +
    '.cmp-chart-wrap{margin-top:8px;text-align:center}' +
    /* 非表示 */
    '.hist-card-actions,.report-controls,.hist-controls,.sort-handle{display:none}' +
    /* details展開（月別内訳） */
    'details{display:block}details>*{display:block}summary{display:none}' +
    kpiHideCss +
    '</style></head><body>' +
    '<div class="print-header">' +
    '<div class="print-title">' + title + '</div>' +
    (periodText ? '<div class="print-period">' + periodText + '</div>' : '') +
    '<div class="print-date">出力日：' + today + '</div>' +
    '</div>' +
    cmpHtml +
    histHtml +
    '</body></html>';
}

async function _handleOfficeHistPrint() {
  var btn = document.getElementById('office-report-print-btn');
  if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
  try {
    await ensureOfficeHistData();
    await renderOfficeHistContent();

    var view = officeHistState.view;
    var today = getTodayJST();
    var periodText = '';
    if (officeHistState.compareMode) {
      var info = _getOfficePrevPeriodInfo(view);
      if (info) periodText = '当期：' + info.currentLabel + '　／　比較期：' + info.prevLabel;
    } else {
      periodText = _getOfficePeriodLabel(view);
    }

    // 比較カードHTML（canvas→img変換）
    var cmpHtml = '';
    if (officeHistState.compareMode) {
      var cmpEl = document.getElementById('office-hist-compare-content');
      if (cmpEl) {
        var officeCanvas = document.getElementById('office-cmp-chart');
        var inner = cmpEl.innerHTML;
        if (officeCanvas) {
          var imgSrc = officeCanvas.toDataURL('image/png');
          inner = inner.replace(
            /<canvas[^>]*id="office-cmp-chart"[^>]*><\/canvas>/,
            '<img src="' + imgSrc + '" style="width:100%;max-height:220px;object-fit:contain">'
          );
        }
        cmpHtml = inner;
      }
    }

    var histEl = document.getElementById('office-history-container');
    var histHtml = histEl ? histEl.innerHTML : '';

    var html = _buildOfficePrintHtml({ periodText: periodText, today: today, cmpHtml: cmpHtml, histHtml: histHtml });
    var win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function() { win.print(); }, 400);
    } else {
      window.print();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '印刷/PDF'; }
  }
}

function _buildOfficeReportSettingsPanel() {
  var panel = document.getElementById('office-report-settings');
  if (!panel) return;
  var kpiCheckboxes = _OFFICE_KPI_DEFS.map(function(d) {
    return '<label class="report-chk-label">' +
      '<input type="checkbox" data-key="' + d.id + '" ' + (officeReportSettings[d.id] !== false ? 'checked' : '') + ' />' +
      d.label + '</label>';
  }).join('');
  var extraCheckboxes = [
    { key: 'showDelta',    label: '前期比' },
    { key: 'showForecast', label: '末見通し' },
  ].map(function(f) {
    return '<label class="report-chk-label">' +
      '<input type="checkbox" data-key="' + f.key + '" ' + (officeReportSettings[f.key] !== false ? 'checked' : '') + ' />' +
      f.label + '</label>';
  }).join('');
  panel.innerHTML =
    '<div class="report-settings-section-title">KPI項目</div>' +
    '<div class="report-settings-grid">' + kpiCheckboxes + '</div>' +
    '<div class="report-settings-section-title">表示オプション</div>' +
    '<div class="report-settings-grid">' + extraCheckboxes + '</div>';
  panel.querySelectorAll('input[type="checkbox"]').forEach(function(chk) {
    chk.addEventListener('change', function() {
      officeReportSettings[chk.dataset.key] = chk.checked;
    });
  });
}

function _toggleOfficeReportSettings() {
  var panel = document.getElementById('office-report-settings');
  var btn   = document.getElementById('office-report-settings-btn');
  var isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  btn.classList.toggle('report-settings-btn-active', !isVisible);
}

async function _handleOfficeHistCopy(evt) {
  const btn = evt.target;
  btn.disabled = true; btn.textContent = '生成中...';
  try {
    await ensureOfficeHistData();
    const text = _buildOfficeReportText(officeHistState.allData, officeHistState.view);
    await navigator.clipboard.writeText(text);
    btn.textContent = '✓ コピー済';
    setTimeout(function() { btn.textContent = '上長報告'; btn.disabled = false; }, 2000);
  } catch (e) {
    btn.textContent = '上長報告'; btn.disabled = false;
    alert('コピーに失敗しました: ' + e.message);
  }
}

function _buildOfficeReportText(rows, view) {
  const today = getTodayJST();
  const fmt = function(v) { return (Number(v) || 0).toLocaleString(); };
  const entry2lines = function(e) {
    return [
      '  点検: ' + fmt(e.inspectionActual) + '/' + fmt(e.inspectionPlan) + '件',
      '  売上: ¥' + fmt(e.salesActual) + '/¥' + fmt(e.salesPlan),
      '  末見通し: ¥' + fmt(_officeSalesForecast(e)),
      '  次月継続: ' + fmt(e.renewalNextActualTop) + '/' + fmt(e.renewalNextPlanTop) + '件',
    ].join('\n');
  };
  if (view === 'daily') {
    const filtered = rows.filter(function(r) { return String(r.date).startsWith(officeHistState.yearMonth); });
    const sorted   = filtered.slice().sort(function(a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!sorted.length) return '【営業所日次報告】' + formatYearMonth(officeHistState.yearMonth) + '\n報告日: ' + today + '\nデータがありません';
    return '【営業所日次報告】' + formatYearMonth(officeHistState.yearMonth) + '\n報告日: ' + today + '\n\n' +
      sorted.map(function(e) { return '◆' + e.date + '\n' + entry2lines(e); }).join('\n\n');
  }
  if (view === 'weekly') {
    const filtered = rows.filter(function(r) { return String(r.date).startsWith(officeHistState.yearMonth); });
    const weeks    = _groupOfficeByWeek(filtered);
    if (!weeks.length) return '【営業所週次報告】' + formatYearMonth(officeHistState.yearMonth) + '\n報告日: ' + today + '\nデータがありません';
    return '【営業所週次報告】' + formatYearMonth(officeHistState.yearMonth) + '\n報告日: ' + today + '\n\n' +
      weeks.map(function(w) { return '◆' + w.weekStart + '〜\n' + entry2lines(w.latest); }).join('\n\n');
  }
  if (view === 'monthly') {
    const filtered = rows.filter(function(r) { return String(r.date).startsWith(String(officeHistState.year)); });
    const months   = _groupOfficeByMonth(filtered);
    if (!months.length) return '【営業所月次報告】' + officeHistState.year + '年\n報告日: ' + today + '\nデータがありません';
    return '【営業所月次報告】' + officeHistState.year + '年\n報告日: ' + today + '\n\n' +
      months.map(function(m) { return '◆' + m.ym + '\n' + entry2lines(m.latest); }).join('\n\n');
  }
  if (view === 'quarterly') {
    const year = officeHistState.year;
    const selectedQ = officeHistState.quarter;
    const filtered  = rows.filter(function(r) { return String(r.date).startsWith(String(year)); });
    const quarters  = _groupOfficeByQuarter(filtered);
    const allQDefs  = [
      { key: 'Q1', label: 'Q1（1〜3月）' },
      { key: 'Q2', label: 'Q2（4〜6月）' },
      { key: 'Q3', label: 'Q3（7〜9月）' },
      { key: 'Q4', label: 'Q4（10〜12月）' },
    ];
    const qDefs = selectedQ === 'all' ? allQDefs : allQDefs.filter(function(q) { return q.key === selectedQ; });
    const lines = [];
    qDefs.forEach(function(qDef) {
      const qEntries = quarters[qDef.key];
      if (!qEntries.length) return;
      var latest = qEntries.reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, qEntries[0]);
      lines.push('◆' + year + '年 ' + qDef.label + '\n' + entry2lines(latest));
    });
    if (!lines.length) return '【営業所四半期報告】' + year + '年\n報告日: ' + today + '\nデータがありません';
    return '【営業所四半期報告】' + year + '年\n報告日: ' + today + '\n\n' + lines.join('\n\n');
  }
  // yearly
  const years = {};
  rows.forEach(function(e) { const y = String(e.date).slice(0, 4); if (!years[y]) years[y] = []; years[y].push(e); });
  const list  = Object.entries(years).sort(function(a, b) { return a[0].localeCompare(b[0]); });
  if (!list.length) return '【営業所年次報告】\n報告日: ' + today + '\nデータがありません';
  return '【営業所年次報告】\n報告日: ' + today + '\n\n' +
    list.map(function(kv) {
      var latest = kv[1].reduce(function(max, r) { return String(r.date) > String(max.date) ? r : max; }, kv[1][0]);
      return '◆' + kv[0] + '年\n' + entry2lines(latest);
    }).join('\n\n');
}

function _calcOfficeKpiRate(entry, kpiDef) {
  var plan   = Number(entry[kpiDef.planKey])   || 0;
  var actual = Number(entry[kpiDef.actualKey]) || 0;
  if (plan === 0) return null;
  return Math.min(Math.round(actual / plan * 100), 999);
}

function _buildOfficeKpiBlock(kpiDef, entry, prevEntry) {
  var plan     = Number(entry[kpiDef.planKey])   || 0;
  var actual   = Number(entry[kpiDef.actualKey]) || 0;
  var rate     = _calcOfficeKpiRate(entry, kpiDef);
  var cc       = rate !== null ? getProgressColorClass(rate) : 'gray';
  var cl       = rate !== null ? getAccentColor(cc)          : 'var(--text-muted)';
  var rateStr  = rate !== null ? rate + '%' : '—';
  var barWidth = rate !== null ? Math.min(rate, 100) : 0;
  var isYen    = kpiDef.unit === '円';
  var fmtVal   = function(v) { return isYen ? formatCurrency(v) : formatNumber(v) + kpiDef.unit; };

  var html = '<div class="ohist-kpi-section" data-kpi-id="' + kpiDef.id + '">' +
    '<div class="ohist-kpi-header">' +
    '<span class="ohist-kpi-title">' + kpiDef.label + '</span>' +
    '<div class="ohist-kpi-vals">' +
    '<span class="ohist-actual">' + fmtVal(actual) + '</span>' +
    '<span class="ohist-plan"> / ' + fmtVal(plan) + '</span>' +
    '<span class="ohist-rate" style="color:' + cl + '">' + rateStr + '</span>' +
    '</div></div>' +
    '<div class="progress-bar"><div class="progress-fill ' + cc + '" style="width:' + barWidth + '%"></div></div>';

  if (kpiDef.showForecast && (kpiDef.forecastCalc || kpiDef.forecastKey)) {
    var forecast = kpiDef.forecastCalc ? kpiDef.forecastCalc(entry) : (Number(entry[kpiDef.forecastKey]) || 0);
    var fRate    = plan > 0 ? Math.min(Math.round(forecast / plan * 100), 999) : null;
    var fcl      = fRate !== null ? getAccentColor(getProgressColorClass(fRate)) : 'var(--text-muted)';
    var diff     = forecast - plan;
    var diffCls  = diff >= 0 ? 'ohist-delta-pos' : 'ohist-delta-neg';
    var diffStr  = (diff >= 0 ? '＋' : '−') + formatCurrency(Math.abs(diff));
    html += '<div class="ohist-forecast-row">' +
      '<span style="font-weight:700;color:' + fcl + '">末見通し ' + formatCurrency(forecast) +
      (fRate !== null ? ' (' + fRate + '%)' : '') + '</span>' +
      '<span class="' + diffCls + '">対計画 ' + diffStr + '</span>' +
      '</div>';
  }

  if (prevEntry) {
    var prevActual = Number(prevEntry[kpiDef.actualKey]) || 0;
    var delta = actual - prevActual;
    if (delta !== 0) {
      var deltaCls = delta > 0 ? 'ohist-delta-pos' : 'ohist-delta-neg';
      var deltaStr = (delta > 0 ? 'Δ＋' : 'Δ−') + fmtVal(Math.abs(delta));
      html += '<div class="ohist-delta-row">' +
        '<span class="ohist-delta-item"><span class="ohist-delta-label">前期比</span>' +
        '<span class="' + deltaCls + '">' + deltaStr + '</span></span>' +
        '</div>';
    }
  }

  return html + '</div>';
}

function _buildOfficeSummaryHeader(entry, label, paceInfo) {
  var rates = _OFFICE_KPI_DEFS.map(function(d) { return _calcOfficeKpiRate(entry, d); }).filter(function(r) { return r !== null; });
  var overallRate = rates.length ? Math.round(rates.reduce(function(s, r) { return s + r; }, 0) / rates.length) : null;

  var statusBadge = '';
  if (overallRate !== null) {
    var scc = getProgressColorClass(overallRate);
    var scl = getAccentColor(scc);
    var sLabel = overallRate >= 100 ? '達成' : overallRate >= 70 ? '順調' : overallRate >= 40 ? '注意' : '要注意';
    statusBadge = '<span class="ohist-status-badge" style="background:' + scl + '22;color:' + scl + ';border-color:' + scl + '60">' + sLabel + '</span>';
  }

  var html = '<div class="mgmt-header">' +
    '<span style="font-size:13px;font-weight:700;color:var(--text-primary)">' + label + '</span>' +
    statusBadge + '</div>';

  if (overallRate !== null) {
    var ocl = getAccentColor(getProgressColorClass(overallRate));
    html += '<div class="ohist-summary-bar">' +
      '<span style="font-size:11px;color:var(--text-secondary)">総合達成率</span>' +
      '<span class="ohist-overall-rate" style="color:' + ocl + '">' + overallRate + '%</span>';

    if (paceInfo) {
      var pcl = getAccentColor(paceInfo.badge.colorClass);
      var ep  = Math.min(paceInfo.elapsedPct, 100);
      html += '<div class="ohist-pace-row">' +
        '<span style="white-space:nowrap">月経過 ' + paceInfo.elapsedPct + '%</span>' +
        '<div class="ohist-pace-bar-wrap">' +
        '<div class="ohist-pace-bar-fill" style="width:' + ep + '%"></div>' +
        '<div class="ohist-pace-marker" style="left:' + ep + '%"></div>' +
        '</div>' +
        '<span class="ohist-pace-badge" style="color:' + pcl + '">' + paceInfo.badge.label + '</span>' +
        '</div>';
    }
    html += '</div>';
  }
  return html;
}

function _buildOfficeHistoryCard(entry, label, opts) {
  if (!entry) return '';
  opts = opts || {};
  var dateLabel = (typeof label === 'string' ? label : null) || String(entry.date).slice(0, 10);
  var html = '<div class="card" style="margin-bottom:10px">' +
    _buildOfficeSummaryHeader(entry, dateLabel, opts.paceInfo || null);
  _OFFICE_KPI_DEFS.forEach(function(kpiDef) {
    html += _buildOfficeKpiBlock(kpiDef, entry, opts.prevEntry || null);
  });
  html += (opts.extra || '') + '</div>';
  return html;
}

// ------------------------------------------------------------------
// 営業所 KGI設定タブ
// ------------------------------------------------------------------

function initOfficeKgiTab() {
  var el = document.getElementById('office-kgi-month');
  if (!el) return;
  el.value = getCurrentYearMonthJST ? getCurrentYearMonthJST() : getTodayJST().slice(0, 7);
  el.addEventListener('change', loadOfficeKgi);

  // 注力事項
  var saveBtn = document.getElementById('save-office-focus-items-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function() {
      var statusEl = document.getElementById('office-focus-items-status');
      statusEl.textContent = '保存中...';
      try {
        await saveOfficeSettings({ key: 'focusItems', value: document.getElementById('office-focus-items-input').value });
        statusEl.textContent = '✓ 保存しました';
      } catch (e) {
        statusEl.textContent = 'エラー: ' + e.message;
      }
      setTimeout(function() { statusEl.textContent = ''; }, 2000);
    });
  }
  getOfficeSettings().then(function(s) {
    var ta = document.getElementById('office-focus-items-input');
    if (ta && s && s.focusItems) ta.value = s.focusItems;
  }).catch(function() {});
}

async function loadOfficeKgi() {
  var container = document.getElementById('office-kgi-fields');
  if (!container) return;
  var el = document.getElementById('office-kgi-month');
  var ym = el ? el.value : getTodayJST().slice(0, 7);
  container.innerHTML = '<div style="color:var(--text-muted);font-size:13px">読み込み中...</div>';
  try {
    var plan = await getOfficeSalesPlan(ym, 'office');
    renderOfficeSalesPlanFields(plan, ym, container);
  } catch (e) {
    // 取得エラー（_postの集約エラー検出と連動）: 失敗理由を表示
    _renderError(container, '読み込みエラー: ' + e.message);
  }
}

var OFFICE_KGI_LABELS = {
  maintenancePlanUnits:  '保守台数 計画',
  maintenancePlanAmount: '保守額 計画',
  inspectionPlanUnits:   '点検台数 計画',
  inspectionPlanAmount:  '点検額 計画',
  renewalPlanUnits:      '継続台数 計画',
  renewalPlanAmount:     '継続額 計画',
  newPlanUnits:          '新規台数 計画',
  newPlanAmount:         '新規額 計画',
  totalSalesPlan:        '売上計画 合計'
};

function _officeKgiFieldBadge(entry, key) {
  var manual = Array.isArray(entry.manualFields) && entry.manualFields.indexOf(key) !== -1;
  if (manual) return '<span class="office-field-badge" style="font-size:11px;color:var(--text-muted);margin-left:6px">手入力</span>';
  if (entry.importedAt) {
    var d = new Date(entry.importedAt);
    if (!isNaN(d.getTime())) {
      return '<span class="office-field-badge" style="font-size:11px;color:var(--text-muted);margin-left:6px">' +
             (d.getMonth() + 1) + '/' + d.getDate() + '取込</span>';
    }
  }
  return '';
}

function renderOfficeSalesPlanFields(plan, ym, container) {
  // scope='office'で取得済みだが、念のためoffice行のみを明示的に選ぶ（plan[0]決め打ちにしない）
  var entry = (plan || []).find(function(p) { return p.scope === 'office'; }) || null;

  var noticeHtml = '';
  if (!entry) {
    // (a) 該当月データなし: 売上計画が未取込。手入力での保存も可能なので空欄フォームは表示する
    noticeHtml = '<div style="color:var(--accent-amber, #d97706);font-size:12px;margin-bottom:8px">' +
                 '売上計画が未取込です。取込タブからアップロードしてください（手入力での保存も可能です）' +
                 '</div>';
    entry = {};
  }

  var html = noticeHtml + '<div class="office-section">';
  Object.keys(OFFICE_KGI_LABELS).forEach(function(key) {
    var val   = (entry[key] !== undefined && entry[key] !== '') ? entry[key] : 0;
    var badge = _officeKgiFieldBadge(entry, key);
    var hint  = (key === 'inspectionPlanAmount')
      ? '<div class="office-field-hint" style="font-size:11px;color:var(--text-muted)">※取込データに項目が無いため手入力が必要です</div>'
      : '';
    html += '<div class="office-field-row">' +
            '<span class="office-field-label">' + OFFICE_KGI_LABELS[key] + badge + '</span>' +
            '<input class="office-field-input" type="number" step="any" data-key="' + key + '" value="' + val + '">' +
            '</div>' + hint;
  });
  html += '</div>';
  html += '<button class="btn btn-primary" id="office-kgi-save-btn" style="margin-top:12px">保存する</button>';
  container.innerHTML = html;
  document.getElementById('office-kgi-save-btn').addEventListener('click', function() {
    saveOfficeKgi(ym);
  });
}

async function saveOfficeKgi(ym) {
  var btn = document.getElementById('office-kgi-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
  try {
    var fields = {};
    document.querySelectorAll('#office-kgi-fields .office-field-input').forEach(function(f) {
      fields[f.dataset.key] = parseFloat(f.value) || 0;
    });
    // source を付けない = 手動保存（既存の取込済みフィールドを消さずマージ、更新項目はmanualFieldsに記録される）
    var entry = Object.assign({ yearMonth: ym, scope: 'office', memberId: '', memberName: '' }, fields);
    await saveOfficeSalesPlan([entry]);
    var savedBtn = document.getElementById('office-kgi-save-btn');
    if (savedBtn) { savedBtn.textContent = '✓ 保存しました'; }
    // 手入力バッジを反映するため最新値を再読込
    setTimeout(function() { loadOfficeKgi(); }, 800);
  } catch (e) {
    alert('保存エラー: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '保存する'; }
  }
}

// ------------------------------------------------------------------
// 月末自動判定 トリガー設定ボタン
// ------------------------------------------------------------------

function initSetupTriggersBtn() {
  var btn = document.getElementById('btn-office-setup-triggers');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    btn.disabled = true;
    btn.textContent = '設定中...';
    try {
      await _callGas('gasSetupAiTriggers');
      btn.textContent = '✓ トリガー設定済み';
      btn.style.color = 'var(--accent-emerald)';
    } catch (e) {
      alert('設定エラー: ' + e.message);
      btn.disabled = false;
      btn.textContent = '🕐 月末自動判定 トリガー設定';
    }
  });
}

// ------------------------------------------------------------------
// 営業所 日次取込
// ------------------------------------------------------------------

function initOfficeDailyImport() {
  var btn  = document.getElementById('btn-office-daily-import');
  var file = document.getElementById('office-daily-file');
  if (!btn || !file) return;

  btn.addEventListener('click', function() { file.click(); });
  file.addEventListener('change', onOfficeDailyFileSelect);

  document.getElementById('office-import-cancel')
    .addEventListener('click', closeOfficeDailyModal);
  document.getElementById('office-import-save')
    .addEventListener('click', saveOfficeDailyFromModal);

  document.querySelectorAll('#office-import-modal .modal-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('#office-import-modal .modal-tab')
        .forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      _officeDailyScope = tab.dataset.scope;
      renderOfficeDailyFields();
    });
  });

  document.getElementById('office-member-select')
    .addEventListener('change', renderOfficeDailyFields);
}

var _xlsxLoadPromise = null;
function _ensureXlsx() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = function() {
      _xlsxLoadPromise = null;
      reject(new Error('XLSXライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。'));
    };
    document.head.appendChild(s);
  });
  return _xlsxLoadPromise;
}

async function onOfficeDailyFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    await _ensureXlsx();
    var buf = await file.arrayBuffer();
    var wb  = XLSX.read(new Uint8Array(buf), { type: 'array' });
    _officeDailyParsed = parseDayReport(wb, getTodayJST());
    openOfficeDailyConfirm(_officeDailyParsed);
  } catch (err) {
    alert('取込エラー: ' + err.message);
  }
}

function openOfficeDailyConfirm(parsed) {
  var dateInput = document.getElementById('office-import-date');
  dateInput.value = parsed.date;
  dateInput.onchange = function() {
    if (_officeDailyParsed) _officeDailyParsed.date = this.value;
  };
  _officeDailyScope = 'office';
  document.querySelectorAll('#office-import-modal .modal-tab').forEach(function(t, i) {
    t.classList.toggle('active', i === 0);
  });
  document.getElementById('office-member-select-wrap').style.display = 'none';
  renderOfficeDailyFields();
  document.getElementById('office-import-modal').style.display = 'flex';
}

function renderOfficeDailyFields() {
  var container = document.getElementById('office-import-fields');
  var isOffice  = (_officeDailyScope === 'office');
  var data;

  if (isOffice) {
    document.getElementById('office-member-select-wrap').style.display = 'none';
    data = _officeDailyParsed ? _officeDailyParsed.office : {};
  } else {
    document.getElementById('office-member-select-wrap').style.display = 'block';
    var memberId = document.getElementById('office-member-select').value;
    data = (_officeDailyParsed ? _officeDailyParsed.members : [])
           .find(function(m) { return m.memberId === memberId; }) || {};
  }

  function v(key) { return (data[key] !== undefined) ? data[key] : 0; }

  function fieldInput(key) {
    return '<input class="office-field-input import-field-input" type="number" step="any"' +
           ' data-key="' + key + '" value="' + v(key) + '">';
  }

  function gaugeRow(label, planKey, actualKey) {
    var plan   = Number(v(planKey))   || 0;
    var actual = Number(v(actualKey)) || 0;
    var g      = _gaugeRateHtml(plan, actual);
    return '<div class="office-gauge-block">' +
           '<div class="office-gauge-row">' +
           '<span class="office-gauge-label">' + label + '</span>' +
           '<div class="office-gauge-inputs">' +
           '計<input class="office-field-input import-field-input" type="number" step="any" data-key="' + planKey + '" value="' + plan + '">' +
           '実<input class="office-field-input import-field-input" type="number" step="any" data-key="' + actualKey + '" value="' + actual + '">' +
           g.html +
           '</div></div>' +
           '<div class="progress-bar"><div class="progress-fill ' + getProgressColorClass(g.rate) + '" style="width:' + Math.min(g.rate,100) + '%"></div></div>' +
           '</div>';
  }

  function simpleRow(key) {
    return '<div class="office-field-row">' +
           '<span class="office-field-label">' + (OFFICE_DAILY_LABELS[key] || key) + '</span>' +
           fieldInput(key) +
           '</div>';
  }

  var html = '';

  // ── 促進ブロック ─────────────────────────────
  html += '<div class="office-section">' +
          '<div class="office-section-title">促進</div>' +
          simpleRow('activityCount') +
          simpleRow('promotionCount') +
          simpleRow('promotionAcase') +
          '</div>';

  // ── 点検ブロック ─────────────────────────────
  html += '<div class="office-section">' +
          '<div class="office-section-title">点検</div>' +
          gaugeRow('点検', 'inspectionPlan', 'inspectionActual') +
          '</div>';

  // ── 売上ブロック ─────────────────────────────
  {
    var sPlan   = Number(v('salesPlan'))     || 0;
    var sActual = Number(v('salesActual'))   || 0;
    var fPlan   = Number(v('salesPlan'))     || 0;
    var fActual = Number(v('salesForecast')) || 0;
    var sG = _gaugeRateHtml(sPlan, sActual);
    var fG = _gaugeRateHtml(fPlan, fActual);
    var vsPlanVal = Number(v('vsPlan')) || 0;
    var vsPlanPct = Math.floor(vsPlanVal < 5 ? vsPlanVal * 100 : vsPlanVal);
    html += '<div class="office-section">' +
            '<div class="office-section-title">売上</div>' +
            '<div class="office-gauge-block">' +
            '<div class="office-gauge-row"><span class="office-gauge-label">売上 実績</span>' +
            '<div class="office-gauge-inputs">' +
            '計<input class="office-field-input import-field-input" type="number" step="any" data-key="salesPlan" value="' + sPlan + '">' +
            '実<input class="office-field-input import-field-input" type="number" step="any" data-key="salesActual" value="' + sActual + '">' +
            sG.html + '</div></div>' +
            '<div class="progress-bar"><div class="progress-fill ' + getProgressColorClass(sG.rate) + '" style="width:' + Math.min(sG.rate,100) + '%"></div></div>' +
            '</div>' +
            '<div class="office-gauge-block">' +
            '<div class="office-gauge-row"><span class="office-gauge-label">末見通し</span>' +
            '<div class="office-gauge-inputs">' +
            '<input class="office-field-input import-field-input" type="number" step="any" data-key="salesForecast" value="' + fActual + '">' +
            fG.html + '</div></div>' +
            '<div class="progress-bar"><div class="progress-fill ' + getProgressColorClass(fG.rate) + '" style="width:' + Math.min(fG.rate,100) + '%"></div></div>' +
            '</div>' +
            simpleRow('salesAcase') +
            '<div class="office-field-row"><span class="office-field-label">対計画率</span>' +
            '<span class="import-rate" style="color:' + getAccentColor(getProgressColorClass(vsPlanPct)) + '">' + vsPlanPct + '%</span>' +
            '<input type="hidden" class="import-field-input" data-key="vsPlan" value="' + vsPlanVal + '">' +
            '</div>' +
            '</div>';
  }

  // ── 保守ブロック ─────────────────────────────
  html += '<div class="office-section">' +
          '<div class="office-section-title">保守</div>' +
          gaugeRow('総保守台数', 'totalMaintPlan', 'totalMaintActual') +
          gaugeRow('新規保守台数', 'newMaintPlan', 'newMaintActual') +
          simpleRow('maintActual') +
          simpleRow('maintNew') +
          simpleRow('maintCont') +
          '</div>';

  // ── 継続ブロック ─────────────────────────────
  {
    var rnPlan   = Number(v('renewalNextPlanTop'))   || 0;
    var rnActual = Number(v('renewalNextActualTop')) || 0;
    var rnG = _gaugeRateHtml(rnPlan, rnActual);
    var renewalRateVal = Number(v('renewalRate')) || 0;
    var renewalRatePct = Math.floor(renewalRateVal < 5 ? renewalRateVal * 100 : renewalRateVal);
    html += '<div class="office-section">' +
            '<div class="office-section-title">継続</div>' +
            '<div class="office-gauge-block">' +
            '<div class="office-gauge-row"><span class="office-gauge-label">次月継続</span>' +
            '<div class="office-gauge-inputs">' +
            '計<input class="office-field-input import-field-input" type="number" step="any" data-key="renewalNextPlanTop" value="' + rnPlan + '">' +
            '実<input class="office-field-input import-field-input" type="number" step="any" data-key="renewalNextActualTop" value="' + rnActual + '">' +
            rnG.html + '</div></div>' +
            '<div class="progress-bar"><div class="progress-fill ' + getProgressColorClass(rnG.rate) + '" style="width:' + Math.min(rnG.rate,100) + '%"></div></div>' +
            '</div>' +
            simpleRow('renewalThisPrev') +
            simpleRow('renewalThisPlan') +
            simpleRow('renewalThisActual');
    if (isOffice) {
      html += '<div class="office-field-row"><span class="office-field-label">継続率</span>' +
              '<span class="import-rate" style="color:' + getAccentColor(getProgressColorClass(renewalRatePct)) + '">' + renewalRatePct + '%</span>' +
              '<input type="hidden" class="import-field-input" data-key="renewalRate" value="' + renewalRateVal + '">' +
              '</div>';
    }
    html += '</div>';
  }

  // ── 翌月以降ブロック ─────────────────────────
  {
    var rn2Plan   = Number(v('renewalNext2Plan'))   || 0;
    var rn2Actual = Number(v('renewalNext2Actual')) || 0;
    var rn2G = _gaugeRateHtml(rn2Plan, rn2Actual);
    var rn2RateVal = Number(v('renewalNext2Rate')) || 0;
    var rn2RatePct = Math.floor(rn2RateVal < 5 ? rn2RateVal * 100 : rn2RateVal);
    html += '<div class="office-section office-section-next">' +
            '<div class="office-section-title">翌月以降</div>' +
            simpleRow('nextMonthBacklog') +
            simpleRow('nextMonthCase') +
            '<div class="office-gauge-block">' +
            '<div class="office-gauge-row"><span class="office-gauge-label">次々月継続</span>' +
            '<div class="office-gauge-inputs">' +
            '計<input class="office-field-input import-field-input" type="number" step="any" data-key="renewalNext2Plan" value="' + rn2Plan + '">' +
            '実<input class="office-field-input import-field-input" type="number" step="any" data-key="renewalNext2Actual" value="' + rn2Actual + '">' +
            rn2G.html + '</div></div>' +
            '<div class="progress-bar"><div class="progress-fill ' + getProgressColorClass(rn2G.rate) + '" style="width:' + Math.min(rn2G.rate,100) + '%"></div></div>' +
            '</div>' +
            '<div class="office-field-row"><span class="office-field-label">次々月継続受注率</span>' +
            '<span class="import-rate" style="color:' + getAccentColor(getProgressColorClass(rn2RatePct)) + '">' + rn2RatePct + '%</span>' +
            '<input type="hidden" class="import-field-input" data-key="renewalNext2Rate" value="' + rn2RateVal + '">' +
            '</div>' +
            '</div>';
  }

  container.innerHTML = html;
}

function _collectImportFields() {
  var result = {};
  document.querySelectorAll('#office-import-fields .import-field-input').forEach(function(f) {
    result[f.dataset.key] = parseFloat(f.value) || 0;
  });
  return result;
}

function closeOfficeDailyModal() {
  document.getElementById('office-import-modal').style.display = 'none';
  _officeDailyParsed = null;
}

async function saveOfficeDailyFromModal() {
  var saveBtn = document.getElementById('office-import-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    var p        = _officeDailyParsed;
    var now      = p.importedAt;
    var src      = p.source;
    var modified = _collectImportFields();

    // 現在表示中のスコープの修正値を反映
    if (_officeDailyScope === 'office') {
      Object.assign(p.office, modified);
    } else {
      var memberId = document.getElementById('office-member-select').value;
      var m = p.members.find(function(x) { return x.memberId === memberId; });
      if (m) Object.assign(m, modified);
    }

    // 保存エントリを組み立て
    var officeEntry = Object.assign(
      { date: p.date, scope: 'office', memberId: '', memberName: '', source: src, importedAt: now },
      p.office
    );
    var memberEntries = p.members.map(function(m) {
      return Object.assign(
        { date: p.date, scope: 'member', source: src, importedAt: now },
        m
      );
    });

    await saveOfficeDaily([officeEntry].concat(memberEntries));
    closeOfficeDailyModal();

    // 進捗タブを即時更新
    refreshManagement();

    // 保存フィードバック
    var fbContainer = document.getElementById('office-daily-import-feedback');
    if (fbContainer) {
      fbContainer.textContent = '✓ 取込完了';
      fbContainer.style.color = 'var(--accent-emerald)';
      fbContainer.style.fontSize = '13px';
      fbContainer.style.marginTop = '8px';
      setTimeout(function() { if (fbContainer) fbContainer.textContent = ''; }, 2500);
    }
  } catch (err) {
    alert('保存エラー: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存する';
  }
}

// ------------------------------------------------------------------
// アプリ初期化
// ------------------------------------------------------------------

function initApp() {
  initNavigation();
  updateHeaderDate();
  initInputTab();
  initDashboardTab();
  initHistoryTab();
  initKgiTab();
  initAiReportCard();
  initOfficeAiReportCard();
  initOfficeDailyImport();
  initOfficeImportTab();
  initOfficeHistoryTab();
  initOfficeKgiTab();
  initOfficeDashboardTab();
  initSetupTriggersBtn();
  initAppHeightFix();
  initScrollIntoViewOnFocus();
  initSortable();
  initHeaderReload();
  console.log('Nice Serviceman 日報 - 初期化完了');
}

function initHeaderReload() {
  var btn = document.getElementById('header-title');
  var icon = document.getElementById('header-icon');
  var isReloading = false;
  if (!btn) return;
  btn.addEventListener('click', function() {
    if (isReloading) return;
    var tabId = (_activeSection === 'office') ? _lastOfficeTab : _lastPersonalTab;
    if (tabId === 'tab-input' && hasUnsavedInputChanges()) {
      if (!confirm('入力中の内容が保存されていません。再読み込みすると入力内容は失われます。続行しますか？')) return;
    }
    isReloading = true;
    historyState.allData = null;
    var origText = btn.textContent;
    btn.textContent = '更新中...';
    btn.style.opacity = '0.5';
    if (icon) {
      var nextRotation = (parseInt(icon.dataset.rotation || '0', 10)) + 360;
      icon.dataset.rotation = String(nextRotation);
      icon.style.transform = 'rotate(' + nextRotation + 'deg)';
    }
    var done = function() {
      btn.textContent = origText;
      btn.style.opacity = '';
      isReloading = false;
    };
    var p;
    if (tabId === 'tab-dashboard') {
      p = refreshDashboard();
    } else if (tabId === 'tab-history') {
      p = renderHistContent();
    } else if (tabId === 'tab-office-dashboard') {
      p = refreshManagement();
    } else if (tabId === 'tab-office-history') {
      p = refreshOfficeHistory();
    } else {
      var today = document.getElementById('entry-date') ? document.getElementById('entry-date').value : getTodayJST();
      p = loadEntry(today || getTodayJST());
    }
    if (p && typeof p.then === 'function') {
      p.then(done).catch(done);
    } else {
      done();
    }
  });
}

// GAS iframe / 古い iOS 対応: window.innerHeight で app 高さを補正
function initAppHeightFix() {
  var app = document.getElementById('app');
  if (!app) return;
  function setH() {
    app.style.height = window.innerHeight + 'px';
  }
  setH();
  window.addEventListener('resize', setH);
  window.addEventListener('orientationchange', function() { setTimeout(setH, 250); });
}

// キーボード表示時にフォーカス中の入力欄が隠れないよう scrollIntoView する（iOS Safari 対策）
function initScrollIntoViewOnFocus() {
  document.getElementById('content').addEventListener('focusin', function(e) {
    var el = e.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      setTimeout(function() {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    }
  });
}

// ============================================================
// ブロック並び替え（ドラッグ＆ドロップ）
// ============================================================
var _sortState = {
  dragging: null,    // ドラッグ中の .sort-item 要素
  ghost: null,       // ゴースト要素
  overEl: null,      // ハイライト中のターゲット
  overPos: null,     // 'top' | 'bottom'
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
};

var _SORT_TABS = [
  'tab-input', 'tab-dashboard', 'tab-history', 'tab-kgi',
  'tab-office-import', 'tab-office-dashboard', 'tab-office-history', 'tab-office-kgi',
];

function initSortable() {
  _SORT_TABS.forEach(function(tabId) {
    var tab = document.getElementById(tabId);
    if (!tab) return;
    restoreSortOrder(tabId);
    addSortHandles(tab);
  });
  document.addEventListener('pointermove', _onSortPointerMove);
  document.addEventListener('pointerup', _onSortPointerUp);
  document.addEventListener('pointercancel', _onSortPointerUp);
}

function addSortHandles(tabEl) {
  tabEl.querySelectorAll(':scope > .sort-item').forEach(function(item) {
    if (item.querySelector('.sort-handle')) return;
    var handle = document.createElement('div');
    handle.className = 'sort-handle';
    handle.textContent = '· · ·';
    handle.setAttribute('title', 'ドラッグして並び替え');
    item.insertBefore(handle, item.firstChild);
    handle.addEventListener('pointerdown', _onSortPointerDown);
  });
}

function _onSortPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  var handle = e.currentTarget;
  var item = handle.parentElement;
  var tab = item.parentElement;

  var rect = item.getBoundingClientRect();
  _sortState.dragging = item;
  _sortState.offsetX = e.clientX - rect.left;
  _sortState.offsetY = e.clientY - rect.top;
  _sortState.startX = e.clientX;
  _sortState.startY = e.clientY;
  _sortState.tabEl = tab;

  var ghost = item.cloneNode(true);
  ghost.className = 'sort-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.top = (e.clientY - _sortState.offsetY) + 'px';
  ghost.style.left = (e.clientX - _sortState.offsetX) + 'px';
  document.body.appendChild(ghost);
  _sortState.ghost = ghost;

  item.classList.add('sort-dragging');
  handle.setPointerCapture(e.pointerId);
}

function _onSortPointerMove(e) {
  if (!_sortState.dragging) return;
  var ghost = _sortState.ghost;
  ghost.style.top = (e.clientY - _sortState.offsetY) + 'px';
  ghost.style.left = (e.clientX - _sortState.offsetX) + 'px';

  // ゴーストを一時非表示にして要素取得
  ghost.style.display = 'none';
  var elBelow = document.elementFromPoint(e.clientX, e.clientY);
  ghost.style.display = '';

  _clearSortHighlight();

  if (!elBelow) return;
  var target = elBelow.closest('.sort-item');
  if (!target || target === _sortState.dragging) return;
  if (target.parentElement !== _sortState.tabEl) return;

  var rect = target.getBoundingClientRect();
  var mid = rect.top + rect.height / 2;
  var pos = e.clientY < mid ? 'top' : 'bottom';

  target.classList.add(pos === 'top' ? 'sort-over-top' : 'sort-over-bottom');
  _sortState.overEl = target;
  _sortState.overPos = pos;
}

function _onSortPointerUp(e) {
  if (!_sortState.dragging) return;

  var dragging = _sortState.dragging;
  var overEl = _sortState.overEl;
  var overPos = _sortState.overPos;
  var tabEl = _sortState.tabEl;

  if (overEl && overEl !== dragging) {
    if (overPos === 'top') {
      tabEl.insertBefore(dragging, overEl);
    } else {
      tabEl.insertBefore(dragging, overEl.nextSibling);
    }
    _saveSortOrder(tabEl.id);
  }

  dragging.classList.remove('sort-dragging');
  _clearSortHighlight();
  if (_sortState.ghost) {
    _sortState.ghost.remove();
  }
  _sortState.dragging = null;
  _sortState.ghost = null;
  _sortState.overEl = null;
  _sortState.overPos = null;
  _sortState.tabEl = null;
}

function _clearSortHighlight() {
  if (_sortState.overEl) {
    _sortState.overEl.classList.remove('sort-over-top', 'sort-over-bottom');
  }
}

function _saveSortOrder(tabId) {
  var tab = document.getElementById(tabId);
  if (!tab) return;
  var order = [];
  tab.querySelectorAll(':scope > .sort-item').forEach(function(item) {
    order.push(item.dataset.sortId);
  });
  try {
    localStorage.setItem('sortOrder_' + tabId, JSON.stringify(order));
  } catch (ex) {}
}

function restoreSortOrder(tabId) {
  var tab = document.getElementById(tabId);
  if (!tab) return;
  var saved;
  try {
    saved = JSON.parse(localStorage.getItem('sortOrder_' + tabId));
  } catch (ex) { return; }
  if (!Array.isArray(saved) || saved.length === 0) return;
  saved.forEach(function(id) {
    var el = tab.querySelector(':scope > [data-sort-id="' + id + '"]');
    if (el) tab.appendChild(el);
  });
}

// DOMの準備ができたら起動
document.addEventListener('DOMContentLoaded', initApp);
