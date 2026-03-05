/**
 * EggWatch Pro — Data Logs & History Module
 * Manages the logs table, history table, filtering, pagination, and CSV export.
 */

const Logs = (() => {
  // ── State ──────────────────────────────────────────────────
  let allHistory    = [];
  let filteredHistory = [];
  let currentPage   = 1;
  const pageSize    = 25;
  let autoRefreshTimer = null;
  const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15 minutes

  // ── DOM refs ───────────────────────────────────────────────
  const logsBody       = document.getElementById('logsBody');
  const recentLogsBody = document.getElementById('recentLogsBody');
  const historyBody    = document.getElementById('historyBody');
  const historyCount   = document.getElementById('historyCount');
  const historyPagination = document.getElementById('historyPagination');
  const totalLogsEl    = document.getElementById('totalLogs');

  // ── Format helpers ─────────────────────────────────────────
  function formatTimestamp(iso) {
    return new Intl.DateTimeFormat('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(iso));
  }

  function tempClass(t) {
    const thresh = Alerts.getThresholds();
    if (t < thresh.tempMin) return 'temp-low';
    if (t > thresh.tempMax) return 'temp-high';
    return 'temp-normal';
  }

  function renderRow(log) {
    const cls  = tempClass(log.temperature);
    const turn = log.eggTurn
      ? '<span class="turn-yes"><i class="fa-solid fa-rotate"></i> Yes</span>'
      : '<span class="turn-no">No</span>';
    return `
      <tr>
        <td>${formatTimestamp(log.timestamp)}</td>
        <td class="${cls}">${log.temperature.toFixed(2)}</td>
        <td>${log.humidity.toFixed(1)}</td>
        <td>${turn}</td>
      </tr>
    `;
  }

  // ── Recent Logs (dashboard preview, latest 20) ─────────────
  async function loadRecentLogs() {
    if (!recentLogsBody) return;
    try {
      const logs = await API.getLogs(20);
      if (!logs || logs.length === 0) {
        recentLogsBody.innerHTML = '<tr><td colspan="4" class="empty-row">No logs available</td></tr>';
        return;
      }
      recentLogsBody.innerHTML = [...logs].reverse().map(renderRow).join('');
    } catch (e) {
      recentLogsBody.innerHTML = '<tr><td colspan="4" class="empty-row text-danger">Failed to load logs</td></tr>';
    }
  }

  // ── Logs Page (latest 20, auto-refresh every 15 min) ───────
  async function loadLogs() {
    if (!logsBody) return;
    logsBody.innerHTML = '<tr><td colspan="4" class="empty-row"><i class="fa-solid fa-spinner spin"></i> Loading…</td></tr>';
    try {
      const logs = await API.getLogs(20);
      if (!logs || logs.length === 0) {
        logsBody.innerHTML = '<tr><td colspan="4" class="empty-row">No logs available</td></tr>';
        return;
      }
      logsBody.innerHTML = [...logs].reverse().map(renderRow).join('');
    } catch (e) {
      logsBody.innerHTML = '<tr><td colspan="4" class="empty-row text-danger">Failed to load logs</td></tr>';
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(() => {
      loadLogs();
      loadRecentLogs();
    }, AUTO_REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  // ── Full History ───────────────────────────────────────────
  async function loadHistory(filters = {}) {
    if (!historyBody) return;
    historyBody.innerHTML = '<tr><td colspan="4" class="empty-row"><i class="fa-solid fa-spinner spin"></i> Loading…</td></tr>';
    try {
      allHistory      = await API.getHistory(filters);
      filteredHistory = allHistory;
      currentPage     = 1;
      renderHistoryPage();
      if (totalLogsEl) totalLogsEl.textContent = allHistory.length;
    } catch (e) {
      historyBody.innerHTML = '<tr><td colspan="4" class="empty-row text-danger">Failed to load history</td></tr>';
    }
  }

  function renderHistoryPage() {
    if (!historyBody) return;

    const total = filteredHistory.length;
    const start = (currentPage - 1) * pageSize;
    const end   = Math.min(start + pageSize, total);
    const page  = [...filteredHistory].reverse().slice(start, end);

    if (total === 0) {
      historyBody.innerHTML = '<tr><td colspan="4" class="empty-row">No records match your filters</td></tr>';
      if (historyCount) historyCount.textContent = '0 records';
      renderPagination(0);
      return;
    }

    historyBody.innerHTML = page.map(renderRow).join('');
    if (historyCount) historyCount.textContent = `Showing ${start + 1}–${end} of ${total} records`;
    renderPagination(total);
  }

  function renderPagination(total) {
    if (!historyPagination) return;
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) { historyPagination.innerHTML = ''; return; }

    let html = '';

    // Prev
    html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}"
      onclick="Logs.goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-left"></i>
    </button>`;

    // Page numbers (show max 7 around current)
    const range = pageRange(currentPage, totalPages);
    range.forEach(p => {
      if (p === '…') {
        html += `<span class="page-btn" style="cursor:default">…</span>`;
      } else {
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}"
          onclick="Logs.goToPage(${p})">${p}</button>`;
      }
    });

    // Next
    html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}"
      onclick="Logs.goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-right"></i>
    </button>`;

    historyPagination.innerHTML = html;
  }

  function pageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }

  function goToPage(page) {
    const totalPages = Math.ceil(filteredHistory.length / pageSize);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderHistoryPage();
    // Scroll to top of table
    if (historyBody) historyBody.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Filter History ─────────────────────────────────────────
  function applyFilters() {
    const date    = document.getElementById('filterDate')?.value    || '';
    const tempMin = document.getElementById('filterTempMin')?.value || '';
    const tempMax = document.getElementById('filterTempMax')?.value || '';
    const humMin  = document.getElementById('filterHumMin')?.value  || '';
    const humMax  = document.getElementById('filterHumMax')?.value  || '';

    loadHistory({ date, tempMin, tempMax, humMin, humMax });
  }

  function clearFilters() {
    const ids = ['filterDate', 'filterTempMin', 'filterTempMax', 'filterHumMin', 'filterHumMax'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadHistory();
  }

  // ── Export CSV ─────────────────────────────────────────────
  function exportCsv() {
    const data = filteredHistory.length > 0 ? filteredHistory : allHistory;
    if (data.length === 0) {
      Toast.show('No data to export', 'warning');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    API.exportToCsv(data, `eggwatch_history_${date}.csv`);
    Toast.show('CSV exported successfully!', 'success', `${data.length} records exported`);
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    loadRecentLogs();
    loadLogs();
    loadHistory();
    startAutoRefresh();
  }

  return {
    init,
    loadLogs,
    loadRecentLogs,
    loadHistory,
    applyFilters,
    clearFilters,
    exportCsv,
    goToPage,
    startAutoRefresh,
    stopAutoRefresh,
  };
})();
