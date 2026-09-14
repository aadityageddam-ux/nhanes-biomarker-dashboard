# NHANES Biomarker Profiles

An exploratory dashboard of **real CDC/NCHS public-use NHANES data**, showing adult age and recorded-sex profiles within individual survey cycles from 2001–2002 through 2017–2018.

Select one cycle, one measurement and one sex category. The chart shows survey-weighted means with design-based 95% confidence intervals; the table and CSV include sample sizes and missingness. These are cross-sectional group profiles, not individual aging trajectories, clinical reference ranges or calibrated trends across years.

## What is included

12 measurements: total cholesterol, HDL, Friedewald-calculated LDL, triglycerides, fasting plasma glucose, HbA1c, CRP/hs-CRP, white blood cell count, serum albumin, serum creatinine, systolic blood pressure and BMI.

CRP is unavailable in the selected public components for 2011–2012 and 2013–2014. Those gaps are explicit. The 106 available cycle/measurement combinations each have 24 directly estimated age/sex domains: 2,544 estimates in total.

## Scientific scope

- Adults aged 20+, grouped as 20–29 through 70–79 and 80+. RIAGENDR defines released male/female categories.
- Each cycle is analyzed independently. All-sex and all-adult summaries are estimated from participant records, never by averaging subgroup means or confidence intervals.
- WTMEC2YR for examination measurements; component-specific WTSAF2YR for fasting glucose, triglycerides and LDL.
- R survey designs retain strata and PSUs before selecting analytical domains. Taylor linearization supplies standard errors; domain-specific degrees of freedom supply t intervals.
- Fasting duration and morning-session eligibility follow the component's cycle-specific documentation.
- Missing outcomes remain missing. No trimming of high observations or project-created imputation. CDC-provided detection-limit substitutions are retained.
- Cross-cycle assay harmonization, hypothesis tests, clinical classification and causal interpretation are outside this version's scope.

See [methods and variable mappings](docs/METHODS.md) and [validation](docs/VALIDATION.md).

## Run the dashboard

There is no frontend build, external chart CDN or runtime package dependency.

```sh
python -m http.server 8080
```

Open http://localhost:8080. The checked-in aggregate JSON is sufficient; downloading participant data is unnecessary to view the app.

## Reproduce the estimates

Python 3.11+ uses only the standard library. R needs survey, foreign and jsonlite. The tested R and package versions are recorded in [r-session.txt](data/r-session.txt).

```sh
Rscript pipeline/setup.R
python pipeline/fetch_sources.py
python pipeline/fetch_sources.py --verify-only
Rscript pipeline/estimate.R
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Run commands from the repository root. Raw XPT files and codebooks are cached in ignored `pipeline/cache/`; only aggregate results, source hashes and validation outputs are tracked.

The downloader fails if a pinned source changes. Review revised CDC documentation and the analytical consequences before deliberately updating the manifest. Do not bypass that failure or substitute synthetic data.

Browser checks start their own loopback-only test server. R estimation checks 212 selected domain standard errors against an independent Taylor implementation on every run. CI checks the aggregate data and the browser; a manually triggered workflow can also rebuild from pinned CDC sources.

## Data provenance and limitations

[Source manifest](data/sources.json) records 104 XPT files and their 104 codebooks, including nine fasting questionnaires, with source URLs, retrieval times and SHA-256 hashes. Each estimate's cycle/biomarker mapping specifies its variable, weight, transformation and codebook.

Sampling weights do not eliminate item-nonresponse bias or assay limitations. Open-ended ages, calculated-LDL availability, skewed biomarkers and protocol differences constrain interpretation. See the methods for details.

This rebuild replaces the earlier synthetic-data dashboard and its incorrect SD/√n uncertainty calculation. The prior synthetic generator and obsolete download paths have been removed.

Independent student analysis; not an official CDC product or endorsement. Public data source: [CDC/NCHS NHANES](https://wwwn.cdc.gov/nchs/nhanes/).
