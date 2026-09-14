const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  selectProfile,
  csvProfile,
  CYCLES,
  AGE_GROUPS,
} = require("../js/filters.js");
const d = JSON.parse(fs.readFileSync("data/nhanes_data.json", "utf8"));
test("every available component has all 24 directly estimated domains", () => {
  assert.equal(d.metadata.data_kind, "observed");
  assert.equal(d.data.length, 2544);
  assert.equal(d.mappings.length, 108);
  assert.equal(d.mappings.filter((m) => m.available).length, 106);
  const unique = new Set(
    d.data.map((r) => [r.cycle, r.biomarker, r.sex, r.age_group].join("/")),
  );
  assert.equal(unique.size, d.data.length);
  for (const m of d.mappings)
    for (const sex of ["all", "1", "2"]) {
      const rows = selectProfile(d.data, m.cycle, m.biomarker, sex);
      assert.equal(rows.length, m.available ? 8 : 0);
      if (m.available)
        assert.deepEqual(
          new Set(rows.map((r) => r.age_group)),
          new Set(["all", ...AGE_GROUPS]),
        );
    }
});
test("all-adult estimates use participant weights, not subgroup averages", () => {
  for (const m of d.mappings.filter((m) => m.available))
    for (const age of ["all", ...AGE_GROUPS]) {
      const rows = d.data.filter(
        (r) =>
          r.cycle === m.cycle &&
          r.biomarker === m.biomarker &&
          r.age_group === age,
      );
      const all = rows.find((r) => r.sex === "all"),
        sexes = rows.filter((r) => r.sex !== "all");
      assert.equal(
        all.n,
        sexes.reduce((n, r) => n + r.n, 0),
      );
      const weighted =
        sexes.reduce((n, r) => n + r.mean * r.observed_weight_sum, 0) /
        sexes.reduce((n, r) => n + r.observed_weight_sum, 0);
      assert.ok(Math.abs(all.mean - weighted) < 1e-8);
    }
});
test("counts, intervals and component weights are internally consistent", () => {
  for (const r of d.data) {
    assert.equal(r.n + r.missing_n, r.eligible_n);
    assert.equal(r.eligible_n + r.eligibility_excluded_n, r.weight_positive_n);
    assert.ok(r.n > 0 && r.df > 0 && r.se > 0);
    assert.ok(r.ci_lower < r.mean && r.ci_upper > r.mean);
    assert.ok(
      r.weighted_missing_percent >= 0 && r.weighted_missing_percent <= 100,
    );
    assert.equal(
      r.weight,
      ["ldl", "triglycerides", "glucose"].includes(r.biomarker)
        ? "WTSAF2YR"
        : "WTMEC2YR",
    );
  }
});
test("CRP gaps are explicit and export contains only the chosen profile", () => {
  for (const cycle of ["2011-2012", "2013-2014"])
    assert.equal(selectProfile(d.data, cycle, "crp", "all").length, 0);
  const rows = selectProfile(d.data, CYCLES[0], "hdl", "1");
  const csv = csvProfile(rows);
  assert.equal(csv.split("\r\n").length, 9);
  assert.ok(csv.includes("ci_lower"));
  assert.ok(!csv.includes("2017-2018"));
});
test("independent Taylor checks agree with R survey", () => {
  const checks = JSON.parse(
    fs.readFileSync("data/variance_checks.json", "utf8"),
  );
  assert.equal(checks.length, 212);
  for (const c of checks)
    assert.ok(Math.abs(c.survey_se - c.independent_se) < 1e-8);
});
