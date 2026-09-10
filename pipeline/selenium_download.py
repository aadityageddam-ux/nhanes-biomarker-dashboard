"""
selenium_download.py — Uses Chrome via Selenium to download missing NHANES XPT files.
CDC blocks automated HTTP clients but Chrome browsers work fine.
"""

import os
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

RAW_DIR = Path(__file__).parent / "data" / "raw"

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
FILE_BASES = ["DEMO", "TCHOL", "CBC", "GHB", "GLU", "CRP", "BPX", "BMX", "BIOPRO"]


def _is_valid_xpt(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(16) == b"HEADER RECORD***"
    except Exception:
        return False


def get_missing_files():
    missing = []
    for cycle in CYCLES:
        for base in FILE_BASES:
            fname = f"{base}{cycle['suffix']}.XPT"
            dest = RAW_DIR / cycle["label"] / fname
            if dest.exists() and _is_valid_xpt(str(dest)):
                continue
            url = f"https://wwwn.cdc.gov/Nchs/Nhanes/{cycle['year1']}-{cycle['year2']}/{fname}"
            missing.append({
                "cycle": cycle["label"],
                "fname": fname,
                "url": url,
                "dest": str(dest),
                "dest_dir": str(RAW_DIR / cycle["label"]),
            })
    return missing


def make_driver(download_dir: str) -> webdriver.Chrome:
    opts = Options()
    # Non-headless so CDC doesn't detect automated browser
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_experimental_option("prefs", {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": False,
        "safebrowsing.disable_download_protection": True,
    })
    # Pin to Chrome 147 to match installed browser
    service = Service(ChromeDriverManager(driver_version="147.0.7727.138").install())
    driver = webdriver.Chrome(service=service, options=opts)
    # Remove webdriver flag via CDP
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })
    return driver


def wait_for_download(dest_dir: str, fname: str, timeout: int = 60) -> bool:
    dest = os.path.join(dest_dir, fname)
    partial = dest + ".crdownload"
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(dest) and _is_valid_xpt(dest):
            return True
        if os.path.exists(partial):
            time.sleep(1)
            continue
        # If neither exists yet, give it a moment to start
        time.sleep(0.5)
    return False


def main():
    missing = get_missing_files()
    if not missing:
        print("All files already present — nothing to download.")
        return

    print(f"Need to download {len(missing)} files via Chrome.")

    # Group by cycle to minimize driver recreations
    by_cycle = {}
    for m in missing:
        by_cycle.setdefault(m["cycle"], []).append(m)

    total_ok = 0
    total_fail = 0

    for cycle_label, files in by_cycle.items():
        dest_dir = str(RAW_DIR / cycle_label)
        os.makedirs(dest_dir, exist_ok=True)
        print(f"\n[{cycle_label}] Downloading {len(files)} files...")

        driver = make_driver(dest_dir)
        try:
            for f in files:
                print(f"  Fetching {f['fname']}...", end=" ", flush=True)
                driver.get(f["url"])
                ok = wait_for_download(dest_dir, f["fname"], timeout=90)
                if ok:
                    size = os.path.getsize(f["dest"])
                    print(f"OK ({size//1024} KB)")
                    total_ok += 1
                else:
                    print("TIMEOUT or invalid")
                    total_fail += 1
                time.sleep(1)  # polite delay between requests
        finally:
            driver.quit()

    print(f"\nDone: {total_ok} downloaded, {total_fail} failed.")
    if total_fail == 0:
        print("All files ready — run: python download_nhanes.py && python generate_json.py")


if __name__ == "__main__":
    main()
