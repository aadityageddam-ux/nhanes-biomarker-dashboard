# NHANES Biomarker Dashboard

An interactive research dashboard for exploring 12 clinical biomarker trajectories across nine NHANES survey cycles (2001–2018), stratified by age, sex, and survey period. Built for aging biology research, with weighted population estimates and 95% confidence intervals throughout.

**[Live Demo →](https://aadityageddam-ux.github.io/nhanes-biomarker-dashboard/)**

---

## Biomarkers

| Biomarker | Unit | Aging Biology Relevance |
|---|---|---|
| Total Cholesterol | mg/dL | Declines after peak at 50–59; reflects statin era trends |
| HDL Cholesterol | mg/dL | Inverse CVD risk marker; sex-stratified trajectories |
| LDL Cholesterol | mg/dL | Primary atherogenic fraction; population-level decline post-2001 |
| Triglycerides | mg/dL | Metabolic syndrome marker; peaks mid-life |
| Fasting Glucose | mg/dL | Tracks pre-diabetes prevalence; rising secular trend |
| HbA1c | % | Integrated glycemic exposure; rises ~0.1% per decade of age |
| C-Reactive Protein | mg/dL | Inflammaging marker; sex differences in baseline inflammation |
| White Blood Cells | 10³/μL | Immune senescence proxy; stable across cycles |
| Serum Albumin | g/dL | Nutritional status and liver function; declines in oldest-old |
| Serum Creatinine | mg/dL | Kidney function; large sex difference driven by muscle mass |
| Systolic BP | mmHg | Strong age gradient; declining trend with antihypertensive treatment |
| BMI | kg/m² | Adiposity; secular increase across all age groups |

---

## Methods

**Survey weighting.** All estimates use MEC examination weights per NCHS analytic guidelines (`WTMEC2YR` for single-cycle analysis). Weighted means are computed as $\bar{x}_w = \sum w_i x_i / \sum w_i$. Weighted SDs use $\sigma_w = \sqrt{\sum w_i (x_i - \bar{x}_w)^2 / \sum w_i}$. 95% confidence intervals are $\bar{x}_w \pm 1.96 \cdot \sigma_w / \sqrt{n}$.

**Biomarker harmonization.** Variable names change across NHANES cycles (e.g., `LBXTC` → `LBDTCSI` for total cholesterol). Each biomarker maps to an ordered list of aliases; the first non-null column found is used.

**Age stratification.** Adults 20+ are binned into seven 10-year groups (20–29 through 80+) using `pd.cut()` with right-open intervals.

---

## Stack

- **Data pipeline:** Python (pandas, pyreadstat, numpy, scipy) — downloads and harmonizes NHANES XPT files from CDC
- **Frontend:** Vanilla HTML/CSS/JS, ApexCharts 3.45
- **Deployment:** GitHub Pages (static, no build step)
- **Design:** Dark-mode, Inter typeface, glassmorphism cards

---

## Local Setup

```bash
git clone https://github.com/aadityageddam-ux/nhanes-biomarker-dashboard
cd nhanes-biomarker-dashboard

# Generate data (requires CDC NHANES access)
cd pipeline
pip install -r requirements.txt
python download_nhanes.py
python generate_json.py
cd ..

# Serve (required — fetch() won't work on file://)
python -m http.server 8080
# Open http://localhost:8080
```

---

## Data Attribution

**Source:** Centers for Disease Control and Prevention, National Center for Health Statistics. *National Health and Nutrition Examination Survey Data.* Hyattsville, MD: U.S. Department of Health and Human Services, 2001–2018. [cdc.gov/nchs/nhanes](https://www.cdc.gov/nchs/nhanes/)

NHANES is a stratified, multistage probability sample of the US civilian non-institutionalized population. Estimates are representative of the US adult population when survey weights are applied per NCHS analytic guidelines.
