# Methods

## Estimand and sample

For each cycle, the output is an arithmetic mean among adults aged 20+ with an observed measurement, weighted by the appropriate released survey weight. Seven age domains and a combined 20+ domain are estimated separately for all adults, males and females. The combined domain is not age standardized. RIAGENDR is used as released; it is not a measure of gender identity.

RIDAGEYR is age at screening. Early cycles top-code at 85; later cycles at 80. The 80+ domain remains open-ended and is never assigned a midpoint.

The survey design starts with every record with a positive relevant weight, including participants younger than 20. Age, sex, fasting eligibility and observed outcomes are then selected as survey domains. The strata/PSU structure is retained during estimation.

## Source variables

| Measurement | Released variable | Files (2001 / 2003 / 2005 onward) | Unit |
|---|---|---|---|
| Total cholesterol | LBXTC | L13_B / L13_C / TCHOL | mg/dL |
| HDL | LBDHDL / LBXHDD / LBDHDD | L13_B / L13_C / HDL | mg/dL |
| Calculated LDL | LBDLDL | L13AM_B / L13AM_C / TRIGLY | mg/dL |
| Triglycerides | LBXTR | L13AM_B / L13AM_C / TRIGLY | mg/dL |
| Fasting glucose | LBXGLU | L10AM_B / L10AM_C / GLU | mg/dL |
| HbA1c | LBXGH | L10_B / L10_C / GHB | % |
| CRP | LBXCRP; LBXHSCRP in 2015 onward | L11_B / L11_C / CRP through 2010; HSCRP in 2015–2018 | mg/L |
| White blood cells | LBXWBCSI | L25_B / L25_C / CBC | 10³/µL |
| Albumin | LBXSAL | L40_B / L40_C / BIOPRO | g/dL |
| Creatinine | LBDSCR in 2001; LBXSCR thereafter | L40_B / L40_C / BIOPRO | mg/dL |
| Systolic BP | BPXSY1–BPXSY4 | BPX each cycle | mmHg |
| BMI | BMXBMI | BMX each cycle | kg/m² |

Actual suffixed filenames, codebook URLs and transformations are included in the JSON mappings. No SI variable is silently substituted for a conventional-unit variable. No biochemistry-panel glucose, cholesterol or triglyceride result substitutes for the dedicated reference measurement.

CRP in mg/dL is multiplied by 10. The later hs-CRP result already uses mg/L. Unit conversion does **not** establish assay comparability. CRP is not filled for 2011–2014.

For 2005–2006 creatinine, the [CDC-recommended correction](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2005/DataFiles/BIOPRO_D.htm) is applied once: corrected mg/dL = −0.016 + 0.978 × released LBXSCR. No such extra correction is applied to 2001–2002 or the other cycles.

Systolic BP is the arithmetic mean of the first three available readings in attempt order across BPXSY1–BPXSY4. A fourth attempt can replace an incomplete earlier reading. One or two available readings are retained; none yields a missing measurement. This uses the auscultatory BPX component, including in 2017–2018, and does not mix in oscillometric readings. [BPX protocol](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/BPX_J.htm); [CDC use of up to three readings](https://www.cdc.gov/nchs/products/databriefs/db289.htm).

## Weights and fasting eligibility

MEC measures use WTMEC2YR. Fasting measures use WTSAF2YR from their own laboratory component, not a copied weight from a different component. For separate 2001–2002 estimation the demographic codebook specifies the two-year weight; WTMEC4YR is not used.

Fasting questionnaires PH_B, PH_C and FASTQX_D–J provide PHAFSTHR, PHAFSTMN and PHDSESN. Duration is hours + minutes/60; morning is PHDSESN = 0 in all nine codebooks.

| Component | Cycles | Additional domain rule, with positive WTSAF2YR |
|---|---|---|
| Glucose | 2001–2002 | Morning; 8.5 ≤ fasting hours < 24 |
| Glucose | 2003–2018 | Morning; 8 ≤ fasting hours < 24 |
| Triglycerides / LDL | 2001–2016 | Morning; 8.5 ≤ fasting hours < 24 |
| Triglycerides / LDL | 2017–2018 | Morning; 8 ≤ fasting hours < 24 |

These rules follow the selected component codebooks; no common threshold is imposed across cycles. For instance, [TRIGLY_I](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2015/DataFiles/TRIGLY_I.htm) and [TRIGLY_J](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/TRIGLY_J.htm) differ. Positive-weight adults outside a component's documented fasting domain are counted explicitly rather than silently retained.

The LDL variable is the released Friedewald calculation, not the newer calculation also available in TRIGLY_J. Unavailable LDL—including because of high triglycerides—remains missing. Consequently, its complete-case mean does not describe all fasting adults without a missing-data assumption.

## Variance and intervals

R survey uses `svydesign(ids=~SDMVPSU, strata=~SDMVSTRA, weights=~weight, nest=TRUE)`. No finite-population correction is used. A complete-observation domain is selected from the full positive-weight design; `svymean` returns the weighted mean and Taylor-linearized standard error. The interval is mean ± t(0.975, domain df) × SE. Domain df is `degf` of that domain design. Unexpected empty domains and singleton design strata fail the build.

The independent check computes each participant's linearized contribution as weight × (value − domain mean) / sum of domain weights, zero outside the domain. Contributions are summed per PSU. The variance sums m/(m−1) times the squared deviations of PSU totals from the stratum mean. Selected checks cover all available cycle/measurement pairs, for both all adults and age 80+.

See [CDC weighting](https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx), [variance estimation](https://wwwn.cdc.gov/nchs/nhanes/tutorials/varianceestimation.aspx), and the [survey package documentation](https://r-survey.r-forge.r-project.org/survey/).

## Missingness and interpretation

`weight_positive_n` counts positive-weight adults in the age/sex group before the extra eligibility rule. `eligibility_excluded_n` counts those failing that rule. `eligible_n` is after eligibility. `n` counts observed outcomes; `missing_n = eligible_n − n`. Weighted missing percent uses eligible weights as its denominator. These fields do not count zero-weight participants, interview-only participants, or all forms of selection/nonresponse. `observed_weight_sum` is an internal audit quantity, not a population-count claim.

No values are imputed by this project, winsorized, trimmed or adjusted for medications or pregnancy. CDC-provided below-detection substitutions remain in place. Arithmetic means of CRP or triglycerides can be sensitive to high measurements. Survey weights alone do not resolve item nonresponse. The small-sample field flags n < 30 as a descriptive count flag, not a formal NCHS reliability certification.

There are no calibrated cross-cycle comparisons, trend rankings, biological-age claims or tests of group differences. [HDL method effects](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2001/DataFiles/L13_B.htm), [glucose equipment changes](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/GLU_J.htm), and [hs-CRP assay documentation](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2015/DataFiles/HSCRP_I.htm) remain relevant even though the interface presents cycles separately.

