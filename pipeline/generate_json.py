"""
Convert nhanes_biomarkers.parquet → data/nhanes_data.json for the frontend SPA.

JSON schema:
{
  "metadata": {
    "generated": "ISO date",
    "biomarkers": [{"key": str, "label": str, "unit": str}, ...],
    "cycles": [str, ...],
    "age_groups": [str, ...],
    "sex_values": {"1": "Male", "2": "Female"}
  },
  "data": [
    {"cycle": str, "age_group": str, "sex": int, "biomarker": str,
     "mean": float, "ci_lower": float, "ci_upper": float, "n": int, "unit": str},
    ...
  ]
}

sex is integer 1 (Male) or 2 (Female) — not a string.
"""

import json
import math
from datetime import date
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).parent
PARQUET_PATH = SCRIPT_DIR / "data" / "processed" / "nhanes_biomarkers.parquet"
JSON_OUT = SCRIPT_DIR.parent / "data" / "nhanes_data.json"

BIOMARKER_META = {
    "total_cholesterol": {"label": "Total Cholesterol",  "unit": "mg/dL"},
    "hdl":               {"label": "HDL Cholesterol",    "unit": "mg/dL"},
    "ldl":               {"label": "LDL Cholesterol",    "unit": "mg/dL"},
    "triglycerides":     {"label": "Triglycerides",      "unit": "mg/dL"},
    "glucose":           {"label": "Fasting Glucose",    "unit": "mg/dL"},
    "hba1c":             {"label": "HbA1c",              "unit": "%"},
    "crp":               {"label": "C-Reactive Protein", "unit": "mg/dL"},
    "wbc":               {"label": "White Blood Cells",  "unit": "10³/μL"},
    "albumin":           {"label": "Serum Albumin",      "unit": "g/dL"},
    "creatinine":        {"label": "Serum Creatinine",   "unit": "mg/dL"},
    "systolic_bp":       {"label": "Systolic BP",        "unit": "mmHg"},
    "bmi":               {"label": "BMI",                "unit": "kg/m²"},
}

CYCLE_ORDER = [
    "2001-2002", "2003-2004", "2005-2006", "2007-2008", "2009-2010",
    "2011-2012", "2013-2014", "2015-2016", "2017-2018",
]

AGE_GROUP_ORDER = ["20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"]


def safe_float(val):
    """Convert to float; return None if NaN/inf."""
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except (TypeError, ValueError):
        return None


def parquet_to_json(parquet_path: str, json_out_path: str) -> None:
    """Read parquet, build JSON with metadata + data array, write to json_out_path."""
    df = pd.read_parquet(parquet_path)

    # Determine which cycles and biomarkers are actually present
    present_cycles = [c for c in CYCLE_ORDER if c in df["cycle"].values]
    present_biomarkers = [b for b in BIOMARKER_META if b in df["biomarker"].values]

    metadata = {
        "generated": date.today().isoformat(),
        "biomarkers": [
            {"key": key, "label": BIOMARKER_META[key]["label"], "unit": BIOMARKER_META[key]["unit"]}
            for key in present_biomarkers
        ],
        "cycles": present_cycles,
        "age_groups": AGE_GROUP_ORDER,
        "sex_values": {"1": "Male", "2": "Female"},
    }

    data_rows = []
    for _, row in df.iterrows():
        mean_val = safe_float(row["mean"])
        if mean_val is None:
            continue  # skip strata with no valid mean
        data_rows.append({
            "cycle":     row["cycle"],
            "age_group": row["age_group"],
            "sex":       int(row["sex"]),
            "biomarker": row["biomarker"],
            "mean":      mean_val,
            "ci_lower":  safe_float(row["ci_lower"]),
            "ci_upper":  safe_float(row["ci_upper"]),
            "n":         int(row["n"]) if pd.notna(row["n"]) else 0,
            "unit":      row["unit"],
        })

    output = {"metadata": metadata, "data": data_rows}

    Path(json_out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(json_out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {len(data_rows):,} rows → {json_out_path}")
    print(f"Cycles present: {present_cycles}")
    print(f"Biomarkers present: {present_biomarkers}")


if __name__ == "__main__":
    if not PARQUET_PATH.exists():
        raise FileNotFoundError(
            f"Parquet not found at {PARQUET_PATH}.\n"
            "Run download_nhanes.py first."
        )
    parquet_to_json(str(PARQUET_PATH), str(JSON_OUT))
