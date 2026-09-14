"use strict";
let dataset,
  displayed = [];
const $ = (id) => document.getElementById(id);
const notes = {
  total_cholesterol:
    "Uses the reference total-cholesterol assay, not the standard biochemistry panel substitute.",
  hdl: "HDL assay methods changed across periods. These are within-cycle profiles; differences between cycles must not be read as calibrated trends.",
  ldl: "Friedewald-calculated LDL as released by CDC. Missingness includes participants for whom the calculation is unavailable, including high triglycerides. This is not a direct LDL assay or the newer LDL calculation.",
  triglycerides:
    "Arithmetic means include high observed values and can be influenced by a small number of large measurements. Fasting eligibility follows the selected cycle’s codebook.",
  glucose:
    "Uses fasting plasma glucose, not serum glucose from the biochemistry panel. Equipment changed across cycles; no cross-cycle calibration is claimed.",
  hba1c:
    "Uses released HbA1c values. Laboratory and instrument changes limit cross-cycle comparisons.",
  crp: "Arithmetic means include high CRP measurements and CDC-provided below-detection values. This is not an estimate of chronic inflammation. Earlier CRP and later hs-CRP assays are not treated as a calibrated time series.",
  wbc: "White blood cell count is a clinical measurement, not a validated measure of immune aging.",
  albumin:
    "Serum albumin is affected by multiple physiological and clinical factors; these profiles do not identify their causes.",
  creatinine:
    "The CDC-recommended calibration is applied to 2005–2006 values. Creatinine alone is not a measure of kidney filtration or biological age.",
  sbp: "Mean of up to three available auscultatory blood-pressure readings, including a fourth replacement attempt when needed. No diagnosis or medication adjustment is made.",
  bmi: "BMI summarizes body mass relative to height; it is not a direct measurement of body fat or biological age.",
};
function option(value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}
function link(url, label) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = label;
  return a;
}
function metric(label, value, note) {
  const box = document.createElement("div");
  box.className = "metric";
  for (const [tag, text] of [
    ["p", label],
    ["strong", value],
    ["small", note],
  ]) {
    const el = document.createElement(tag);
    el.textContent = text;
    box.append(el);
  }
  return box;
}
function render() {
  const cycle = $("cycle").value,
    marker = $("biomarker").value,
    sex = $("sex").value;
  const meta = dataset.biomarkers.find((b) => b.key === marker),
    mapping = dataset.mappings.find(
      (m) => m.cycle === cycle && m.biomarker === marker,
    );
  const sexLabel = $("sex").selectedOptions[0].textContent;
  displayed = selectProfile(dataset.data, cycle, marker, sex);
  $("results").hidden = !mapping?.available || displayed.length === 0;
  if ($("results").hidden) {
    $("status").textContent =
      meta.label +
      " is unavailable for " +
      cycle +
      ". No values have been filled in. Choose another biomarker or cycle.";
    return;
  }
  $("status").textContent =
    "Showing one survey cycle · adults aged 20+ · real CDC/NCHS data";
  $("selection").textContent = cycle + " / " + sexLabel;
  $("chart-title").textContent = meta.label + " by age";
  $("measure-note").textContent = notes[marker];
  const overall = displayed.find((r) => r.age_group === "all"),
    rows = AGE_GROUPS.map((age) =>
      displayed.find((r) => r.age_group === age),
    ).filter(Boolean);
  $("summary").replaceChildren(
    metric(
      "All ages 20+ · " + sexLabel,
      number(overall.mean) + " " + meta.unit,
      "95% CI " + number(overall.ci_lower) + "–" + number(overall.ci_upper),
    ),
    metric(
      "Observed participants",
      overall.n.toLocaleString("en-US"),
      "Unweighted n; not a population count",
    ),
    metric(
      "Missing measurements",
      overall.missing_n.toLocaleString("en-US"),
      number(overall.weighted_missing_percent) + "% of eligible survey weight",
    ),
  );
  renderProfileChart(
    $("chart"),
    rows,
    meta.label + " · " + cycle + " · " + sexLabel,
    meta.unit,
  );
  $("table-caption").textContent =
    cycle + " · " + meta.label + " (" + meta.unit + ") · " + sexLabel;
  $("table-body").replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr"),
        cells = [
          r.age_group,
          number(r.mean),
          number(r.ci_lower) + "–" + number(r.ci_upper),
          r.n,
          r.missing_n,
          number(r.weighted_missing_percent) + "%",
          r.df,
        ];
      cells.forEach((v, i) => {
        const cell = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) cell.scope = "row";
        cell.textContent = String(v);
        tr.append(cell);
      });
      return tr;
    }),
  );
  $("eligibility").textContent =
    mapping.eligibility +
    " " +
    overall.eligibility_excluded_n +
    " positive-weight adults excluded by the component eligibility rule. Missing measurements are counted after this rule. All-sex and all-age means are estimated directly from participants.";
  $("sources").replaceChildren(
    "Source: ",
    link(mapping.codebook, mapping.file + " codebook"),
    " · " +
      mapping.variable +
      " · " +
      mapping.weight +
      ". " +
      mapping.transformation,
  );
  if (typeof mapping.fasting_codebook === "string")
    $("sources").append(
      " ",
      link(mapping.fasting_codebook, "Fasting questionnaire"),
    );
}
async function init() {
  try {
    const response = await fetch("data/nhanes_data.json");
    if (!response.ok) throw new Error("HTTP " + response.status);
    dataset = await response.json();
    if (
      dataset.metadata?.data_kind !== "observed" ||
      dataset.metadata?.schema_version !== 1
    )
      throw new Error("Unsupported data");
    $("cycle").replaceChildren(...CYCLES.map((c) => option(c, c)));
    $("cycle").value = "2017-2018";
    $("biomarker").replaceChildren(
      ...dataset.biomarkers.map((b) => option(b.key, b.label)),
    );
    for (const id of ["cycle", "biomarker", "sex"]) {
      $(id).disabled = false;
      $(id).addEventListener("change", render);
    }
    $("download").addEventListener("click", () => {
      const url = URL.createObjectURL(
          new Blob([csvProfile(displayed)], { type: "text/csv;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "nhanes-" +
        $("cycle").value +
        "-" +
        $("biomarker").value +
        "-" +
        $("sex").value +
        ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    render();
    window.addEventListener("resize", () => {
      if (!$("results").hidden) render();
    });
  } catch (error) {
    $("results").hidden = true;
    $("status").textContent =
      "The estimates could not be loaded. Please refresh the page or try again later.";
    console.error("Unable to load NHANES estimates:", error);
  }
}
init();
