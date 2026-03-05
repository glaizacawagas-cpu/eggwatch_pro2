/**
 * EggWatch Pro — Alerts System Module
 * Manages alert detection, display, and notifications.
 */

const Alerts = (() => {
  // ── State ──────────────────────────────────────────────────
  let alertsList   = [];
  let alertCount   = 0;
  let todayAlerts  = 0;
  let lastTurnTime = null;
  let missedTurns  = 0;

  // ── Thresholds (defaults, overridable) ────────────────────
  let thresholds = {
    tempMin:  parseFloat(localStorage.getItem('thresh_tempMin')  || '36'),
    tempMax:  parseFloat(localStorage.getItem('thresh_tempMax')  || '38.5'),
    humMin:   parseFloat(localStorage.getItem('thresh_humMin')   || '50'),
    humMax:   parseFloat(localStorage.getItem('thresh_humMax')   || '65'),
    maxTurnDelay: 30, // minutes past scheduled turn before alert
  };

  // ── Notification settings ──────────────────────────────────
  let settings = {
    tempAlerts:  true,
    humAlerts:   true,
    turnAlerts:  true,
    soundAlerts: false,
  };

  // ── DOM refs ───────────────────────────────────────────────
  const alertsListEl   = document.getElementById('alertsList');
  const alertBadgeEl   = document.getElementById('alertBadge');
  const alertBannerEl  = document.getElementById('alertBanner');
  const alertBannerInner = document.getElementById('alertBannerInner');
  const alertsTodayEl  = document.getElementById('alertsToday');

  // ── Alert Severity Icons ───────────────────────────────────
  const icons = {
    critical: 'fa-circle-exclamation',
    warning:  'fa-triangle-exclamation',
    info:     'fa-circle-info',
  };

  // ── Create Alert ───────────────────────────────────────────
  function createAlert(type, severity, title, message) {
    const alert = {
      id:        ++alertCount,
      type,
      severity,
      title,
      message,
      timestamp: new Date(),
      read:      false,
    };
    alertsList.unshift(alert);
    todayAlerts++;

    // Keep max 50 alerts
    if (alertsList.length > 50) alertsList.pop();

    renderAlerts();
    updateBadge();
    showBanner(alert);
    showToast(alert);
    if (settings.soundAlerts) playAlertSound(severity);

    if (alertsTodayEl) alertsTodayEl.textContent = todayAlerts;

    return alert;
  }

  // ── Check Sensor Data ──────────────────────────────────────
  function checkData(data) {
    const { temperature, humidity, motorRunning, nextTurnMs } = data;

    // Temperature checks
    if (settings.tempAlerts) {
      if (temperature < thresholds.tempMin) {
        // Only alert if not already alerted recently (debounce 5 min)
        if (!isRecentAlert('temp_low')) {
          createAlert('temp_low', 'critical',
            '🌡️ Temperature Too Low',
            `Current: ${temperature}°C — Below minimum ${thresholds.tempMin}°C`
          );
        }
      } else if (temperature > thresholds.tempMax) {
        if (!isRecentAlert('temp_high')) {
          createAlert('temp_high', 'critical',
            '🌡️ Temperature Too High',
            `Current: ${temperature}°C — Above maximum ${thresholds.tempMax}°C`
          );
        }
      }
    }

    // Humidity checks
    if (settings.humAlerts) {
      if (humidity < thresholds.humMin) {
        if (!isRecentAlert('hum_low')) {
          createAlert('hum_low', 'warning',
            '💧 Humidity Too Low',
            `Current: ${humidity}% — Below minimum ${thresholds.humMin}%`
          );
        }
      } else if (humidity > thresholds.humMax) {
        if (!isRecentAlert('hum_high')) {
          createAlert('hum_high', 'warning',
            '💧 Humidity Too High',
            `Current: ${humidity}% — Above maximum ${thresholds.humMax}%`
          );
        }
      }
    }

    // Egg turn checks
    if (settings.turnAlerts && nextTurnMs) {
      const overdue = Date.now() - nextTurnMs;
      if (overdue > thresholds.maxTurnDelay * 60 * 1000) {
        if (!isRecentAlert('turn_missed')) {
          createAlert('turn_missed', 'critical',
            '🥚 Egg Turn Missed',
            `Scheduled turn is ${Math.round(overdue / 60000)} minutes overdue!`
          );
        }
      }
    }
  }

  // ── Debounce: prevent duplicate alerts within 5 minutes ───
  function isRecentAlert(type) {
    const fiveMin = 5 * 60 * 1000;
    return alertsList.some(a => a.type === type && (Date.now() - a.timestamp) < fiveMin);
  }

  // ── Render Alerts Panel ────────────────────────────────────
  function renderAlerts() {
    if (!alertsListEl) return;

    if (alertsList.length === 0) {
      alertsListEl.innerHTML = '<div class="no-alerts"><i class="fa-solid fa-check-circle" style="color:var(--color-normal);font-size:2rem;display:block;margin-bottom:8px"></i>No active alerts</div>';
      return;
    }

    alertsListEl.innerHTML = alertsList.map(a => `
      <div class="alert-item ${a.severity}" data-id="${a.id}">
        <div class="alert-item-icon">
          <i class="fa-solid ${icons[a.severity] || icons.info}"></i>
        </div>
        <div class="alert-item-body">
          <div class="alert-item-title">${a.title}</div>
          <div class="alert-item-msg">${a.message}</div>
          <div class="alert-item-time">${formatTime(a.timestamp)}</div>
        </div>
        <button class="alert-dismiss" onclick="Alerts.dismiss(${a.id})" title="Dismiss">
          <i class="fa-solid fa-xmark" style="color:var(--text-muted);font-size:0.8rem"></i>
        </button>
      </div>
    `).join('');
  }

  // ── Update Badge ───────────────────────────────────────────
  function updateBadge() {
    const unread = alertsList.filter(a => !a.read).length;
    if (!alertBadgeEl) return;
    if (unread > 0) {
      alertBadgeEl.style.display = 'flex';
      alertBadgeEl.textContent   = unread > 9 ? '9+' : unread;
    } else {
      alertBadgeEl.style.display = 'none';
    }
  }

  // ── Banner ─────────────────────────────────────────────────
  let bannerTimer = null;
  function showBanner(alert) {
    if (!alertBannerEl || !alertBannerInner) return;
    alertBannerInner.innerHTML = `
      <i class="fa-solid ${icons[alert.severity] || icons.info}" style="margin-right:8px"></i>
      <strong>${alert.title}</strong> — ${alert.message}
    `;
    alertBannerEl.style.display = 'flex';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      alertBannerEl.style.display = 'none';
    }, 8000);
  }

  // ── Toast ──────────────────────────────────────────────────
  function showToast(alert) {
    const severityMap = { critical: 'error', warning: 'warning', info: 'info' };
    const type = severityMap[alert.severity] || 'info';
    if (window.Toast) Toast.show(alert.title, type, alert.message);
  }

  // ── Sound ──────────────────────────────────────────────────
  function playAlertSound(severity) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = severity === 'critical' ? 880 : 660;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  }

  // ── Dismiss ────────────────────────────────────────────────
  function dismiss(id) {
    alertsList = alertsList.filter(a => a.id !== id);
    renderAlerts();
    updateBadge();
  }

  function clearAll() {
    alertsList = [];
    renderAlerts();
    updateBadge();
    if (alertBannerEl) alertBannerEl.style.display = 'none';
  }

  function markAllRead() {
    alertsList.forEach(a => a.read = true);
    updateBadge();
  }

  // ── Threshold Management ───────────────────────────────────
  function setThresholds(t) {
    Object.assign(thresholds, t);
    localStorage.setItem('thresh_tempMin', thresholds.tempMin);
    localStorage.setItem('thresh_tempMax', thresholds.tempMax);
    localStorage.setItem('thresh_humMin',  thresholds.humMin);
    localStorage.setItem('thresh_humMax',  thresholds.humMax);
  }

  function getThresholds() { return { ...thresholds }; }

  function setSettings(s) { Object.assign(settings, s); }
  function getSettings()  { return { ...settings }; }

  // ── Manual Alert (for testing / external use) ──────────────
  function addAlert(type, severity, title, message) {
    return createAlert(type, severity, title, message);
  }

  // ── Helpers ────────────────────────────────────────────────
  function formatTime(date) {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(date);
  }

  function getCount()       { return alertsList.length; }
  function getTodayCount()  { return todayAlerts; }
  function getAlerts()      { return [...alertsList]; }

  return {
    checkData,
    dismiss,
    clearAll,
    markAllRead,
    setThresholds,
    getThresholds,
    setSettings,
    getSettings,
    addAlert,
    getCount,
    getTodayCount,
    getAlerts,
    renderAlerts,
    updateBadge,
  };
})();

// ── Toast Notification System ──────────────────────────────
const Toast = (() => {
  const container = document.getElementById('toastContainer');

  const iconMap = {
    success: 'fa-circle-check',
    error:   'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };

  function show(title, type = 'info', message = '', duration = 4000) {
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
      <div style="flex:1">
        <div style="font-weight:600;color:var(--text-primary)">${title}</div>
        ${message ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">${message}</div>` : ''}
      </div>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return { show };
})();
