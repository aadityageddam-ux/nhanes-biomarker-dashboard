/**
 * app.js — State management, data loading, sidebar event orchestration.
 *
 * Depends on: filters.js (filterData, computeSummaryStats, AGE_GROUPS, CYCLES)
 *             charts.js  (renderTrajectoryChart, renderComparisonCharts, renderSummaryStats)
 *
 * DOM element IDs this file expects:
 *   #biomarker-select, #sex-pills (.pill-btn[data-sex]), #age-slider, #cycle-slider
 *   #compare-toggle, #compare-group, #biomarker2-select
 *   #metric-n, #metric-cycles, #metric-age-groups, #metric-cycles-range
 *   #chart1, #chart2, #chart2-container
 *   #summary-stats
 *   #observation-badge
 *   #chart-title, #chart2-title
 *   #compare-label
 */

// ── Application State ────────────────────────────────────────────────────────
const state = {
  biomarker:   'total_cholesterol',
  sex:         'all',             // 'all' | 1 (Male) | 2 (Female)
  ageGroups:   [...AGE_GROUPS],   // default: all age groups
  cycles:      [...CYCLES],       // default: all cycles
  compareMode: false,
  biomarker2:  'hdl',
  _charts:     { chart1: null, chart2: null },
};

// Loaded once from nhanes_data.json
let NHANES_DATA = [];
let NHANES_META = {};

// ── Data Loading ──────────────────────────────────────────────────────────────
async function init() {
  try {
    const resp = await fetch('data/nhanes_data.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    NHANES_DATA = json.data;
    NHANES_META = json.metadata;
    populateSidebar(NHANES_META);
    renderAll();
  } catch (err) {
    console.error('Failed to load NHANES data:', err);
    document.getElementById('main-panel').innerHTML = `
      <div style="padding:60px;text-align:center;color:#94A3B8">
        <div style="font-size:32px;margin-bottom:16px">⚠️</div>
        <div style="font-size:16px;font-weight:600;color:#F1F5F9;margin-bottom:8px">Data file not found</div>
        <div style="font-size:13px">Run the pipeline first:<br>
          <code style="background:#1D1D2E;padding:4px 8px;border-radius:4px;margin-top:8px;display:inline-block">
            cd pipeline && python download_nhanes.py && python generate_json.py
          </code>
        </div>
      </div>`;
  }
}

// ── Sidebar Population ────────────────────────────────────────────────────────
function populateSidebar(meta) {
  const sel1 = document.getElementById('biomarker-select');
  const sel2 = document.getElementById('biomarker2-select');
  if (!sel1 || !sel2) return;

  sel1.innerHTML = '';
  sel2.innerHTML = '';
  for (const bm of meta.biomarkers) {
    const opt1 = new Option(`${bm.label} (${bm.unit})`, bm.key);
    const opt2 = new Option(`${bm.label} (${bm.unit})`, bm.key);
    sel1.appendChild(opt1);
    sel2.appendChild(opt2);
  }
  // Default compare to second biomarker
  if (sel2.options.length > 1) sel2.selectedIndex = 1;
  state.biomarker2 = sel2.value;
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderAll() {
  // Destroy existing chart instances to free memory
  if (state._charts.chart1) { state._charts.chart1.destroy(); state._charts.chart1 = null; }
  if (state._charts.chart2) { state._charts.chart2.destroy(); state._charts.chart2 = null; }

  const bm = state.biomarker;
  const bmMeta = NHANES_META.biomarkers?.find(b => b.key === bm) || { label: bm, unit: '' };

  const filtered1 = filterData(NHANES_DATA, {
    biomarker: bm,
    sex: state.sex,
    ageGroups: state.ageGroups,
    cycles: state.cycles,
  });

  updateMetricCards(filtered1);

  // Chart title
  const titleEl = document.getElementById('chart-title');
  if (titleEl) titleEl.textContent = `${bmMeta.label} by Age Group`;

  // Primary chart
  const chart1El = document.getElementById('chart1');
  if (chart1El && filtered1.length > 0) {
    state._charts.chart1 = renderTrajectoryChart('chart1', filtered1, bmMeta.label, bmMeta.unit);
  }

  // Summary stats
  const stats = computeSummaryStats(filtered1);
  renderSummaryStats('summary-stats', stats);

  // Compare mode
  const compareContainer = document.getElementById('chart2-container');
  if (state.compareMode) {
    const bm2 = state.biomarker2;
    const bm2Meta = NHANES_META.biomarkers?.find(b => b.key === bm2) || { label: bm2, unit: '' };

    const filtered2 = filterData(NHANES_DATA, {
      biomarker: bm2,
      sex: state.sex,
      ageGroups: state.ageGroups,
      cycles: state.cycles,
    });

    const title2El = document.getElementById('chart2-title');
    if (title2El) title2El.textContent = `${bm2Meta.label} by Age Group`;

    const labelEl = document.getElementById('compare-label');
    if (labelEl) labelEl.textContent = `⇄ Compare — ${bm2Meta.label}`;

    if (compareContainer) compareContainer.style.display = 'block';

    const chart2El = document.getElementById('chart2');
    if (chart2El && filtered2.length > 0) {
      state._charts.chart2 = renderTrajectoryChart('chart2', filtered2, bm2Meta.label, bm2Meta.unit);
    }
  } else {
    if (compareContainer) compareContainer.style.display = 'none';
  }
}

// ── Metric Cards ──────────────────────────────────────────────────────────────
function updateMetricCards(filteredData) {
  const totalN = filteredData.reduce((sum, r) => sum + (r.n || 0), 0);
  const cycleCount = new Set(filteredData.map(r => r.cycle)).size;
  const ageGroupCount = new Set(filteredData.map(r => r.age_group)).size;

  const nEl = document.getElementById('metric-n');
  const cEl = document.getElementById('metric-cycles');
  const aEl = document.getElementById('metric-age-groups');
  const badgeEl = document.getElementById('observation-badge');

  if (nEl) nEl.textContent = totalN.toLocaleString();
  if (cEl) cEl.textContent = cycleCount;
  if (aEl) aEl.textContent = ageGroupCount;
  if (badgeEl) badgeEl.textContent = totalN.toLocaleString();

  // Update cycles range label
  const rangeEl = document.getElementById('metric-cycles-range');
  if (rangeEl && state.cycles.length > 0) {
    const sorted = [...state.cycles].sort();
    const start = sorted[0].split('-')[0];
    const end = sorted[sorted.length - 1].split('-')[1];
    rangeEl.textContent = `${start} – ${end}`;
  }
}

// ── Sidebar Event Wiring ──────────────────────────────────────────────────────
function wireEvents() {
  // Biomarker selector
  const bmSel = document.getElementById('biomarker-select');
  if (bmSel) {
    bmSel.addEventListener('change', e => {
      state.biomarker = e.target.value;
      renderAll();
    });
  }

  // Sex pills
  document.querySelectorAll('.pill-btn[data-sex]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn[data-sex]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.sex;
      state.sex = val === 'all' ? 'all' : val === 'male' ? 1 : 2;
      renderAll();
    });
  });

  // Age range slider
  const ageSlider = document.getElementById('age-slider');
  const ageLabel = document.getElementById('age-max-label');
  if (ageSlider) {
    ageSlider.addEventListener('input', e => {
      const maxIdx = +e.target.value;
      state.ageGroups = AGE_GROUPS.slice(0, maxIdx + 1);
      if (ageLabel) ageLabel.textContent = AGE_GROUPS[maxIdx];
      renderAll();
    });
  }

  // Cycle range slider
  const cycleSlider = document.getElementById('cycle-slider');
  const cycleLabel = document.getElementById('cycle-max-label');
  const CYCLE_END_YEARS = ['2002','2004','2006','2008','2010','2012','2014','2016','2018'];
  if (cycleSlider) {
    cycleSlider.addEventListener('input', e => {
      const maxIdx = +e.target.value;
      state.cycles = CYCLES.slice(0, maxIdx + 1);
      if (cycleLabel) cycleLabel.textContent = CYCLE_END_YEARS[maxIdx];
      renderAll();
    });
  }

  // Compare toggle
  const toggle = document.getElementById('compare-toggle');
  const compareGroup = document.getElementById('compare-group');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.compareMode = !state.compareMode;
      toggle.classList.toggle('on', state.compareMode);
      if (compareGroup) compareGroup.style.display = state.compareMode ? 'block' : 'none';
      renderAll();
    });
  }

  // Compare biomarker selector
  const bm2Sel = document.getElementById('biomarker2-select');
  if (bm2Sel) {
    bm2Sel.addEventListener('change', e => {
      state.biomarker2 = e.target.value;
      if (state.compareMode) renderAll();
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  init();
});
