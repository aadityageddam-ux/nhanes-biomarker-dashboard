/**
 * charts.js — ApexCharts rendering functions.
 *
 * Depends on:
 *   - filters.js (filterData return shape)
 *   - ApexCharts loaded globally via CDN
 *
 * Input row shape from filterData():
 *   { cycle, age_group, sex, biomarker, mean, ci_lower, ci_upper, n, unit }
 *
 * All functions return ApexCharts instance(s) so callers can destroy/update them.
 */

const CYCLE_COLORS = {
  '2001-2002': '#60A5FA',
  '2003-2004': '#34D399',
  '2005-2006': '#FBBF24',
  '2007-2008': '#F97316',
  '2009-2010': '#EF4444',
  '2011-2012': '#A78BFA',
  '2013-2014': '#22D3EE',
  '2015-2016': '#4ADE80',
  '2017-2018': '#FB923C',
};

const CHART_DEFAULTS = {
  background: 'transparent',
  fontFamily: "'Inter', system-ui, sans-serif",
  foreColor: '#94A3B8',
};

/**
 * Build ApexCharts series from filtered data.
 * Groups by cycle → one mean series + CI band series per cycle.
 *
 * @param {Array<Object>} filteredData
 * @returns {{ series: Array, xCategories: string[] }}
 */
function buildSeries(filteredData) {
  // Determine ordered age groups present in data
  const presentAges = AGE_GROUPS.filter(ag =>
    filteredData.some(r => r.age_group === ag)
  );

  // Group rows by cycle
  const byCycle = {};
  for (const row of filteredData) {
    if (!byCycle[row.cycle]) byCycle[row.cycle] = {};
    const key = row.age_group;
    // If multiple sex rows (sex='all' aggregation not done here), average them
    if (!byCycle[row.cycle][key]) {
      byCycle[row.cycle][key] = { meanSum: 0, ciLSum: 0, ciUSum: 0, nSum: 0, count: 0 };
    }
    const slot = byCycle[row.cycle][key];
    slot.meanSum += row.mean;
    slot.ciLSum  += row.ci_lower  ?? row.mean;
    slot.ciUSum  += row.ci_upper  ?? row.mean;
    slot.nSum    += row.n;
    slot.count   += 1;
  }

  // Build ordered series per cycle
  const orderedCycles = CYCLES.filter(c => byCycle[c]);
  const series = [];

  for (const cycle of orderedCycles) {
    const color = CYCLE_COLORS[cycle] || '#94A3B8';
    const hex8 = (alpha) => color + Math.round(alpha * 255).toString(16).padStart(2, '0');

    const means   = presentAges.map(ag => {
      const s = byCycle[cycle][ag];
      return s ? +(s.meanSum / s.count).toFixed(3) : null;
    });
    const uppers  = presentAges.map(ag => {
      const s = byCycle[cycle][ag];
      return s ? +(s.ciUSum / s.count).toFixed(3) : null;
    });
    const lowers  = presentAges.map(ag => {
      const s = byCycle[cycle][ag];
      return s ? +(s.ciLSum / s.count).toFixed(3) : null;
    });
    const ns      = presentAges.map(ag => {
      const s = byCycle[cycle][ag];
      return s ? s.nSum : 0;
    });

    // Upper CI (invisible boundary for fill)
    series.push({
      name: `_u_${cycle}`,
      data: uppers,
      color: 'transparent',
      _meta: { isBand: true },
    });

    // Mean line
    series.push({
      name: cycle,
      data: means,
      color,
      _meta: { isBand: false, ns, lowers, uppers },
    });

    // Lower CI
    series.push({
      name: `_l_${cycle}`,
      data: lowers,
      color: 'transparent',
      _meta: { isBand: true },
    });
  }

  return { series, xCategories: presentAges };
}

/**
 * Render a trajectory chart (line + CI bands, one line per NHANES cycle).
 *
 * @param {string} containerId        - DOM element id (must exist before calling)
 * @param {Array<Object>} filteredData - output of filterData()
 * @param {string} biomarkerLabel      - e.g. 'Total Cholesterol'
 * @param {string} unit                - e.g. 'mg/dL'
 * @returns {ApexCharts} chart instance (caller must call .destroy() before re-render)
 */
function renderTrajectoryChart(containerId, filteredData, biomarkerLabel, unit) {
  const { series, xCategories } = buildSeries(filteredData);

  // Build ApexCharts series with fill configuration
  const apexSeries = series.map((s, idx) => {
    if (s._meta.isBand) {
      return {
        name: s.name,
        data: s.data,
        color: 'transparent',
      };
    }
    // Mean line — fill between adjacent upper/lower band series
    return {
      name: s.name,
      data: s.data,
      color: s.color,
    };
  });

  const orderedCycles = CYCLES.filter(c =>
    filteredData.some(r => r.cycle === c)
  );

  const options = {
    chart: {
      type: 'line',
      background: CHART_DEFAULTS.background,
      fontFamily: CHART_DEFAULTS.fontFamily,
      foreColor: CHART_DEFAULTS.foreColor,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 400, animateGradually: { enabled: false } },
      height: '100%',
    },
    series: series.map((s, idx) => {
      // Find the cycle for this series
      const cycleMatch = orderedCycles.find(c => s.name === c || s.name === `_u_${c}` || s.name === `_l_${c}`);
      const color = cycleMatch ? CYCLE_COLORS[cycleMatch] : 'transparent';
      return {
        name: s.name,
        data: s.data,
        color,
      };
    }),
    stroke: {
      curve: 'smooth',
      width: series.map(s => s._meta.isBand ? 0 : 2),
      dashArray: 0,
    },
    fill: {
      type: series.map(s => s._meta.isBand ? 'solid' : 'gradient'),
      opacity: series.map(s => s._meta.isBand ? 0 : 1),
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        opacityFrom: 0,
        opacityTo: 0,
      },
    },
    markers: {
      size: series.map(s => s._meta.isBand ? 0 : 4),
      hover: { size: series.map(s => s._meta.isBand ? 0 : 7) },
    },
    xaxis: {
      categories: xCategories,
      title: { text: 'Age Group', style: { color: '#94A3B8', fontWeight: 500, fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#94A3B8', fontSize: '12px' } },
    },
    yaxis: {
      title: { text: `${biomarkerLabel} (${unit})`, style: { color: '#94A3B8', fontWeight: 500, fontSize: '12px' } },
      labels: { style: { colors: '#94A3B8', fontSize: '12px' } },
    },
    grid: {
      borderColor: 'rgba(255,255,255,0.06)',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '11px',
      labels: { colors: '#94A3B8' },
      markers: { width: 20, height: 2, radius: 2 },
      onItemClick: { toggleDataSeries: false },
      formatter: (seriesName) => {
        if (seriesName.startsWith('_')) return null;
        return seriesName;
      },
    },
    tooltip: {
      theme: 'dark',
      custom: ({ series: seriesData, seriesIndex, dataPointIndex, w }) => {
        const ageGroup = xCategories[dataPointIndex];
        const rows = orderedCycles.map(cycle => {
          // Find the mean series for this cycle (not band series)
          const idx = w.globals.seriesNames.indexOf(cycle);
          if (idx < 0) return null;
          const meanVal = seriesData[idx]?.[dataPointIndex];
          if (meanVal == null) return null;

          // Find corresponding upper/lower
          const uIdx = w.globals.seriesNames.indexOf(`_u_${cycle}`);
          const lIdx = w.globals.seriesNames.indexOf(`_l_${cycle}`);
          const upper = uIdx >= 0 ? seriesData[uIdx]?.[dataPointIndex] : null;
          const lower = lIdx >= 0 ? seriesData[lIdx]?.[dataPointIndex] : null;

          const color = CYCLE_COLORS[cycle];
          const ciStr = (upper != null && lower != null)
            ? ` <span style="color:#64748B">[${lower.toFixed(1)} – ${upper.toFixed(1)}]</span>`
            : '';

          return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
            <span style="width:16px;height:2px;background:${color};display:inline-block;border-radius:1px"></span>
            <span style="color:#94A3B8;font-size:11px">${cycle}</span>
            <span style="color:#F1F5F9;font-weight:600;margin-left:auto;padding-left:12px">${meanVal.toFixed(1)} ${unit}${ciStr}</span>
          </div>`;
        }).filter(Boolean);

        return `<div style="background:#1D1D2E;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 16px;min-width:220px">
          <div style="font-size:12px;font-weight:600;color:#F1F5F9;margin-bottom:8px">${ageGroup}</div>
          ${rows.join('')}
        </div>`;
      },
    },
    theme: { mode: 'dark' },
  };

  const chart = new ApexCharts(document.getElementById(containerId), options);
  chart.render();
  return chart;
}

/**
 * Render two side-by-side charts for compare mode.
 *
 * @param {string} containerId1
 * @param {string} containerId2
 * @param {Array<Object>} filteredData1
 * @param {Array<Object>} filteredData2
 * @param {{ label: string, unit: string }} meta1
 * @param {{ label: string, unit: string }} meta2
 * @returns {{ chart1: ApexCharts, chart2: ApexCharts }}
 */
function renderComparisonCharts(containerId1, containerId2, filteredData1, filteredData2, meta1, meta2) {
  const chart1 = renderTrajectoryChart(containerId1, filteredData1, meta1.label, meta1.unit);
  const chart2 = renderTrajectoryChart(containerId2, filteredData2, meta2.label, meta2.unit);
  return { chart1, chart2 };
}

/**
 * Render the 4-stat summary grid into a container element.
 *
 * @param {string} containerId  - DOM element id of the summary grid
 * @param {{ slope: number, peakAgeGroup: string, highCycle: string, lowCycle: string }} stats
 * @returns {void}
 */
function renderSummaryStats(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el || !stats) return;

  const trendDir = stats.slope > 0.05 ? '↑ Rising' : stats.slope < -0.05 ? '↓ Falling' : '→ Stable';
  const trendColor = stats.slope > 0.05 ? '#F43F5E' : stats.slope < -0.05 ? '#34D399' : '#94A3B8';

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Age Trend</div>
      <div class="stat-value" style="color:${trendColor}">${trendDir}</div>
      <div class="stat-note">slope: ${stats.slope > 0 ? '+' : ''}${stats.slope.toFixed(3)} per year</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peak Age</div>
      <div class="stat-value">${stats.peakAgeGroup || '—'}</div>
      <div class="stat-note">highest population mean</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Highest Cycle</div>
      <div class="stat-value">${stats.highCycle || '—'}</div>
      <div class="stat-note">cycle with highest mean</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Lowest Cycle</div>
      <div class="stat-value">${stats.lowCycle || '—'}</div>
      <div class="stat-note">cycle with lowest mean</div>
    </div>
  `;
}
