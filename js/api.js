/**
 * EggWatch Pro — ESP32 API Integration Module
 * Handles all communication with the ESP32 incubator device.
 * Supports both real API calls and demo/simulation mode.
 */

const API = (() => {
  // ── Configuration ──────────────────────────────────────────
  // For local server: use 192.168.1.40:3000
  
  let config = {
    ip:           localStorage.getItem('esp32_ip')   || '192.168.1.40',
    port:         localStorage.getItem('esp32_port') || '3000',
    pollInterval: parseInt(localStorage.getItem('poll_interval') || '5', 10),
    // Use real API, not demo mode
    demoMode:     false,
    useLocalApi:  true,
  };

  let pollTimer    = null;
  let wsConnection = null;
  let isConnected  = false;
  let onDataCallback   = null;
  let onStatusCallback = null;

  // ── Demo Data Generator ────────────────────────────────────
  const demo = (() => {
    let baseTemp = 37.5;
    let baseHum  = 57;
    let motorOn  = false;
    let fanOn    = false; // Fan state
    let turnsToday = 0;
    let nextTurnMs = Date.now() + 3 * 60 * 60 * 1000;
    let schedule   = [];
    let uptime     = 0;

    function generateReading() {
      // Simulate slight drift
      baseTemp += (Math.random() - 0.5) * 0.3;
      baseHum  += (Math.random() - 0.5) * 1.5;
      baseTemp  = Math.max(34, Math.min(41, baseTemp));
      baseHum   = Math.max(40, Math.min(80, baseHum));
      uptime++;

      // Simulate motor turning every ~3 hours
      if (Date.now() >= nextTurnMs) {
        motorOn    = true;
        turnsToday++;
        nextTurnMs = Date.now() + 3 * 60 * 60 * 1000;
        setTimeout(() => { motorOn = false; }, 5000);
      }

      // Simulate fan cooling effect when fan is on
      if (fanOn) {
        baseTemp -= 0.2;
        baseHum -= 1.0;
      }

      return {
        temperature:  parseFloat(baseTemp.toFixed(2)),
        humidity:     parseFloat(baseHum.toFixed(1)),
        motorRunning: motorOn,
        fanRunning:   fanOn,
        turnsToday:   turnsToday,
        nextTurnMs:   nextTurnMs,
        uptime:       uptime,
        firmware:     'v2.1.4',
        timestamp:    new Date().toISOString(),
      };
    }

    function generateHistory(count = 200) {
      const logs = [];
      const now  = Date.now();
      let t = 37.5, h = 57;
      for (let i = count; i >= 0; i--) {
        t += (Math.random() - 0.5) * 0.4;
        h += (Math.random() - 0.5) * 2;
        t  = Math.max(34, Math.min(41, t));
        h  = Math.max(40, Math.min(80, h));
        const isTurn = i % 24 === 0;
        logs.push({
          id:          count - i,
          timestamp:   new Date(now - i * 15 * 60 * 1000).toISOString(),
          temperature: parseFloat(t.toFixed(2)),
          humidity:    parseFloat(h.toFixed(1)),
          eggTurn:     isTurn,
        });
      }
      return logs;
    }

    function setSchedule(s) { schedule = s; }
    function getSchedule()  { return schedule; }
    function setFanState(on) { fanOn = on; }
    function getFanState()  { return fanOn; }

    return { generateReading, generateHistory, setSchedule, getSchedule, setFanState, getFanState };
  })();

  // ── Helpers ────────────────────────────────────────────────
  function baseUrl() {
    // For Vercel (production) or local XAMPP: use relative path
    if (config.useLocalApi || isVercel) {
      return '';  // Relative API calls
    }
    // For ESP32 direct connection
    return `http://${config.ip}:${config.port}`;
  }

  async function fetchJson(path, options = {}) {
    const url = `${baseUrl()}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Fetch current sensor readings from ESP32.
   * Endpoint: GET /api/status
   * Returns: { temperature, humidity, motorRunning, turnsToday, nextTurnMs, uptime, firmware, timestamp }
   */
  async function getStatus() {
    if (config.demoMode) {
      console.log('[API] Demo mode - returning simulated data');
      return demo.generateReading();
    }
    try {
      console.log('[API] Fetching from:', baseUrl() + '/api/status');
      const data = await fetchJson('/api/status');
      console.log('[API] Received data:', data);
      return data;
    } catch (e) {
      console.warn('[API] ESP32 not connected, falling back to demo mode:', e.message);
      return demo.generateReading();
    }
  }

  /**
   * Fetch latest N log entries.
   * Endpoint: GET /api/logs?limit=20
   */
  async function getLogs(limit = 20) {
    if (config.demoMode) {
      const all = demo.generateHistory(200);
      return all.slice(-limit);
    }
    return fetchJson(`/api/logs?limit=${limit}`);
  }

  /**
   * Fetch full history with optional filters.
   * Endpoint: GET /api/history?date=&tempMin=&tempMax=&humMin=&humMax=
   */
  async function getHistory(filters = {}) {
    if (config.demoMode) {
      let logs = demo.generateHistory(500);
      if (filters.date) {
        logs = logs.filter(l => l.timestamp.startsWith(filters.date));
      }
      if (filters.tempMin !== undefined && filters.tempMin !== '') {
        logs = logs.filter(l => l.temperature >= parseFloat(filters.tempMin));
      }
      if (filters.tempMax !== undefined && filters.tempMax !== '') {
        logs = logs.filter(l => l.temperature <= parseFloat(filters.tempMax));
      }
      if (filters.humMin !== undefined && filters.humMin !== '') {
        logs = logs.filter(l => l.humidity >= parseFloat(filters.humMin));
      }
      if (filters.humMax !== undefined && filters.humMax !== '') {
        logs = logs.filter(l => l.humidity <= parseFloat(filters.humMax));
      }
      return logs;
    }
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== '' && v !== undefined))
    );
    return fetchJson(`/api/history?${params}`);
  }

  /**
   * Fetch chart data for a given time range.
   * Endpoint: GET /api/chart?range=6h
   */
  async function getChartData(range = '6h') {
    if (config.demoMode) {
      const rangeMap = { '1h': 4, '6h': 24, '24h': 96, '7d': 672 };
      const points   = rangeMap[range] || 24;
      return demo.generateHistory(points);
    }
    return fetchJson(`/api/chart?range=${range}`);
  }

  /**
   * Save egg turning schedule.
   * Endpoint: POST /api/schedule
   * Body: { turnsPerDay, intervalHours }
   */
  async function saveSchedule(turnsPerDay, intervalHours) {
    if (config.demoMode) {
      const times = [];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      for (let i = 0; i < turnsPerDay; i++) {
        const t = new Date(start.getTime() + i * intervalHours * 3600000);
        times.push(t.toTimeString().slice(0, 5));
      }
      demo.setSchedule(times);
      return { success: true, schedule: times };
    }
    return fetchJson('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({ turnsPerDay, intervalHours }),
    });
  }

  /**
   * Trigger a manual egg turn.
   * Endpoint: POST /api/turn
   */
  async function triggerTurn() {
    if (config.demoMode) {
      return { success: true, message: 'Manual turn triggered (demo)' };
    }
    return fetchJson('/api/turn', { method: 'POST' });
  }

  /**
   * Set fan state (on/off).
   * Endpoint: POST /api/fan
   * Body: { state: true/false }
   */
  async function setFanState(on) {
    if (config.demoMode) {
      demo.setFanState(on);
      return { success: true, fanRunning: on, message: on ? 'Fan turned ON' : 'Fan turned OFF' };
    }
    return fetchJson('/api/fan', {
      method: 'POST',
      body: JSON.stringify({ state: on }),
    });
  }

  /**
   * Save alert thresholds.
   * Endpoint: POST /api/thresholds
   */
  async function saveThresholds(thresholds) {
    if (config.demoMode) {
      return { success: true };
    }
    return fetchJson('/api/thresholds', {
      method: 'POST',
      body: JSON.stringify(thresholds),
    });
  }

  /**
   * Test connection to ESP32.
   */
  async function testConnection() {
    if (config.demoMode) {
      return { success: true, message: 'Demo mode — no real device needed' };
    }
    try {
      const data = await fetchJson('/api/ping');
      return { success: true, message: `Connected! Firmware: ${data.firmware || 'unknown'}` };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ── Polling ────────────────────────────────────────────────
  function startPolling(onData, onStatus) {
    onDataCallback   = onData;
    onStatusCallback = onStatus;

    stopPolling();

    async function poll() {
      try {
        const data = await getStatus();
        isConnected = true;
        if (onStatusCallback) onStatusCallback('connected');
        if (onDataCallback)   onDataCallback(data);
      } catch (e) {
        isConnected = false;
        if (onStatusCallback) onStatusCallback('disconnected');
      }
    }

    poll(); // immediate first call
    pollTimer = setInterval(poll, config.pollInterval * 1000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── WebSocket (optional, for real ESP32) ──────────────────
  function connectWebSocket(onData, onStatus) {
    if (config.demoMode) {
      startPolling(onData, onStatus);
      return;
    }
    try {
      wsConnection = new WebSocket(`ws://${config.ip}:${config.port}/ws`);
      wsConnection.onopen = () => {
        isConnected = true;
        if (onStatus) onStatus('connected');
      };
      wsConnection.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onData) onData(data);
        } catch (_) {}
      };
      wsConnection.onclose = () => {
        isConnected = false;
        if (onStatus) onStatus('disconnected');
        // Fallback to polling
        setTimeout(() => startPolling(onData, onStatus), 3000);
      };
      wsConnection.onerror = () => {
        isConnected = false;
        if (onStatus) onStatus('disconnected');
        startPolling(onData, onStatus);
      };
    } catch (e) {
      startPolling(onData, onStatus);
    }
  }

  // ── Config Management ──────────────────────────────────────
  function updateConfig(newConfig) {
    Object.assign(config, newConfig);
    if (newConfig.ip)           localStorage.setItem('esp32_ip',       newConfig.ip);
    if (newConfig.port)         localStorage.setItem('esp32_port',      newConfig.port);
    if (newConfig.pollInterval) localStorage.setItem('poll_interval',   String(newConfig.pollInterval));
  }

  function getConfig() { return { ...config }; }
  function isDemoMode() { return config.demoMode; }
  function setDemoMode(val) { config.demoMode = val; }

  // ── CSV Export ─────────────────────────────────────────────
  function exportToCsv(logs, filename = 'eggwatch_history.csv') {
    const headers = ['Timestamp', 'Temperature (°C)', 'Humidity (%)', 'Egg Turn'];
    const rows    = logs.map(l => [
      l.timestamp,
      l.temperature,
      l.humidity,
      l.eggTurn ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    getStatus,
    getLogs,
    getHistory,
    getChartData,
    saveSchedule,
    triggerTurn,
    setFanState,
    saveThresholds,
    testConnection,
    startPolling,
    stopPolling,
    connectWebSocket,
    updateConfig,
    getConfig,
    isDemoMode,
    setDemoMode,
    exportToCsv,
  };
})();
