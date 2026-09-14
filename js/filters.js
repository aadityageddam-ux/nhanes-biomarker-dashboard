"use strict";
const AGE_GROUPS = [
  "20-29",
  "30-39",
  "40-49",
  "50-59",
  "60-69",
  "70-79",
  "80+",
];
const CYCLES = [
  "2001-2002",
  "2003-2004",
  "2005-2006",
  "2007-2008",
  "2009-2010",
  "2011-2012",
  "2013-2014",
  "2015-2016",
  "2017-2018",
];
function selectProfile(data, cycle, biomarker, sex) {
  // All-sex estimates are calculated from participants, never averaged from rows.
  return data.filter(
    (r) => r.cycle === cycle && r.biomarker === biomarker && r.sex === sex,
  );
}
function number(value) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "Unavailable";
}
function csvProfile(rows) {
  const keys = [
    "cycle",
    "biomarker",
    "sex",
    "age_group",
    "unit",
    "mean",
    "se",
    "ci_lower",
    "ci_upper",
    "df",
    "n",
    "eligible_n",
    "missing_n",
    "weighted_missing_percent",
    "weight_positive_n",
    "eligibility_excluded_n",
    "weight",
  ];
  const quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  return [
    keys.join(","),
    ...rows.map((row) => keys.map((k) => quote(row[k])).join(",")),
  ].join("\r\n");
}
if (typeof module !== "undefined")
  module.exports = { selectProfile, csvProfile, AGE_GROUPS, CYCLES };
