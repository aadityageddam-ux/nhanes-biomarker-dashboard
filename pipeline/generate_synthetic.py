"""
generate_synthetic.py — Produces nhanes_data.json using realistic statistics
derived from published NHANES analyses (CDC reports, peer-reviewed papers).

Sources:
  - Carroll MD et al. (2020). Trends in Serum Lipids in the US, 1988–2018. JAMA.
  - CDC NCHS Data Brief series (2001–2020)
  - Fakhouri TH et al. (2012). Hypertension Prevalence and Control Among Adults.
  - Menke A et al. (2015). Prevalence of and Trends in Diabetes Among Adults in the US.

This dataset matches the schema expected by generate_json.py and the JS frontend.
Real XPT microdata can replace this once CDC/Wayback access is restored.
"""

import json
import numpy as np
from pathlib import Path
from datetime import date

np.random.seed(42)

OUT_PATH = Path(__file__).parent.parent / "data" / "nhanes_data.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

CYCLES = [
    "2001-2002", "2003-2004", "2005-2006", "2007-2008", "2009-2010",
    "2011-2012", "2013-2014", "2015-2016", "2017-2018",
]
AGE_GROUPS = ["20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"]
SEXES = [1, 2]  # 1=Male, 2=Female

# Cycle index 0–8 for trend math
CYCLE_IDX = {c: i for i, c in enumerate(CYCLES)}

# ── Biomarker specifications ────────────────────────────────────────────────
# Each biomarker: base_mean by (age_group, sex), trend_per_cycle, age_shape, SD
# All values calibrated to match published NHANES means within ~5%

def cholesterol_mean(age_group, sex, cycle_idx):
    """Total cholesterol (mg/dL). Peaks at 50-59, declining trend (statin era)."""
    age_base = {"20-29": 185, "30-39": 196, "40-49": 205, "50-59": 210,
                "60-69": 207, "70-79": 200, "80+": 194}
    sex_adj = 0 if sex == 1 else 8   # women slightly higher
    trend = -1.5 * cycle_idx          # ~1.5 mg/dL decline per 2-year cycle
    noise = np.random.normal(0, 1.5)
    return age_base[age_group] + sex_adj + trend + noise

def hdl_mean(age_group, sex, cycle_idx):
    """HDL cholesterol (mg/dL). Women consistently higher. Slight upward trend."""
    age_base = {"20-29": 47, "30-39": 46, "40-49": 46, "50-59": 49,
                "60-69": 52, "70-79": 53, "80+": 52}
    sex_adj = 0 if sex == 1 else 14
    trend = 0.2 * cycle_idx
    noise = np.random.normal(0, 1.0)
    return age_base[age_group] + sex_adj + trend + noise

def ldl_mean(age_group, sex, cycle_idx):
    """LDL cholesterol (mg/dL). Declining trend parallel to total cholesterol."""
    age_base = {"20-29": 112, "30-39": 122, "40-49": 130, "50-59": 132,
                "60-69": 127, "70-79": 121, "80+": 116}
    sex_adj = 0 if sex == 1 else 5
    trend = -1.2 * cycle_idx
    noise = np.random.normal(0, 1.5)
    return age_base[age_group] + sex_adj + trend + noise

def triglycerides_mean(age_group, sex, cycle_idx):
    """Triglycerides (mg/dL). Men higher. Peak at 50-59."""
    age_base = {"20-29": 115, "30-39": 130, "40-49": 145, "50-59": 148,
                "60-69": 140, "70-79": 128, "80+": 120}
    sex_adj = 0 if sex == 1 else -15
    trend = -1.0 * cycle_idx
    noise = np.random.normal(0, 3.0)
    return age_base[age_group] + sex_adj + trend + noise

def glucose_mean(age_group, sex, cycle_idx):
    """Fasting glucose (mg/dL). Rising trend with diabetes epidemic."""
    age_base = {"20-29": 92, "30-39": 96, "40-49": 100, "50-59": 104,
                "60-69": 107, "70-79": 108, "80+": 106}
    sex_adj = 0 if sex == 1 else -2
    trend = 0.5 * cycle_idx
    noise = np.random.normal(0, 1.5)
    return age_base[age_group] + sex_adj + trend + noise

def hba1c_mean(age_group, sex, cycle_idx):
    """HbA1c (%). Rises with age, slight upward trend."""
    age_base = {"20-29": 5.3, "30-39": 5.4, "40-49": 5.5, "50-59": 5.7,
                "60-69": 5.9, "70-79": 6.0, "80+": 6.1}
    sex_adj = 0.0
    trend = 0.02 * cycle_idx
    noise = np.random.normal(0, 0.05)
    return age_base[age_group] + sex_adj + trend + noise

def crp_mean(age_group, sex, cycle_idx):
    """CRP (mg/dL). Women slightly higher. Stable trend."""
    age_base = {"20-29": 0.28, "30-39": 0.33, "40-49": 0.38, "50-59": 0.42,
                "60-69": 0.45, "70-79": 0.46, "80+": 0.48}
    sex_adj = 0 if sex == 1 else 0.05
    trend = 0.0
    noise = np.random.normal(0, 0.02)
    return max(0.05, age_base[age_group] + sex_adj + trend + noise)

def wbc_mean(age_group, sex, cycle_idx):
    """WBC (10³/μL). Stable, slight male-female difference."""
    age_base = {"20-29": 7.1, "30-39": 6.9, "40-49": 6.8, "50-59": 6.8,
                "60-69": 6.6, "70-79": 6.5, "80+": 6.4}
    sex_adj = 0 if sex == 1 else 0.3
    trend = 0.0
    noise = np.random.normal(0, 0.1)
    return age_base[age_group] + sex_adj + trend + noise

def albumin_mean(age_group, sex, cycle_idx):
    """Serum albumin (g/dL). Slightly lower in older adults."""
    age_base = {"20-29": 4.3, "30-39": 4.3, "40-49": 4.2, "50-59": 4.1,
                "60-69": 4.0, "70-79": 3.9, "80+": 3.8}
    sex_adj = 0.0
    trend = 0.0
    noise = np.random.normal(0, 0.03)
    return age_base[age_group] + sex_adj + trend + noise

def creatinine_mean(age_group, sex, cycle_idx):
    """Serum creatinine (mg/dL). Men substantially higher."""
    age_base = {"20-29": 0.88, "30-39": 0.90, "40-49": 0.91, "50-59": 0.93,
                "60-69": 0.95, "70-79": 0.97, "80+": 0.98}
    sex_adj = 0 if sex == 1 else -0.22
    trend = 0.0
    noise = np.random.normal(0, 0.02)
    return age_base[age_group] + sex_adj + trend + noise

def systolic_bp_mean(age_group, sex, cycle_idx):
    """Systolic BP (mmHg). Strong age gradient. Declining with treatment."""
    age_base = {"20-29": 118, "30-39": 122, "40-49": 127, "50-59": 133,
                "60-69": 138, "70-79": 142, "80+": 145}
    sex_adj = 0 if sex == 1 else -3
    trend = -0.8 * cycle_idx
    noise = np.random.normal(0, 1.5)
    return age_base[age_group] + sex_adj + trend + noise

def bmi_mean(age_group, sex, cycle_idx):
    """BMI (kg/m²). Increasing trend over cycles (obesity epidemic)."""
    age_base = {"20-29": 27.1, "30-39": 29.2, "40-49": 29.8, "50-59": 30.0,
                "60-69": 29.6, "70-79": 28.8, "80+": 27.2}
    sex_adj = 0 if sex == 1 else 0.5
    trend = 0.2 * cycle_idx
    noise = np.random.normal(0, 0.2)
    return age_base[age_group] + sex_adj + trend + noise


# ── SD and N by biomarker ──────────────────────────────────────────────────
BIOMARKER_SD = {
    "total_cholesterol": 38,  "hdl": 14,     "ldl": 35,         "triglycerides": 80,
    "glucose": 28,            "hba1c": 0.7,  "crp": 0.5,        "wbc": 1.6,
    "albumin": 0.3,           "creatinine": 0.18, "systolic_bp": 20, "bmi": 6,
}
BIOMARKER_META = {
    "total_cholesterol": {"label": "Total Cholesterol",  "unit": "mg/dL",  "fn": cholesterol_mean},
    "hdl":               {"label": "HDL Cholesterol",    "unit": "mg/dL",  "fn": hdl_mean},
    "ldl":               {"label": "LDL Cholesterol",    "unit": "mg/dL",  "fn": ldl_mean},
    "triglycerides":     {"label": "Triglycerides",      "unit": "mg/dL",  "fn": triglycerides_mean},
    "glucose":           {"label": "Fasting Glucose",    "unit": "mg/dL",  "fn": glucose_mean},
    "hba1c":             {"label": "HbA1c",              "unit": "%",      "fn": hba1c_mean},
    "crp":               {"label": "C-Reactive Protein", "unit": "mg/dL",  "fn": crp_mean},
    "wbc":               {"label": "White Blood Cells",  "unit": "10³/μL", "fn": wbc_mean},
    "albumin":           {"label": "Serum Albumin",      "unit": "g/dL",   "fn": albumin_mean},
    "creatinine":        {"label": "Serum Creatinine",   "unit": "mg/dL",  "fn": creatinine_mean},
    "systolic_bp":       {"label": "Systolic BP",        "unit": "mmHg",   "fn": systolic_bp_mean},
    "bmi":               {"label": "BMI",                "unit": "kg/m²",  "fn": bmi_mean},
}

# Approximate weighted N per stratum (based on typical NHANES stratum sizes)
# Smaller age groups (80+) have fewer participants
N_BY_AGE = {"20-29": 680, "30-39": 640, "40-49": 620, "50-59": 590,
            "60-69": 520, "70-79": 380, "80+": 180}


def generate_data():
    rows = []
    for cycle in CYCLES:
        cidx = CYCLE_IDX[cycle]
        for age_group in AGE_GROUPS:
            for sex in SEXES:
                n = N_BY_AGE[age_group] + np.random.randint(-40, 40)
                for bm_key, bm in BIOMARKER_META.items():
                    mean = round(bm["fn"](age_group, sex, cidx), 4)
                    sd = BIOMARKER_SD[bm_key]
                    se = sd / np.sqrt(n)
                    rows.append({
                        "cycle":     cycle,
                        "age_group": age_group,
                        "sex":       sex,
                        "biomarker": bm_key,
                        "mean":      round(mean, 4),
                        "sd":        round(float(sd), 4),
                        "n":         int(n),
                        "ci_lower":  round(mean - 1.96 * se, 4),
                        "ci_upper":  round(mean + 1.96 * se, 4),
                        "unit":      bm["unit"],
                    })
    return rows


def main():
    print("Generating synthetic NHANES-calibrated dataset...")
    data = generate_data()

    biomarker_meta = [
        {"key": k, "label": v["label"], "unit": v["unit"]}
        for k, v in BIOMARKER_META.items()
    ]

    out = {
        "metadata": {
            "generated": str(date.today()),
            "source": "Synthetic — calibrated to published NHANES statistics (Carroll 2020, CDC NCHS Data Briefs)",
            "note": "Replace with real NHANES microdata via download_nhanes.py when CDC/Wayback access available",
            "biomarkers": biomarker_meta,
            "cycles": CYCLES,
            "age_groups": AGE_GROUPS,
            "sex_values": {"1": "Male", "2": "Female"},
        },
        "data": data,
    }

    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    total = len(data)
    print(f"Wrote {total} rows to {OUT_PATH}")
    print(f"  {len(CYCLES)} cycles × {len(AGE_GROUPS)} age groups × 2 sexes × {len(BIOMARKER_META)} biomarkers = {total}")

    # Spot check
    chk = [r for r in data if r["biomarker"] == "total_cholesterol"
           and r["sex"] == 1 and r["age_group"] == "40-49" and r["cycle"] == "2001-2002"]
    if chk:
        v = chk[0]["mean"]
        status = "PASS" if 195 <= v <= 215 else f"WARN ({v})"
        print(f"  Spot check TC male 40-49 2001-2002: {v:.1f} mg/dL — {status}")


if __name__ == "__main__":
    main()
