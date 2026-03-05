/**
 * EggWatch Pro — Charts Module
 * Manages Chart.js temperature and humidity line graphs
 * with egg turning event markers.
 */

const Charts = (() => {
  let tempChart = null;
  let humChart  = null;
  let currentRange = '6h';

  // ── Chart.js Global Defaults ───────────────────────────────
  function applyGlobalDefaults() {
    Chart.defaults.color           = getComputedStyle(document.documentElement)
                                       .getPropertyValue('--text-secondary').trim() || '#8b92a8';
    Chart.defaults.borderColor     = getComputedStyle(document.documentElement)
                                       .getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)';
    Chart.defaults.font.family     = "'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size       = 12;
  }

  // ── Color helpers ──────────────────────────────────────────
  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Build datasets ─────────────────────────────────────────
  function buildTempDataset(logs) {
    return {
      label: 'Temperature (°C)',
      data: logs.map(l => ({ x: new Date(l.timestamp), y: l.temperature })),
      borderColor:     '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.08)',
      borderWidth:     2,
      pointRadius:     2,
      pointHoverRadius: 5,
      tension:         0.4,
      fill:            true,
    };
  }

  function buildHumDataset(logs) {
    return {
      label: 'Humidity (%)',
      data: logs.map(l => ({ x: new Date(l.timestamp), y: l.humidity })),
      borderColor:     '#06b6d4',
      backgroundColor: 'rgba(6,182,212,0.08)',
      borderWidth:     2,
      pointRadius:     2,
      pointHoverRadius: 5,
      tension:         0.4,
      fill:            true,
    };
  }

  // Egg turn event markers as a scatter dataset
  function buildTurnDataset(logs, valueKey) {
    const turns = logs.filter(l => l.eggTurn);
    return {
      label: 'Egg Turn',
      data: turns.map(l => ({ x: new Date(l.timestamp), y: l[valueKey] })),
      type:            'scatter',
      pointStyle:      'triangle',
      pointRadius:     8,
      pointHoverRadius: 10,
      borderColor:     '#22c55e',
      backgroundColor: '#22c55e',
      showLine:        false,
    };
  }

  // ── Threshold annotation lines ─────────────────────────────
  function tempAnnotations() {
    const thresh = Alerts.getThresholds();
    return {
      minLine: {
        type:        'line',
        yMin:        thresh.tempMin,
        yMax:        thresh.tempMin,
        borderColor: 'rgba(59,130,246,0.5)',
        borderWidth: 1,
        borderDash:  [4, 4],
        label: { content: `Min ${thresh.tempMin}°C`, display: true, position: 'end', color: '#60a5fa', font: { size: 10 } },
      },
      maxLine: {
        type:        'line',
        yMin:        thresh.tempMax,
        yMax:        thresh.tempMax,
        borderColor: 'rgba(239,68,68,0.5)',
        borderWidth: 1,
        borderDash:  [4, 4],
        label: { content: `Max ${thresh.tempMax}°C`, display: true, position: 'end', color: '#f87171', font: { size: 10 } },
      },
    };
  }

  function humAnnotations() {
    const thresh = Alerts.getThresholds();
    return {
      minLine: {
        type:        'line',
        yMin:        thresh.humMin,
        yMax:        thresh.humMin,
        borderColor: 'rgba(59,130,246,0.5)',
        borderWidth: 1,
        borderDash:  [4, 4],
        label: { content: `Min ${thresh.humMin}%`, display: true, position: 'end', color: '#60a5fa', font: { size: 10 } },
      },
      maxLine: {
        type:        'line',
        yMin:        thresh.humMax,
        yMax:        thresh.humMax,
        borderColor: 'rgba(239,68,68,0.5)',
        borderWidth: 1,
        borderDash:  [4, 4],
        label: { content: `Max ${thresh.humMax}%`, display: true, position: 'end', color: '#f87171', font: { size: 10 } },
      },
    };
  }

  // ── Common chart options ───────────────────────────────────
  function commonOptions(yLabel, yMin, yMax) {
    const gridColor = 'rgba(255,255,255,0.05)';
    return {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding:       16,
            color:         getCssVar('--text-secondary') || '#8b92a8',
          },
        },
        tooltip: {
          backgroundColor: getCssVar('--bg-card') || '#1e2130',
          titleColor:      getCssVar('--text-primary') || '#f0f2f8',
          bodyColor:       getCssVar('--text-secondary') || '#8b92a8',
          borderColor:     getCssVar('--border') || 'rgba(255,255,255,0.07)',
          borderWidth:     1,
          padding:         10,
          callbacks: {
            title: (items) => {
              const d = new Date(items[0].parsed.x);
              return d.toLocaleString('en-PH', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              });
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'MMM d, HH:mm' },
          grid: { color: gridColor },
          ticks: { color: getCssVar('--text-muted') || '#555d75', maxTicksLimit: 8 },
        },
        y: {
          title: { display: true, text: yLabel, color: getCssVar('--text-muted') || '#555d75' },
          min:   yMin,
          max:   yMax,
          grid:  { color: gridColor },
          ticks: { color: getCssVar('--text-muted') || '#555d75' },
        },
      },
    };
  }

  // ── Initialize Charts ──────────────────────────────────────
  function init() {
    applyGlobalDefaults();

    const tempCtx = document.getElementById('tempChart');
    const humCtx  = document.getElementById('humChart');
    if (!tempCtx || !humCtx) return;

    // Destroy existing if re-init
    if (tempChart) { tempChart.destroy(); tempChart = null; }
    if (humChart)  { humChart.destroy();  humChart  = null; }

    tempChart = new Chart(tempCtx, {
      type: 'line',
      data: { datasets: [] },
      options: commonOptions('Temperature (°C)', 30, 42),
    });

    humChart = new Chart(humCtx, {
      type: 'line',
      data: { datasets: [] },
      options: commonOptions('Humidity (%)', 30, 90),
    });
  }

  // ── Load & Render Chart Data ───────────────────────────────
  async function loadChartData(range) {
    currentRange = range || currentRange;
    try {
      const logs = await API.getChartData(currentRange);
      updateCharts(logs);
    } catch (e) {
      console.error('Chart data load error:', e);
    }
  }

  function updateCharts(logs) {
    if (!tempChart || !humChart || !logs || logs.length === 0) return;

    // Temperature chart
    tempChart.data.datasets = [
      buildTempDataset(logs),
      buildTurnDataset(logs, 'temperature'),
    ];
    tempChart.update('active');

    // Humidity chart
    humChart.data.datasets = [
      buildHumDataset(logs),
      buildTurnDataset(logs, 'humidity'),
    ];
    humChart.update('active');
  }

  // ── Add a single new data point (real-time streaming) ─────
  function addDataPoint(reading) {
    if (!tempChart || !humChart) return;

    const ts = new Date(reading.timestamp);
    const maxPoints = 200;

    // Temperature
    if (tempChart.data.datasets[0]) {
      tempChart.data.datasets[0].data.push({ x: ts, y: reading.temperature });
      if (tempChart.data.datasets[0].data.length > maxPoints) {
        tempChart.data.datasets[0].data.shift();
      }
    }

    // Humidity
    if (humChart.data.datasets[0]) {
      humChart.data.datasets[0].data.push({ x: ts, y: reading.humidity });
      if (humChart.data.datasets[0].data.length > maxPoints) {
        humChart.data.datasets[0].data.shift();
      }
    }

    // Egg turn markers
    if (reading.eggTurn) {
      if (tempChart.data.datasets[1]) {
        tempChart.data.datasets[1].data.push({ x: ts, y: reading.temperature });
      }
      if (humChart.data.datasets[1]) {
        humChart.data.datasets[1].data.push({ x: ts, y: reading.humidity });
      }
    }

    tempChart.update('none'); // 'none' = no animation for real-time
    humChart.update('none');
  }

  // ── Theme update (called when dark/light mode switches) ───
  function updateTheme() {
    applyGlobalDefaults();
    if (tempChart) tempChart.update();
    if (humChart)  humChart.update();
  }

  // ── Range selector ─────────────────────────────────────────
  function setRange(range) {
    currentRange = range;
    loadChartData(range);
  }

  return {
    init,
    loadChartData,
    updateCharts,
    addDataPoint,
    updateTheme,
    setRange,
  };
})();
