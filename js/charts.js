/**
 * charts.js — ApexCharts rendering functions.
 *
 * Depends on: filters.js (filterData return shape)
 * Input row shape: { cycle, age_group, sex, biomarker, mean, ci_lower, ci_upper, n, unit }
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

/**
 * Returns a y-axis value formatter appropriate for the unit.
 * e.g. mg/dL → integers; % / g/dL / kg/m² → one decimal.
 */
function makeYFormatter(unit) {
  // Exact-match units that need one decimal place
  const oneDecimal = new Set(['%', 'g/dL', 'kg/m²', '10³/μL']);
  if (oneDecimal.has(unit)) {
    return val => (val != null ? val.toFixed(1) : '');
  }
  return val => (val != null ? Math.round(val).toString() : '');
}

/**
 * Aggregate filteredData into per-cycle, per-age-group stats.
 * Returns { series, xCategories } where series are MEAN LINES ONLY (no CI band series).
 * CI data is stored in series._meta for tooltip use.
 */
function buildSeries(filteredData) {
  const presentAges = AGE_GROUPS.filter(ag =>
    filteredData.some(r => r.age_group === ag)
  );

  const byCycle = {};
  for (const row of filteredData) {
    if (!byCycle[row.cycle]) byCycle[row.cycle] = {};
    const slot = byCycle[row.cycle][row.age_group] || (byCycle[row.cycle][row.age_group] = {
      meanSum: 0, ciLSum: 0, ciUSum: 0, nSum: 0, count: 0,
    });
    slot.meanSum += row.mean;
    slot.ciLSum  += row.ci_lower  ?? row.mean;
    slot.ciUSum  += row.ci_upper  ?? row.mean;
    slot.nSum    += row.n;
    slot.count   += 1;
  }

  const orderedCycles = CYCLES.filter(c => byCycle[c]);
  const series = [];

  for (const cycle of orderedCycles) {
    const color = CYCLE_COLORS[cycle] || '#94A3B8';
    const means  = presentAges.map(ag => { const s = byCycle[cycle][ag]; return s ? +(s.meanSum / s.count).toFixed(3) : null; });
    const lowers = presentAges.map(ag => { const s = byCycle[cycle][ag]; return s ? +(s.ciLSum  / s.count).toFixed(3) : null; });
    const uppers = presentAges.map(ag => { const s = byCycle[cycle][ag]; return s ? +(s.ciUSum  / s.count).toFixed(3) : null; });
    const ns     = presentAges.map(ag => { const s = byCycle[cycle][ag]; return s ? s.nSum : 0; });

    series.push({ name: cycle, data: means, color, _meta: { ns, lowers, uppers } });
  }

  return { series, xCategories: presentAges };
}

/**
 * Render a trajectory chart — one smooth line per NHANES cycle, x-axis = age group.
 *
 * @param {string} containerId
 * @param {Array<Object>} filteredData - output of filterData()
 * @param {string} biomarkerLabel
 * @param {string} unit
 * @returns {ApexCharts}
 */
function renderTrajectoryChart(containerId, filteredData, biomarkerLabel, unit) {
  const { series, xCategories } = buildSeries(filteredData);
  if (!series.length) return null;

  const yFmt = makeYFormatter(unit);

  const options = {
    chart: {
      type: 'line',
      background: 'transparent',
      fontFamily: "'Inter', system-ui, sans-serif",
      foreColor: '#94A3B8',
      toolbar: { show: false },
      zoom:    { enabled: false },
      animations: { enabled: true, speed: 500, animateGradually: { enabled: false } },
      height: '100%',
    },

    series: series.map(s => ({ name: s.name, data: s.data, color: s.color })),

    stroke: {
      curve: 'smooth',
      width: 2.5,
      lineCap: 'round',
    },

    markers: {
      size: 0,
      hover: {
        size: 5,
        sizeOffset: 2,
      },
    },

    xaxis: {
      categories: xCategories,
      title: {
        text: 'Age Group',
        style: { color: '#64748B', fontWeight: 500, fontSize: '11px' },
        offsetY: 4,
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels: { style: { colors: '#64748B', fontSize: '12px', fontWeight: 500 } },
      crosshairs: {
        show: true,
        stroke: { color: 'rgba(255,255,255,0.1)', width: 1, dashArray: 4 },
      },
      tooltip: { enabled: false },
    },

    yaxis: {
      title: {
        text: unit,
        style: { color: '#64748B', fontWeight: 500, fontSize: '11px' },
      },
      labels: {
        style: { colors: '#64748B', fontSize: '12px' },
        formatter: yFmt,
      },
      forceNiceScale: true,
    },

    grid: {
      borderColor: 'rgba(255,255,255,0.05)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 8, right: 16, bottom: 0, left: 8 },
    },

    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: '11px',
      fontWeight: 500,
      labels: { colors: '#94A3B8', useSeriesColors: false },
      markers: {
        width: 24,
        height: 3,
        radius: 2,
        offsetY: -1,
      },
      itemMargin: { horizontal: 10, vertical: 4 },
      onItemClick: { toggleDataSeries: true },
      onItemHover: { highlightDataSeries: true },
    },

    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      custom: ({ series: seriesValues, seriesIndex, dataPointIndex, w }) => {
        const ageGroup = xCategories[dataPointIndex];
        const rows = series.map((s, i) => {
          const val = seriesValues[i]?.[dataPointIndex];
          if (val == null) return '';
          const lower = s._meta.lowers[dataPointIndex];
          const upper = s._meta.uppers[dataPointIndex];
          const n     = s._meta.ns[dataPointIndex];
          const ciStr = (lower != null && upper != null)
            ? `<span style="color:#475569;font-size:10px"> [${yFmt(lower)}–${yFmt(upper)}]</span>`
            : '';
          return `
            <div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
              <span style="flex-shrink:0;width:20px;height:3px;background:${s.color};display:inline-block;border-radius:2px"></span>
              <span style="color:#94A3B8;font-size:11px;min-width:72px">${s.name}</span>
              <span style="color:#F1F5F9;font-weight:600;margin-left:auto;padding-left:8px;white-space:nowrap">${yFmt(val)} <span style="font-weight:400;color:#64748B;font-size:10px">${unit}</span>${ciStr}</span>
            </div>`;
        }).filter(Boolean);

        return `
          <div style="background:#13131A;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 14px;min-width:260px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
            <div style="font-size:13px;font-weight:600;color:#F1F5F9;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
              Age ${ageGroup}
            </div>
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
 * Render two side-by-side trajectory charts for compare mode.
 *
 * @returns {{ chart1: ApexCharts, chart2: ApexCharts }}
 */
function renderComparisonCharts(containerId1, containerId2, filteredData1, filteredData2, meta1, meta2) {
  const chart1 = renderTrajectoryChart(containerId1, filteredData1, meta1.label, meta1.unit);
  const chart2 = renderTrajectoryChart(containerId2, filteredData2, meta2.label, meta2.unit);
  return { chart1, chart2 };
}

/**
 * Render the 4-stat summary grid.
 *
 * @param {string} containerId
 * @param {{ slope: number, peakAgeGroup: string, highCycle: string, lowCycle: string }} stats
 */
function renderSummaryStats(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el || !stats) return;

  const trendDir   = stats.slope > 0.05 ? '↑ Rising' : stats.slope < -0.05 ? '↓ Falling' : '→ Stable';
  const trendColor = stats.slope > 0.05 ? '#F43F5E'  : stats.slope < -0.05 ? '#34D399'  : '#94A3B8';

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Age Trend</div>
      <div class="stat-value" style="color:${trendColor}">${trendDir}</div>
      <div class="stat-note">slope ${stats.slope >= 0 ? '+' : ''}${stats.slope.toFixed(3)}/yr</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peak Age</div>
      <div class="stat-value">${stats.peakAgeGroup || '—'}</div>
      <div class="stat-note">highest mean</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Highest Cycle</div>
      <div class="stat-value">${stats.highCycle || '—'}</div>
      <div class="stat-note">cycle avg</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Lowest Cycle</div>
      <div class="stat-value">${stats.lowCycle || '—'}</div>
      <div class="stat-note">cycle avg</div>
    </div>
  `;
}
