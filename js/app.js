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
// アプリ初期化
// ------------------------------------------------------------------

function initApp() {
  initTabs();
  updateHeaderDate();
  console.log('Nice Serviceman 日報 - 初期化完了');
}

// DOMの準備ができたら起動
document.addEventListener('DOMContentLoaded', initApp);
