/**
 * EggWatch Pro — Main Application Controller
 * Single-page scroll layout version
 * Orchestrates all modules: monitoring, navigation, controls, settings.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let schedulePaused = false;
  let countdownTimer = null;
  let nextTurnMs     = null;
  let uptimeStart    = Date.now();

  // ── DOM refs ───────────────────────────────────────────────
  const mobileMenuBtn  = document.getElementById('mobileMenuBtn');
  const mobileNav      = document.getElementById('mobileNav');
  const overlay        = document.getElementById('overlay');
  const themeToggle    = document.getElementById('themeToggle');
  const themeIcon      = document.getElementById('themeIcon');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const lastUpdated    = document.getElementById('lastUpdated');
  const statusDot      = document.getElementById('statusDot');
  const statusText     = document.getElementById('statusText');
  const refreshBtn     = document.getElementById('refreshBtn');
  const alertBell      = document.getElementById('alertBell');
  const alertsPanel    = document.getElementById('alertsPanel');
  const alertClose     = document.getElementById('alertClose');
  const closeAlertsPanel = document.getElementById('closeAlertsPanel');
  const clearAllAlerts = document.getElementById('clearAllAlerts');

  // ============================================================
  // MOBILE NAV TOGGLE
  // ============================================================
  mobileMenuBtn?.addEventListener('click', () => {
    mobileNav?.classList.add('open');
    overlay.classList.add('active');
  });

  overlay?.addEventListener('click', () => {
    mobileNav?.classList.remove('open');
    overlay.classList.remove('active');
    closeAlertsPanelFn();
  });

  // Close mobile nav when clicking a nav link
  document.querySelectorAll('.mobile-nav-link[data-close]').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav?.classList.remove('open');
      overlay.classList.remove('active');
    });
  });

  // ============================================================
  // SCROLL SPY — Update active nav link on scroll
  // ============================================================
  function updateActiveNavOnScroll() {
    const sections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('.nav-link');

    let currentSectionId = '';

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      if (window.scrollY >= sectionTop - 100) {
        currentSectionId = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${currentSectionId}`) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveNavOnScroll);

  // ============================================================
  // THEME
  // ============================================================
  let isDarkMode = localStorage.getItem('darkMode') !== 'false';

  function applyTheme(dark) {
    isDarkMode = dark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (themeIcon) themeIcon.className = dark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    if (darkModeToggle) darkModeToggle.checked = dark;
    localStorage.setItem('darkMode', dark);
    Charts.updateTheme();
  }

  themeToggle?.addEventListener('click', () => applyTheme(!isDarkMode));
  darkModeToggle?.addEventListener('change', (e) => applyTheme(e.target.checked));

  // Apply saved theme on load
  applyTheme(isDarkMode);

  // ── Accent Color ───────────────────────────────────────────
  const savedAccent = localStorage.getItem('accent') || 'amber';
  applyAccent(savedAccent);

  document.querySelectorAll('.swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === savedAccent);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyAccent(btn.dataset.color);
    });
  });

  function applyAccent(color) {
    document.documentElement.setAttribute('data-accent', color);
    localStorage.setItem('accent', color);
  }

  // ============================================================
  // REAL-TIME MONITORING
  // ============================================================
  function updateMonitoringUI(data) {
    const { temperature, humidity, motorRunning, fanRunning, turnsToday, nextTurnMs: ntm, uptime, firmware } = data;

    // Store next turn time
    if (ntm) nextTurnMs = ntm;

    // ── Temperature ──────────────────────────────────────────
    const thresh = Alerts.getThresholds();
    const tempEl = document.getElementById('tempValue');
    const tempStatusEl = document.getElementById('tempStatus');
    const tempMarker   = document.getElementById('tempMarker');

    if (tempEl) {
      tempEl.textContent = temperature.toFixed(1);
      let state = 'normal';
      if (temperature < thresh.tempMin) state = 'low';
      if (temperature > thresh.tempMax) state = 'high';
      tempEl.className = `big-value ${state}`;
      if (tempStatusEl) {
        tempStatusEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        tempStatusEl.className   = `card-badge ${state}`;
      }
      // Range marker (20–42°C range)
      if (tempMarker) {
        const pct = Math.max(0, Math.min(100, ((temperature - 20) / (42 - 20)) * 100));
        tempMarker.style.left = `${pct}%`;
      }
    }

    // ── Humidity ─────────────────────────────────────────────
    const humEl = document.getElementById('humValue');
    const humStatusEl = document.getElementById('humStatus');
    const humMarker   = document.getElementById('humMarker');

    if (humEl) {
      humEl.textContent = humidity.toFixed(1);
      let state = 'normal';
      if (humidity < thresh.humMin) state = 'low';
      if (humidity > thresh.humMax) state = 'high';
      humEl.className = `big-value ${state}`;
      if (humStatusEl) {
        humStatusEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        humStatusEl.className   = `card-badge ${state}`;
      }
      // Range marker (0–100%)
      if (humMarker) {
        humMarker.style.left = `${Math.max(0, Math.min(100, humidity))}%`;
      }
    }

    // ── Motor Status ─────────────────────────────────────────
    const motorIcon  = document.getElementById('motorIcon');
    const motorState = document.getElementById('motorState');
    const motorStatusEl = document.getElementById('motorStatus');
    const turnsTodayEl  = document.getElementById('turnsToday');

    if (motorIcon) motorIcon.classList.toggle('running', motorRunning);
    if (motorState) {
      motorState.textContent = motorRunning ? 'Running' : 'Idle';
      motorState.className   = `motor-state ${motorRunning ? 'running' : ''}`;
    }
    if (motorStatusEl) {
      motorStatusEl.textContent = motorRunning ? 'Running' : 'Idle';
      motorStatusEl.className   = `card-badge ${motorRunning ? 'normal' : ''}`;
    }
    if (turnsTodayEl) turnsTodayEl.textContent = turnsToday || 0;

    // ── Fan Status ────────────────────────────────────────────
    const fanIcon  = document.getElementById('fanIcon');
    const fanState = document.getElementById('fanState');
    const fanStatusEl = document.getElementById('fanStatus');
    const fanToggle = document.getElementById('fanToggle');
    const toggleLabel = document.getElementById('toggleLabel');

    if (fanIcon) fanIcon.classList.toggle('running', fanRunning);
    if (fanState) {
      fanState.textContent = fanRunning ? 'On' : 'Off';
      fanState.className   = `fan-state ${fanRunning ? 'running' : ''}`;
    }
    if (fanStatusEl) {
      fanStatusEl.textContent = fanRunning ? 'On' : 'Off';
      fanStatusEl.className   = `card-badge ${fanRunning ? 'normal' : ''}`;
    }
    if (fanToggle) {
      fanToggle.checked = fanRunning;
    }
    if (toggleLabel) {
      toggleLabel.textContent = fanRunning ? 'Turn Fan Off' : 'Turn Fan On';
    }

    // ── Today's Stats ─────────────────────────────────────────
    updateStats(data);

    // ── System Info ───────────────────────────────────────────
    const firmwareEl = document.getElementById('firmwareVer');
    const uptimeEl   = document.getElementById('systemUptime');
    if (firmwareEl && firmware) firmwareEl.textContent = firmware;
    if (uptimeEl) uptimeEl.textContent = formatUptime(uptime);

    // ── Last Updated ─────────────────────────────────────────
    if (lastUpdated) {
      lastUpdated.textContent = new Date().toLocaleTimeString('en-PH');
    }

    // ── Check Alerts ──────────────────────────────────────────
    Alerts.checkData(data);

    // ── Add to chart (real-time) ──────────────────────────────
    Charts.addDataPoint({ ...data, eggTurn: motorRunning });
  }

  // ── Running stats accumulator ──────────────────────────────
  let statsBuffer = { temps: [], hums: [] };

  function updateStats(data) {
    statsBuffer.temps.push(data.temperature);
    statsBuffer.hums.push(data.humidity);
    // Keep last 100 readings
    if (statsBuffer.temps.length > 100) statsBuffer.temps.shift();
    if (statsBuffer.hums.length  > 100) statsBuffer.hums.shift();

    const avgTemp = statsBuffer.temps.reduce((a, b) => a + b, 0) / statsBuffer.temps.length;
    const avgHum  = statsBuffer.hums.reduce((a, b) => a + b, 0)  / statsBuffer.hums.length;

    const avgTempEl  = document.getElementById('avgTemp');
    const avgHumEl   = document.getElementById('avgHum');
    const totalTurnsEl = document.getElementById('totalTurns');
    const alertsTodayEl = document.getElementById('alertsToday');

    if (avgTempEl)    avgTempEl.textContent    = `${avgTemp.toFixed(1)}°C`;
    if (avgHumEl)     avgHumEl.textContent     = `${avgHum.toFixed(1)}%`;
    if (totalTurnsEl) totalTurnsEl.textContent = data.turnsToday || 0;
    if (alertsTodayEl) alertsTodayEl.textContent = Alerts.getTodayCount();
  }

  // ── Countdown Timer ────────────────────────────────────────
  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    const el = document.getElementById('countdown');
    if (!el || !nextTurnMs) { if (el) el.textContent = '—'; return; }

    const diff = nextTurnMs - Date.now();
    if (diff <= 0) {
      el.textContent = 'Now!';
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  // ── Connection Status ──────────────────────────────────────
  function updateConnectionStatus(status) {
    if (!statusDot || !statusText) return;
    statusDot.className = `status-dot ${status}`;
    const labels = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting…' };
    statusText.textContent = labels[status] || status;
  }

  // ── Uptime formatter ───────────────────────────────────────
  function formatUptime(seconds) {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // ============================================================
  // EGG TURNING CONTROL
  // ============================================================
  function calculateSchedule(turnsPerDay, intervalHours) {
    const times = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < turnsPerDay; i++) {
      const t = new Date(start.getTime() + i * intervalHours * 3600000);
      if (t.getDate() === start.getDate()) {
        times.push(t.toTimeString().slice(0, 5));
      }
    }
    return times;
  }

  function renderSchedulePreview(times) {
    const el = document.getElementById('scheduleTimes');
    if (!el) return;
    if (times.length === 0) {
      el.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">No turns scheduled today</span>';
      return;
    }
    el.innerHTML = times.map(t => `<span class="schedule-time-chip">${t}</span>`).join('');
  }

  // Auto-calculate on input change
  ['turnsPerDay', 'turnInterval'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const tpd = parseInt(document.getElementById('turnsPerDay')?.value || '8', 10);
      const int = parseFloat(document.getElementById('turnInterval')?.value || '3');
      if (tpd > 0 && int > 0) {
        renderSchedulePreview(calculateSchedule(tpd, int));
      }
    });
  });

  // Save Schedule
  document.getElementById('saveScheduleBtn')?.addEventListener('click', async () => {
    const tpd = parseInt(document.getElementById('turnsPerDay')?.value || '8', 10);
    const int = parseFloat(document.getElementById('turnInterval')?.value || '3');
    if (!tpd || !int || tpd < 1 || int < 0.5) {
      Toast.show('Invalid schedule settings', 'error', 'Please enter valid values');
      return;
    }
    try {
      const result = await API.saveSchedule(tpd, int);
      if (result.success) {
        renderSchedulePreview(result.schedule || calculateSchedule(tpd, int));
        Toast.show('Schedule saved!', 'success', `${tpd} turns/day every ${int}h`);
        localStorage.setItem('turnsPerDay', tpd);
        localStorage.setItem('turnInterval', int);
      }
    } catch (e) {
      Toast.show('Failed to save schedule', 'error', e.message);
    }
  });

  // Manual Turn
  document.getElementById('manualTurnBtn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('manualStatus');
    if (statusEl) statusEl.textContent = 'Triggering turn…';
    try {
      const result = await API.triggerTurn();
      if (result.success) {
        if (statusEl) statusEl.innerHTML = '<span class="text-success"><i class="fa-solid fa-check"></i> Turn triggered!</span>';
        Toast.show('Manual turn triggered', 'success');
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = '<span class="text-danger">Failed to trigger turn</span>';
      Toast.show('Failed to trigger turn', 'error', e.message);
    }
  });

  // Fan Toggle Button
  document.getElementById('fanToggleBtn')?.addEventListener('click', async () => {
    const fanToggle = document.getElementById('fanToggle');
    const newState = fanToggle ? !fanToggle.checked : true;
    try {
      const result = await API.setFanState(newState);
      if (result.success) {
        Toast.show(result.message, 'success');
        // Update UI
        if (fanToggle) fanToggle.checked = result.fanRunning;
        const toggleLabel = document.getElementById('toggleLabel');
        if (toggleLabel) toggleLabel.textContent = result.fanRunning ? 'Turn Fan Off' : 'Turn Fan On';
        const fanState = document.getElementById('fanState');
        if (fanState) {
          fanState.textContent = result.fanRunning ? 'On' : 'Off';
          fanState.className = `fan-state ${result.fanRunning ? 'running' : ''}`;
        }
        const fanIcon = document.getElementById('fanIcon');
        if (fanIcon) fanIcon.classList.toggle('running', result.fanRunning);
        const fanStatusEl = document.getElementById('fanStatus');
        if (fanStatusEl) {
          fanStatusEl.textContent = result.fanRunning ? 'On' : 'Off';
          fanStatusEl.className = `card-badge ${result.fanRunning ? 'normal' : ''}`;
        }
      }
    } catch (e) {
      Toast.show('Failed to toggle fan', 'error', e.message);
    }
  });

  // Fan Toggle Switch
  document.getElementById('fanToggle')?.addEventListener('change', async (e) => {
    const newState = e.target.checked;
    const toggleLabel = document.getElementById('toggleLabel');
    const fanToggleEl = document.getElementById('fanToggle');
    if (toggleLabel) toggleLabel.textContent = newState ? 'Turn Fan Off' : 'Turn Fan On';
    try {
      const result = await API.setFanState(newState);
      if (result.success) {
        Toast.show(result.message, 'success');
        const fanState = document.getElementById('fanState');
        if (fanState) {
          fanState.textContent = result.fanRunning ? 'On' : 'Off';
          fanState.className = `fan-state ${result.fanRunning ? 'running' : ''}`;
        }
        const fanIcon = document.getElementById('fanIcon');
        if (fanIcon) fanIcon.classList.toggle('running', result.fanRunning);
        const fanStatusEl = document.getElementById('fanStatus');
        if (fanStatusEl) {
          fanStatusEl.textContent = result.fanRunning ? 'On' : 'Off';
          fanStatusEl.className = `card-badge ${result.fanRunning ? 'normal' : ''}`;
        }
      } else {
        // Revert toggle if failed
        if (fanToggleEl) fanToggleEl.checked = !newState;
        if (toggleLabel) toggleLabel.textContent = !newState ? 'Turn Fan Off' : 'Turn Fan On';
      }
    } catch (e) {
      // Revert toggle on error
      if (fanToggleEl) fanToggleEl.checked = !newState;
      if (toggleLabel) toggleLabel.textContent = !newState ? 'Turn Fan Off' : 'Turn Fan On';
      Toast.show('Failed to toggle fan', 'error', e.message);
    }
  });

  // Pause/Resume Schedule
  document.getElementById('pauseScheduleBtn')?.addEventListener('click', () => {
    schedulePaused = !schedulePaused;
    const btn = document.getElementById('pauseScheduleBtn');
    if (btn) {
      btn.innerHTML = schedulePaused
        ? '<i class="fa-solid fa-play"></i> Resume Schedule'
        : '<i class="fa-solid fa-pause"></i> Pause Schedule';
      btn.className = schedulePaused ? 'btn btn-success' : 'btn btn-warning';
    }
    Toast.show(schedulePaused ? 'Schedule paused' : 'Schedule resumed',
               schedulePaused ? 'warning' : 'success');
  });

  // Save Thresholds
  document.getElementById('saveThresholdsBtn')?.addEventListener('click', async () => {
    const thresholds = {
      tempMin: parseFloat(document.getElementById('tempMin')?.value || '36'),
      tempMax: parseFloat(document.getElementById('tempMax')?.value || '38.5'),
      humMin:  parseFloat(document.getElementById('humMin')?.value  || '50'),
      humMax:  parseFloat(document.getElementById('humMax')?.value  || '65'),
    };
    Alerts.setThresholds(thresholds);
    try {
      await API.saveThresholds(thresholds);
      Toast.show('Thresholds saved!', 'success');
    } catch (e) {
      Toast.show('Thresholds saved locally', 'info', 'Could not sync to device');
    }
  });

  // ============================================================
  // ALERTS PANEL
  // ============================================================
  alertBell?.addEventListener('click', () => {
    alertsPanel?.classList.add('open');
    overlay.classList.add('active');
    Alerts.markAllRead();
  });

  function closeAlertsPanelFn() {
    alertsPanel?.classList.remove('open');
    overlay.classList.remove('active');
  }

  closeAlertsPanel?.addEventListener('click', closeAlertsPanelFn);
  alertClose?.addEventListener('click', () => {
    document.getElementById('alertBanner').style.display = 'none';
  });
  clearAllAlerts?.addEventListener('click', () => {
    Alerts.clearAll();
    Toast.show('All alerts cleared', 'info');
  });

  // ============================================================
  // CHARTS PAGE
  // ============================================================
  document.getElementById('chartRange')?.addEventListener('change', (e) => {
    Charts.setRange(e.target.value);
  });

  // ============================================================
  // LOGS PAGE
  // ============================================================
  document.getElementById('refreshLogsBtn')?.addEventListener('click', () => {
    Logs.loadLogs();
    Toast.show('Logs refreshed', 'info');
  });

  // ============================================================
  // HISTORY PAGE
  // ============================================================
  document.getElementById('applyFilterBtn')?.addEventListener('click', () => Logs.applyFilters());
  document.getElementById('clearFilterBtn')?.addEventListener('click', () => Logs.clearFilters());
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => Logs.exportCsv());

  // ============================================================
  // SETTINGS PAGE
  // ============================================================
  document.getElementById('saveConnectionBtn')?.addEventListener('click', async () => {
    const ip   = document.getElementById('esp32Ip')?.value.trim();
    const port = document.getElementById('esp32Port')?.value.trim();
    const poll = parseInt(document.getElementById('pollInterval')?.value || '5', 10);
    const testEl = document.getElementById('connectionTest');

    if (!ip) { Toast.show('Please enter an IP address', 'error'); return; }

    API.updateConfig({ ip, port, pollInterval: poll });

    if (testEl) {
      testEl.textContent = 'Testing connection…';
      testEl.className   = 'connection-test';
    }

    const result = await API.testConnection();
    if (testEl) {
      testEl.textContent = result.message;
      testEl.className   = `connection-test ${result.success ? 'success' : 'error'}`;
    }

    if (result.success) {
      Toast.show('Connection saved!', 'success', result.message);
      // Restart polling with new config
      API.startPolling(updateMonitoringUI, updateConnectionStatus);
    } else {
      Toast.show('Connection failed', 'error', result.message);
    }
  });

  // Notification toggles
  document.getElementById('tempAlertToggle')?.addEventListener('change', (e) => {
    Alerts.setSettings({ tempAlerts: e.target.checked });
  });
  document.getElementById('humAlertToggle')?.addEventListener('change', (e) => {
    Alerts.setSettings({ humAlerts: e.target.checked });
  });
  document.getElementById('turnAlertToggle')?.addEventListener('change', (e) => {
    Alerts.setSettings({ turnAlerts: e.target.checked });
  });
  document.getElementById('soundToggle')?.addEventListener('change', (e) => {
    Alerts.setSettings({ soundAlerts: e.target.checked });
  });

  // ============================================================
  // REFRESH BUTTON
  // ============================================================
  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    try {
      const data = await API.getStatus();
      updateMonitoringUI(data);
      Logs.loadLogs();
      Logs.loadHistory();
      Charts.loadChartData();
      Toast.show('Data refreshed', 'success');
    } catch (e) {
      Toast.show('Refresh failed', 'error', e.message);
    } finally {
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    }
  });

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // Restore saved settings
    const savedTpd = localStorage.getItem('turnsPerDay');
    const savedInt = localStorage.getItem('turnInterval');
    if (savedTpd) {
      const el = document.getElementById('turnsPerDay');
      if (el) el.value = savedTpd;
    }
    if (savedInt) {
      const el = document.getElementById('turnInterval');
      if (el) el.value = savedInt;
    }

    // Restore threshold inputs
    const thresh = Alerts.getThresholds();
    const tempMinEl = document.getElementById('tempMin');
    const tempMaxEl = document.getElementById('tempMax');
    const humMinEl  = document.getElementById('humMin');
    const humMaxEl  = document.getElementById('humMax');
    if (tempMinEl) tempMinEl.value = thresh.tempMin;
    if (tempMaxEl) tempMaxEl.value = thresh.tempMax;
    if (humMinEl)  humMinEl.value  = thresh.humMin;
    if (humMaxEl)  humMaxEl.value  = thresh.humMax;

    // Restore ESP32 config inputs
    const cfg = API.getConfig();
    const ipEl   = document.getElementById('esp32Ip');
    const portEl = document.getElementById('esp32Port');
    const pollEl = document.getElementById('pollInterval');
    if (ipEl)   ipEl.value   = cfg.ip;
    if (portEl) portEl.value = cfg.port;
    if (pollEl) pollEl.value = cfg.pollInterval;

    // Initial schedule preview
    const tpd = parseInt(savedTpd || '8', 10);
    const int = parseFloat(savedInt || '3');
    renderSchedulePreview(calculateSchedule(tpd, int));

    // Init charts
    Charts.init();
    Charts.loadChartData(document.getElementById('chartRange')?.value || '6h');

    // Init logs
    Logs.init();

    // Start real-time data polling
    updateConnectionStatus('connecting');
    API.connectWebSocket(updateMonitoringUI, updateConnectionStatus);

    // Start countdown
    startCountdown();

    // Set initial active nav based on scroll position
    updateActiveNavOnScroll();

    console.log('%c🥚 EggWatch Pro initialized (Single-Page)', 'color:#f59e0b;font-weight:bold;font-size:14px');
    console.log('%cDemo mode: ON — simulated data is being used', 'color:#8b92a8');
    console.log('%cTo connect real ESP32: Settings → ESP32 Connection', 'color:#8b92a8');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
