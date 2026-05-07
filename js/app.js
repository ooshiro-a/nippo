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
      <input type="number" class="kgi-field-input" id="entry-${field.key}"
             value="0" min="0" inputmode="numeric" />
      <span class="kgi-field-unit">${field.unit}</span>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('.kgi-field-input').forEach(input => {
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

    KGI_FIELDS.filter(f => f.color === 'cyan').forEach(field => {
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

  try {
    const result = await saveEntry(data);
    if (!result || result.success !== true) {
      throw new Error(result && result.error ? result.error : JSON.stringify(result));
    }
    showSaveFeedback(btn);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '保存する';
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
    renderPlanCard(
      promotionActual,
      budget ? (budget.officePlan || 0) : 0,
      { actual: 'office-plan-actual', budget: 'office-plan-budget', rate: 'office-plan-rate', bar: 'office-plan-bar', shortage: 'office-plan-shortage' }
    );
    renderKpiChart(totals, budget);
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
// KGI設定タブ
// ------------------------------------------------------------------

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
        <input type="number" class="kgi-field-input" id="kgi-${field.key}"
               value="0" min="0" inputmode="numeric" />
        <span class="kgi-field-unit">${field.unit}</span>
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
    KGI_FIELDS.forEach(field => {
      const el = document.getElementById(`kgi-${field.key}`);
      if (el) el.value = data ? (data[field.key] ?? 0) : 0;
    });
  } catch (e) {
    console.warn('予算ロード失敗:', e);
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
    showSaveFeedback(btn);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '保存する';
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
  initKgiTab();
  console.log('Nice Serviceman 日報 - 初期化完了');
}

// DOMの準備ができたら起動
document.addEventListener('DOMContentLoaded', initApp);
