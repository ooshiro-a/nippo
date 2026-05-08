/**
 * app.js - メインロジック・タブ切り替え
 * Nice Serviceman 日報
 */

// ------------------------------------------------------------------
// タブ切り替え
// ------------------------------------------------------------------

function initTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // アクティブ切り替え
      navBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      // コンテンツエリアをトップにスクロール
      document.getElementById('content').scrollTop = 0;
    });
  });
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

function buildInputKpiFields() {
  const container = document.getElementById('entry-kpi-container');
  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    const row = document.createElement('div');
    row.className = 'kgi-field-row';
    row.innerHTML = `
      <span class="kgi-field-label">${field.label}</span>
      <div class="kgi-field-input-wrap">
        <input type="number" class="kgi-field-input" id="entry-${field.key}"
               value="0" min="0" inputmode="numeric" />
        <span class="kgi-field-unit">${field.unit}</span>
      </div>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('.kgi-field-input').forEach(input => {
    input.addEventListener('focus', () => input.select());
  });

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
        <input type="number" class="kgi-field-input" id="entry-${field.key}"
               value="0" min="0" inputmode="numeric" />
        <span class="kgi-field-unit">${field.unit}</span>
      </div>
    `;
    forecastContainer.appendChild(row);
  });
  forecastContainer.querySelectorAll('.kgi-field-input').forEach(input => {
    input.addEventListener('focus', () => input.select());
  });
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
  if (!date) return;
  try {
    const yearMonth = date.slice(0, 7);
    const entries = await getEntries(yearMonth);
    const entry = entries.find(e => e.date === date);
    console.log('[loadEntry]', date, '-> entries:', entries.length, '件 / match:', entry ? 'あり' : 'なし');

    KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
      const el = document.getElementById(`entry-${field.key}`);
      if (el) el.value = entry ? (entry[field.key] ?? 0) : 0;
    });

    FORECAST_FIELDS.forEach(field => {
      const el = document.getElementById(`entry-${field.key}`);
      if (el) el.value = entry ? (entry[field.key] ?? 0) : 0;
    });

    const actions = entry ? (entry.relationshipActions || []) : [];
    document.querySelectorAll('#relationship-tags .tag-btn').forEach(btn => {
      btn.classList.toggle('selected', actions.includes(btn.textContent));
    });

    document.getElementById('positive-count').textContent = entry ? (entry.positiveFeedback || 0) : 0;
    document.getElementById('negative-count').textContent = entry ? (entry.negativeFeedback || 0) : 0;
    document.getElementById('entry-memorable-visit').value = entry ? (entry.memorableVisit || '') : '';
    document.getElementById('entry-notes').value = entry ? (entry.notes || '') : '';
    document.getElementById('entry-notes-important').checked = entry ? !!entry.notesImportant : false;
    document.getElementById('entry-insight').value = entry ? (entry.insight || '') : '';
    document.getElementById('entry-next-action').value = entry ? (entry.nextAction || '') : '';

    updateNotesImportant();
  } catch (e) {
    console.warn('エントリロード失敗:', e);
  }
}

function updateNotesImportant() {
  const checked = document.getElementById('entry-notes-important').checked;
  document.getElementById('entry-notes').classList.toggle('notes-important', checked);
}

async function handleSaveEntry() {
  const btn = document.getElementById('entry-save-btn');
  const date = document.getElementById('entry-date').value;
  if (!date) return;

  btn.disabled = true;
  btn.textContent = '保存中...';

  const actions = Array.from(document.querySelectorAll('#relationship-tags .tag-btn.selected'))
    .map(b => b.textContent);

  const data = {
    date,
    relationshipActions: actions,
    positiveFeedback: Number(document.getElementById('positive-count').textContent) || 0,
    negativeFeedback: Number(document.getElementById('negative-count').textContent) || 0,
    memorableVisit: document.getElementById('entry-memorable-visit').value,
    notes: document.getElementById('entry-notes').value,
    notesImportant: document.getElementById('entry-notes-important').checked,
    insight: document.getElementById('entry-insight').value,
    nextAction: document.getElementById('entry-next-action').value,
  };

  KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    data[field.key] = el ? Number(el.value) || 0 : 0;
  });

  FORECAST_FIELDS.forEach(field => {
    const el = document.getElementById(`entry-${field.key}`);
    data[field.key] = el ? Number(el.value) || 0 : 0;
  });

  try {
    const result = await saveEntry(data);
    if (!result || result.success !== true) {
      throw new Error(result && result.error ? result.error : JSON.stringify(result));
    }
    console.log('[saveEntry] 成功:', date);
    historyState.allData = null; // 履歴キャッシュを無効化
    showSaveFeedback(btn);
    // 保存後にサーバーから再読み込みして確認
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

function initDashboardTab() {
  document.querySelector('[data-tab="tab-dashboard"]').addEventListener('click', refreshDashboard);
  refreshDashboard();
}

async function refreshDashboard() {
  const yearMonth = getCurrentYearMonthJST();
  try {
    const [entries, budget] = await Promise.all([
      getEntries(yearMonth),
      getBudget(yearMonth),
    ]);
    renderTrustScore(entries);
    const totals = calcMonthlyTotals(entries);
    const promotionActual = totals.promotionAmount || 0;
    renderPlanCard(
      promotionActual,
      budget ? (budget.personalPlan || 0) : 0,
      { actual: 'personal-plan-actual', budget: 'personal-plan-budget', rate: 'personal-plan-rate', bar: 'personal-plan-bar', shortage: 'personal-plan-shortage' }
    );
    renderKpiChart(totals, budget);

    const latestEntry = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
    const personalUnsettled = latestEntry ? (latestEntry.personalUnsettled || 0) : 0;
    const officeUnsettled   = latestEntry ? (latestEntry.officeUnsettled   || 0) : 0;
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
  } catch (e) {
    console.warn('ダッシュボードロード失敗:', e);
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
  const rate = plan > 0 ? Math.min(Math.round(actual / plan * 100), 999) : 0;
  const shortage = Math.max(0, plan - actual);
  const colorClass = getProgressColorClass(rate);

  document.getElementById(ids.actual).textContent = formatCurrency(actual);
  document.getElementById(ids.budget).textContent = formatCurrency(plan);
  document.getElementById(ids.rate).textContent = rate + '%';
  document.getElementById(ids.rate).style.color = getAccentColor(colorClass);
  document.getElementById(ids.shortage).textContent = formatCurrency(shortage);

  const bar = document.getElementById(ids.bar);
  bar.style.width = Math.min(rate, 100) + '%';
  bar.className = `progress-fill ${colorClass}`;
}

function getAccentColor(colorClass) {
  return { green: '#4ade80', cyan: '#22d3ee', amber: '#fbbf24', red: '#f87171' }[colorClass] || '#94a3b8';
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

  const ctx = document.getElementById('kpi-chart').getContext('2d');

  if (dashboardChart) {
    dashboardChart.destroy();
    dashboardChart = null;
  }

  if (labels.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#475569';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KGI設定タブで計画を入力してください', ctx.canvas.width / 2, 60);
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
  allData: null,
};

function initHistoryTab() {
  document.getElementById('hist-view-select').addEventListener('change', onHistViewChange);
  document.querySelector('[data-tab="tab-history"]').addEventListener('click', () => {
    renderHistPeriodControl();
    renderHistContent();
  });
  renderHistPeriodControl();
  initReportControls();
}

function onHistViewChange() {
  historyState.view = document.getElementById('hist-view-select').value;
  renderHistPeriodControl();
  renderHistContent();
}

function onHistPeriodChange() {
  const view = historyState.view;
  if (view === 'daily' || view === 'weekly') {
    historyState.yearMonth = document.getElementById('hist-month-input').value || getCurrentYearMonthJST();
  } else if (view === 'monthly') {
    historyState.year = Number(document.getElementById('hist-year-input').value) || Number(getTodayJST().slice(0, 4));
  } else if (view === 'quarterly') {
    const yearEl = document.getElementById('hist-year-input');
    const qEl = document.getElementById('hist-quarter-select');
    if (yearEl) historyState.year = Number(yearEl.value) || Number(getTodayJST().slice(0, 4));
    if (qEl) historyState.quarter = qEl.value;
  }
  renderHistContent();
}

function renderHistPeriodControl() {
  const container = document.getElementById('hist-period-control');
  const view = historyState.view;
  if (view === 'daily' || view === 'weekly') {
    container.innerHTML = `<input type="month" id="hist-month-input" value="${historyState.yearMonth}" />`;
    document.getElementById('hist-month-input').addEventListener('change', onHistPeriodChange);
  } else if (view === 'monthly') {
    container.innerHTML = `<input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" />`;
    document.getElementById('hist-year-input').addEventListener('change', onHistPeriodChange);
  } else if (view === 'quarterly') {
    container.innerHTML = `
      <input type="number" id="hist-year-input" value="${historyState.year}" min="2020" max="2040" style="flex:1" />
      <select id="hist-quarter-select" style="flex:1">
        <option value="all"${historyState.quarter === 'all' ? ' selected' : ''}>全四半期</option>
        <option value="Q1"${historyState.quarter === 'Q1' ? ' selected' : ''}>Q1（1〜3月）</option>
        <option value="Q2"${historyState.quarter === 'Q2' ? ' selected' : ''}>Q2（4〜6月）</option>
        <option value="Q3"${historyState.quarter === 'Q3' ? ' selected' : ''}>Q3（7〜9月）</option>
        <option value="Q4"${historyState.quarter === 'Q4' ? ' selected' : ''}>Q4（10〜12月）</option>
      </select>
    `;
    document.getElementById('hist-year-input').addEventListener('change', onHistPeriodChange);
    document.getElementById('hist-quarter-select').addEventListener('change', onHistPeriodChange);
  } else {
    container.innerHTML = '';
  }
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
  } catch (e) {
    console.warn('履歴ロード失敗:', e);
    document.getElementById('hist-content').innerHTML = '<div class="hist-empty">データの読み込みに失敗しました</div>';
  }
}

async function ensureHistData() {
  if (!historyState.allData) {
    const data = await getAllData();
    historyState.allData = {
      entries: Array.isArray(data.entries) ? data.entries : [],
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
    };
  }
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
    const isYen = field.unit === '円';
    const actualStr = isYen ? formatCurrency(actual) : formatNumber(actual) + field.unit;
    const planStr = plan > 0 ? (isYen ? ' / ' + formatCurrency(plan) : ' / ' + formatNumber(plan) + field.unit) : '';
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
    const isYen = field.unit === '円';
    return `<div class="kgi-field-row">
      <span class="kgi-field-label">${field.label}</span>
      <span style="font-family:var(--font-mono);font-size:13px">${isYen ? formatCurrency(val) : formatNumber(val) + field.unit}</span>
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
    <div class="card-title">${formatDate(entry.date)}</div>
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

function handlePrintReport() {
  window.print();
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

  if (view === 'weekly') {
    const filtered = entries.filter(e => e.date.startsWith(historyState.yearMonth));
    const weeks = groupEntriesByWeek(filtered, historyState.yearMonth);
    return weeks.map(w => buildWeeklyReportText(w, historyState.yearMonth)).join('\n\n');
  }

  // 月次・その他 → 月次報告
  const ym = (view === 'monthly' || view === 'quarterly' || view === 'yearly')
    ? historyState.yearMonth  // 月次の場合は yearMonth を使う
    : historyState.yearMonth;
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
    const formatted = f.unit === '円' ? formatCurrency(val) : formatNumber(val) + f.unit;
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
    const actualStr = f.unit === '円' ? formatCurrency(actual) : formatNumber(actual) + f.unit;
    const planStr = plan > 0
      ? (f.unit === '円' ? ` / ${formatCurrency(plan)}（${Math.round(actual / plan * 100)}%）` : ` / ${formatNumber(plan)}${f.unit}（${Math.round(actual / plan * 100)}%）`)
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

const FORECAST_FIELDS = [
  { key: 'personalUnsettled', label: '個人末見額',   unit: '円' },
  { key: 'officeUnsettled',   label: '営業所末見額', unit: '円' },
];

const KGI_FIELDS = [
  { key: 'inspection',            label: '点検件数',         unit: '件', color: 'cyan' },
  { key: 'promotionAmount',       label: '促進受注額',       unit: '円', color: 'cyan' },
  { key: 'promotionCount',        label: '促進件数',         unit: '件', color: 'cyan' },
  { key: 'maintenanceThisMonth',  label: '当月保守継続',     unit: '件', color: 'cyan' },
  { key: 'maintenanceNextMonth',  label: '次月保守継続',     unit: '件', color: 'cyan' },
  { key: 'maintenanceNext2Month', label: '次々月保守継続',   unit: '件', color: 'cyan' },
  { key: 'newAcquisition',        label: '新規保守',         unit: '件', color: 'cyan' },
  { key: 'acCleaning',            label: 'エアコン洗浄',     unit: '件', color: 'cyan' },
  { key: 'fullMaintenance',       label: 'フルメンテリース', unit: '件', color: 'cyan' },
  { key: 'tossUp',                label: '営業トスアップ',   unit: '件', color: 'cyan' },
  { key: 'personalPlan',          label: '個人計画額',       unit: '円', color: 'emerald' },
  { key: 'officePlan',            label: '営業所計画額',     unit: '円', color: 'amber' },
];

function initKgiTab() {
  const monthInput = document.getElementById('kgi-month');
  monthInput.value = getTodayJST().slice(0, 7);

  buildKgiFields();

  monthInput.addEventListener('change', () => loadBudget(monthInput.value));
  document.getElementById('kgi-save-btn').addEventListener('click', handleSaveBudget);

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
          <input type="number" class="kgi-field-input" id="kgi-${field.key}"
                 value="0" min="0" inputmode="numeric" />
          <span class="kgi-field-unit">${field.unit}</span>
        </div>
      `;
      card.appendChild(row);
    });

    container.appendChild(card);
  });

  container.querySelectorAll('.kgi-field-input').forEach(input => {
    input.addEventListener('focus', () => input.select());
  });
}

async function loadBudget(yearMonth) {
  if (!yearMonth) return;
  try {
    const data = await getBudget(yearMonth);
    console.log('[loadBudget]', yearMonth, '->', data);
    KGI_FIELDS.forEach(field => {
      const el = document.getElementById(`kgi-${field.key}`);
      if (el) el.value = data ? (data[field.key] ?? 0) : 0;
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
    data[field.key] = el ? Number(el.value) || 0 : 0;
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
// アプリ初期化
// ------------------------------------------------------------------

function initApp() {
  initTabs();
  updateHeaderDate();
  initInputTab();
  initDashboardTab();
  initHistoryTab();
  initKgiTab();
  console.log('Nice Serviceman 日報 - 初期化完了');
}

// DOMの準備ができたら起動
document.addEventListener('DOMContentLoaded', initApp);
