/**
 * filters.js — Pure data filtering functions. No DOM access. No side effects.
 *
 * JSON data row shape:
 *   { cycle: string, age_group: string, sex: number (1|2), biomarker: string,
 *     mean: number, ci_lower: number, ci_upper: number, n: number, unit: string }
 *
 * Sex encoding: integer 1 (Male) | 2 (Female) | string 'all' (both)
 */

const AGE_GROUPS = ['20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
const CYCLES = [
  '2001-2002', '2003-2004', '2005-2006', '2007-2008', '2009-2010',
  '2011-2012', '2013-2014', '2015-2016', '2017-2018',
];

/**
 * Filter the nhanes_data.json data array.
 *
 * @param {Array<Object>} data     - raw nhanes_data.json data array
 * @param {Object} params
 * @param {string}        params.biomarker  - e.g. 'total_cholesterol'
 * @param {number|'all'}  params.sex        - 1 (Male), 2 (Female), or 'all'
 * @param {string[]}      params.ageGroups  - subset of AGE_GROUPS
 * @param {string[]}      params.cycles     - subset of CYCLES
 * @returns {Array<Object>} filtered rows (same shape as input rows, may be empty)
 */
function filterData(data, { biomarker, sex, ageGroups, cycles }) {
  return data.filter(row => {
    if (row.biomarker !== biomarker) return false;
    if (sex !== 'all' && row.sex !== sex) return false;
    if (!ageGroups.includes(row.age_group)) return false;
    if (!cycles.includes(row.cycle)) return false;
    return true;
  });
}

/**
 * Compute summary statistics for a filtered dataset.
 *
 * When sex === 'all', averages across both sex values for each (cycle, age_group).
 * Linear slope is computed using the midpoint of each age group as x-axis.
 *
 * @param {Array<Object>} filteredData  - output of filterData()
 * @returns {{ slope: number, peakAgeGroup: string, highCycle: string, lowCycle: string }}
 *          Returns null if filteredData is empty.
 */
function computeSummaryStats(filteredData) {
  if (!filteredData || filteredData.length === 0) return null;

  const AGE_MIDPOINTS = {
    '20-29': 24.5, '30-39': 34.5, '40-49': 44.5, '50-59': 54.5,
    '60-69': 64.5, '70-79': 74.5, '80+': 84.5,
  };

  // Aggregate: mean per (cycle, age_group) — needed for sex='all'
  const grouped = {};
  for (const row of filteredData) {
    const key = `${row.cycle}__${row.age_group}`;
    if (!grouped[key]) grouped[key] = { sum: 0, count: 0, cycle: row.cycle, age_group: row.age_group };
    grouped[key].sum += row.mean;
    grouped[key].count += 1;
  }
  const agg = Object.values(grouped).map(g => ({
    cycle: g.cycle,
    age_group: g.age_group,
    mean: g.sum / g.count,
  }));

  // Slope: linear regression of mean ~ age_midpoint across all rows
  const xs = agg.map(r => AGE_MIDPOINTS[r.age_group] || 50);
  const ys = agg.map(r => r.mean);
  const n = xs.length;
  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xBar) * (ys[i] - yBar), 0);
  const den = xs.reduce((s, x) => s + (x - xBar) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;

  // Peak age group: highest mean across all aggregated rows
  const byAge = {};
  for (const r of agg) {
    if (!byAge[r.age_group]) byAge[r.age_group] = [];
    byAge[r.age_group].push(r.mean);
  }
  let peakAgeGroup = '';
  let peakVal = -Infinity;
  for (const [ag, vals] of Object.entries(byAge)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > peakVal) { peakVal = avg; peakAgeGroup = ag; }
  }

  // High/low cycle: cycle with highest/lowest mean (averaged across age groups)
  const byCycle = {};
  for (const r of agg) {
    if (!byCycle[r.cycle]) byCycle[r.cycle] = [];
    byCycle[r.cycle].push(r.mean);
  }
  let highCycle = '', highVal = -Infinity;
  let lowCycle = '', lowVal = Infinity;
  for (const [cy, vals] of Object.entries(byCycle)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > highVal) { highVal = avg; highCycle = cy; }
    if (avg < lowVal) { lowVal = avg; lowCycle = cy; }
  }

  return { slope, peakAgeGroup, highCycle, lowCycle };
}
