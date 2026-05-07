"""
NHANES Longitudinal Biomarker Pipeline
Downloads XPT files from CDC for 9 cycles (2001-2018), harmonizes 12 biomarkers,
applies survey weights, computes weighted statistics per (cycle × age_group × sex × biomarker),
and saves aggregated + raw parquet files.
"""

import os
import time
import requests
import numpy as np
import pandas as pd
import pyreadstat
from pathlib import Path
from io import BytesIO

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
RAW_DIR = SCRIPT_DIR / "data" / "raw"
PROCESSED_DIR = SCRIPT_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

CDC_BASE = "https://wwwn.cdc.gov/Nchs/Nhanes/{year1}-{year2}/{filename}.XPT"
# CDC blocks automated downloads; Wayback Machine has cached all NHANES XPT files
WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx?url={url}&output=json&fl=timestamp&limit=1&filter=statuscode:200&collapse=digest"
WAYBACK_FETCH = "https://web.archive.org/web/{timestamp}if_/{url}"

# ── Cycle definitions ─────────────────────────────────────────────────────────
CYCLES = [
    {"label": "2001-2002", "suffix": "_B", "year1": 2001, "year2": 2002},
    {"label": "2003-2004", "suffix": "_C", "year1": 2003, "year2": 2004},
    {"label": "2005-2006", "suffix": "_D", "year1": 2005, "year2": 2006},
    {"label": "2007-2008", "suffix": "_E", "year1": 2007, "year2": 2008},
    {"label": "2009-2010", "suffix": "_F", "year1": 2009, "year2": 2010},
    {"label": "2011-2012", "suffix": "_G", "year1": 2011, "year2": 2012},
    {"label": "2013-2014", "suffix": "_H", "year1": 2013, "year2": 2014},
    {"label": "2015-2016", "suffix": "_I", "year1": 2015, "year2": 2016},
    {"label": "2017-2018", "suffix": "_J", "year1": 2017, "year2": 2018},
]

# XPT file base names per category (suffix appended per cycle)
FILE_CATEGORIES = {
    "demo":     ["DEMO"],
    "chol":     ["TCHOL"],
    "cbc":      ["CBC"],
    "hba1c":    ["GHB"],
    "glucose":  ["GLU"],
    "crp":      ["CRP"],
    "bp":       ["BPX"],
    "bmi":      ["BMX"],
    "biochem":  ["BIOPRO"],
}

# ── Biomarker harmonization map ───────────────────────────────────────────────
BIOMARKER_MAP = {
    "total_cholesterol": {"vars": ["LBXTC", "LBDTCSI"],   "unit": "mg/dL", "label": "Total Cholesterol"},
    "hdl":               {"vars": ["LBDHDD", "LBXHDD"],   "unit": "mg/dL", "label": "HDL Cholesterol"},
    "ldl":               {"vars": ["LBDLDL", "LBDLDLSI"], "unit": "mg/dL", "label": "LDL Cholesterol"},
    "triglycerides":     {"vars": ["LBXTR", "LBDTRSI"],   "unit": "mg/dL", "label": "Triglycerides"},
    "glucose":           {"vars": ["LBXGLU", "LBDGLUSI"], "unit": "mg/dL", "label": "Fasting Glucose"},
    "hba1c":             {"vars": ["LBXGH"],               "unit": "%",     "label": "HbA1c"},
    "crp":               {"vars": ["LBXCRP", "LBDCRP"],   "unit": "mg/dL", "label": "C-Reactive Protein"},
    "wbc":               {"vars": ["LBXWBCSI"],            "unit": "10³/μL","label": "White Blood Cells"},
    "albumin":           {"vars": ["LBXSAL"],              "unit": "g/dL",  "label": "Serum Albumin"},
    "creatinine":        {"vars": ["LBXSCR", "LBDSCR"],   "unit": "mg/dL", "label": "Serum Creatinine"},
    "systolic_bp":       {"vars": ["BPXSY1", "BPXOSY1"],  "unit": "mmHg",  "label": "Systolic BP"},
    "bmi":               {"vars": ["BMXBMI"],              "unit": "kg/m²", "label": "BMI"},
}

AGE_BINS = [20, 30, 40, 50, 60, 70, 80, 120]
AGE_LABELS = ["20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"]


def _is_valid_xpt(data: bytes) -> bool:
    """Check if bytes start with valid SAS XPT header."""
    return data[:16] == b"HEADER RECORD***"


def _wayback_snapshot_url(cdc_url: str) -> str | None:
    """Use CDX API to find the best Wayback Machine snapshot URL for a CDC XPT file."""
    try:
        resp = requests.get(
            WAYBACK_CDX.format(url=cdc_url),
            timeout=15,
        )
        if resp.status_code == 200:
            rows = resp.json()
            # rows[0] is the header row ["timestamp"], rows[1] is the data row
            if len(rows) >= 2 and rows[1]:
                ts = rows[1][0]
                return WAYBACK_FETCH.format(timestamp=ts, url=cdc_url)
    except Exception:
        pass
    return None


def download_xpt(url: str, dest_path: str) -> bool:
    """
    Download XPT file to dest_path.
    Strategy: CDC direct → Wayback CDX API snapshot → year-based fallbacks.
    Returns True on success (file is a valid XPT).
    """
    if os.path.exists(dest_path):
        with open(dest_path, "rb") as f:
            if _is_valid_xpt(f.read(16)):
                return True
        os.remove(dest_path)  # cached HTML stub — re-download

    fname = url.split("/")[-1]

    # Build source list: CDC direct, then CDX best snapshot, then year guesses
    sources = [url]
    cdx_url = _wayback_snapshot_url(url)
    if cdx_url:
        sources.append(cdx_url)
    # Year-based fallbacks as last resort
    for year in ["2022", "2021", "2020", "2023", "2019", "2018"]:
        sources.append(f"https://web.archive.org/web/{year}/{url}")

    for src in sources:
        for attempt in range(2):
            try:
                resp = requests.get(src, timeout=60)
                if resp.status_code == 200:
                    data = resp.content
                    if _is_valid_xpt(data):
                        with open(dest_path, "wb") as f:
                            f.write(data)
                        print(f"    OK  {fname} ({len(data)//1024} KB)")
                        return True
                elif resp.status_code == 404:
                    break  # try next source
                if attempt == 0:
                    time.sleep(2)
            except Exception as e:
                if attempt == 1:
                    print(f"    WARN: {fname} — {type(e).__name__}")
                time.sleep(2)

    print(f"    FAIL: {fname} — all sources exhausted")
    return False


def load_xpt(path: str) -> pd.DataFrame:
    """Load an XPT file into a DataFrame using pyreadstat."""
    df, _ = pyreadstat.read_xport(path)
    df.columns = [c.upper() for c in df.columns]
    return df


def load_cycle(cycle: dict) -> pd.DataFrame:
    """
    Download and merge all XPT files for one NHANES cycle.
    Returns merged DataFrame indexed by SEQN.
    Missing files are skipped with a warning (biomarker will be absent).
    """
    label = cycle["label"]
    suffix = cycle["suffix"]
    y1, y2 = cycle["year1"], cycle["year2"]
    cycle_dir = RAW_DIR / label
    cycle_dir.mkdir(parents=True, exist_ok=True)

    frames = {}
    for category, base_names in FILE_CATEGORIES.items():
        for base in base_names:
            filename = f"{base}{suffix}"
            url = CDC_BASE.format(year1=y1, year2=y2, filename=filename)
            dest = str(cycle_dir / f"{filename}.XPT")
            ok = download_xpt(url, dest)
            if ok and os.path.exists(dest):
                try:
                    frames[category] = load_xpt(dest)
                    break
                except Exception as e:
                    print(f"    WARN: could not load {filename}: {e}")
            else:
                # Try without suffix for some files
                pass

    if "demo" not in frames:
        print(f"  ERROR: demo file missing for {label} — skipping cycle")
        return pd.DataFrame()

    demo = frames["demo"]
    required_cols = ["SEQN", "RIDAGEYR", "RIAGENDR", "RIDRETH1"]
    weight_candidates = ["WTMEC4YR", "WTMEC2YR", "WTINT4YR", "WTINT2YR"]
    available_weights = [c for c in weight_candidates if c in demo.columns]
    select_cols = required_cols + available_weights
    merged = demo[select_cols].copy()
    # Fill any missing weight columns with NaN so downstream code can reference them safely
    for col in weight_candidates:
        if col not in merged.columns:
            merged[col] = np.nan

    for cat, df in frames.items():
        if cat == "demo":
            continue
        if "SEQN" in df.columns:
            df = df.set_index("SEQN")
        merged = merged.merge(df, how="left", left_on="SEQN", right_index=True)

    return merged


def harmonize_biomarker(df: pd.DataFrame, biomarker_key: str) -> pd.Series:
    """Try each variable alias in order; return the first non-null column as a Series."""
    for var in BIOMARKER_MAP[biomarker_key]["vars"]:
        if var in df.columns and df[var].notna().any():
            return df[var]
    return pd.Series(np.nan, index=df.index, name=biomarker_key)


def compute_weighted_stats(values: np.ndarray, weights: np.ndarray) -> dict:
    """
    Returns weighted mean, SD, n, and 95% CI lower/upper.
    weights must be positive and non-zero.
    """
    mask = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    v = values[mask]
    w = weights[mask]
    n = int(mask.sum())
    if n < 2:
        return {"mean": np.nan, "sd": np.nan, "n": n, "ci_lower": np.nan, "ci_upper": np.nan}
    w_sum = w.sum()
    mean = float(np.average(v, weights=w))
    variance = float(np.sum(w * (v - mean) ** 2) / w_sum)
    sd = float(np.sqrt(variance))
    se = sd / np.sqrt(n)
    return {
        "mean": round(mean, 4),
        "sd": round(sd, 4),
        "n": n,
        "ci_lower": round(mean - 1.96 * se, 4),
        "ci_upper": round(mean + 1.96 * se, 4),
    }


def aggregate_cycle(cycle: dict, df: pd.DataFrame) -> pd.DataFrame:
    """
    For one cycle's merged DataFrame, produce long-format aggregated statistics.
    Columns: cycle, age_group, sex, biomarker, mean, sd, n, ci_lower, ci_upper, unit
    """
    label = cycle["label"]
    y2 = cycle["year2"]

    # Survey weight preference: WTMEC2YR (2-year exam) for single-cycle analysis,
    # fall back through alternatives. WTMEC4YR only existed for combined 2001-2004 datasets.
    weight_col = None
    for candidate in ["WTMEC2YR", "WTMEC4YR", "WTINT2YR", "WTINT4YR"]:
        if candidate in df.columns and df[candidate].notna().any() and (df[candidate] > 0).any():
            weight_col = candidate
            break

    df = df.copy()
    if weight_col:
        df["_weight"] = df[weight_col].fillna(0.0)
    else:
        print(f"  WARN: no valid weight column found for {label}, using uniform weights")
        df["_weight"] = 1.0

    # Age filter and binning
    df = df[df["RIDAGEYR"].between(20, 120, inclusive="left")].copy()
    df["age_group"] = pd.cut(
        df["RIDAGEYR"], bins=AGE_BINS, labels=AGE_LABELS, right=False
    )
    df = df.dropna(subset=["age_group"])

    rows = []
    for biomarker_key, meta in BIOMARKER_MAP.items():
        df["_bm"] = harmonize_biomarker(df, biomarker_key)
        bm_df = df.dropna(subset=["_bm"])
        bm_df = bm_df[bm_df["_weight"] > 0]
        for sex_val in [1, 2]:
            sex_df = bm_df[bm_df["RIAGENDR"] == sex_val]
            for ag in AGE_LABELS:
                ag_df = sex_df[sex_df["age_group"] == ag]
                stats = compute_weighted_stats(
                    ag_df["_bm"].values, ag_df["_weight"].values
                )
                rows.append({
                    "cycle": label,
                    "age_group": ag,
                    "sex": sex_val,
                    "biomarker": biomarker_key,
                    "unit": meta["unit"],
                    **stats,
                })

    return pd.DataFrame(rows)


def aggregate_all_cycles(cycles: list) -> pd.DataFrame:
    """Process all cycles; return combined long-format DataFrame."""
    all_frames = []
    for cycle in cycles:
        print(f"\n[{cycle['label']}] Loading...")
        df = load_cycle(cycle)
        if df.empty:
            print(f"  SKIP: empty DataFrame for {cycle['label']}")
            continue
        print(f"  Loaded {len(df):,} participants. Aggregating...")
        agg = aggregate_cycle(cycle, df)
        all_frames.append(agg)
        print(f"  Done: {len(agg)} stratum rows")
    return pd.concat(all_frames, ignore_index=True)


def main() -> None:
    print("=" * 60)
    print("NHANES Biomarker Pipeline")
    print("=" * 60)

    combined = aggregate_all_cycles(CYCLES)

    # Save aggregated parquet
    agg_path = PROCESSED_DIR / "nhanes_biomarkers.parquet"
    combined.to_parquet(agg_path, index=False)
    print(f"\nSaved aggregated parquet: {agg_path}")
    print(f"Shape: {combined.shape}")
    print(f"Cycles: {sorted(combined['cycle'].unique())}")
    print(f"Biomarkers: {sorted(combined['biomarker'].unique())}")

    # Spot check
    chk = combined[
        (combined["biomarker"] == "total_cholesterol")
        & (combined["sex"] == 1)
        & (combined["age_group"] == "40-49")
        & (combined["cycle"] == "2001-2002")
    ]
    if not chk.empty:
        val = chk.iloc[0]["mean"]
        status = "PASS" if 205 <= val <= 215 else "WARN (out of expected 205-215)"
        print(f"\nSpot check (TC male 40-49 2001-2002): {val:.1f} mg/dL — {status}")
    else:
        print("\nSpot check row not found — check variable mapping")


if __name__ == "__main__":
    main()
