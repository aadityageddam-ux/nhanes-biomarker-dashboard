# Validation

The tests check implementation and provenance. They are not independent scientific peer review or certification that every estimate is unbiased.

## Local verification, 2026-09-14

All five Node data checks passed. The full browser suite passed all 324 selections,
CSV export, a failed-data response, mobile layout and 200% zoom without JavaScript
errors. Local browser testing used installed Chrome through Playwright 1.62.1.
The CI workflow uses Playwright's matching Chromium download; CI has not yet run
for this unpublished branch. The source manifest verification passed for all
208 files. Dependency audit reported zero vulnerabilities.

## Automated checks

- Every expected available cycle/measurement has all 24 age/sex domains: 2,544 rows; 106 available component/cycle combinations and two explicit CRP gaps.
- All-sex sample counts equal male plus female counts; all-sex means equal the corresponding participant-weighted combination, not the unweighted mean of sex-specific estimates.
- Counts, units, component weights, positive degrees of freedom and confidence intervals are checked.
- 212 selected Taylor standard errors agree with an independently coded first-stage calculation to absolute tolerance 1e-8.
- Browser checks exercise all 324 cycle/measurement/sex selections, including six unavailable selections, plus exact CSV export, a failed data request, mobile layout, and 200% zoom.
- Source files are pinned with SHA-256; the estimation script also checks every cached file against the manifest MD5 before reading data.

## External HDL benchmark: not an exact reproduction

The 2001–2002 HDL codebook lists n = 4,691, adult mean 51.9 mg/dL and SE 0.28 in a historical cross-cycle method-comparison table. Our separate-cycle analysis of the current release has the same n, mean 51.79341089013 and SE 0.2955031637319 using WTMEC2YR.

A diagnostic calculation using WTMEC4YR gives mean 51.90900 and SE 0.3027682. Its rounded mean agrees with the table, but its SE does not. That diagnostic does **not** establish which original analysis produced the table and is not used in the dashboard. The table's exact original analysis is not reproduced here. The implemented single-cycle weight follows the demographic codebook.

The purpose of `pipeline/check_benchmark.R` is to make this discrepancy inspectable. The project does not call the historical table a passed validation fixture or alter weights to force agreement.

## What is not validated

No individual-level longitudinal result, intervention effect, diagnosis, nationally age-standardized trend, complete correction for nonresponse, or assay-harmonized cross-cycle result is provided. Statistical significance cannot be inferred solely from the display.
