"""Fetch official CDC source files and codebooks; reject HTML instead of XPT."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
BASE = 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public'
MANIFEST = ROOT.parent / 'data' / 'sources.json'
PINNED = {(r['year'], r['file']): r for r in json.loads(MANIFEST.read_text())} if MANIFEST.exists() else {}

def file_names(year, suffix):
    early = year in (2001, 2003)
    names = [f'DEMO_{suffix}', f'BPX_{suffix}', f'BMX_{suffix}']
    names.append(f'PH_{suffix}' if early else f'FASTQX_{suffix}')
    names += ([f'{p}_{suffix}' for p in ['L13', 'L13AM', 'L25', 'L10', 'L10AM', 'L11', 'L40']]
              if early else [f'{p}_{suffix}' for p in ['TCHOL', 'HDL', 'TRIGLY', 'CBC', 'GHB', 'GLU', 'BIOPRO']])
    if not early and year <= 2009:
        names.append(f'CRP_{suffix}')
    if year >= 2015:
        names.append(f'HSCRP_{suffix}')
    return names

def fetch(item):
    year, name, ext = item
    url = f'{BASE}/{year}/DataFiles/{name}.{ext}'
    path = ROOT / 'cache' / str(year) / f'{name}.{ext}'
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        if '--verify-only' in sys.argv:
            raise FileNotFoundError(path)
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        if ext == 'xpt' and not data.startswith(b'HEADER RECORD*******LIBRARY HEADER RECORD'):
            raise ValueError(f'Not an XPT file: {url}')
        path.write_bytes(data)
    data = path.read_bytes()
    if ext == 'xpt' and not data.startswith(b'HEADER RECORD*******LIBRARY HEADER RECORD'):
        raise ValueError(f'Not an XPT file: {path}')
    digest = hashlib.sha256(data).hexdigest()
    old = PINNED.get((year, path.name))
    if old and old['sha256'] != digest:
        raise ValueError(f'Source changed: {url}. Review the CDC revision before updating the manifest.')
    return dict(year=year, file=path.name, url=url, sha256=digest,
                md5=hashlib.md5(data).hexdigest(), bytes=len(data),
                retrieved_at=old.get('retrieved_at') if old and old.get('retrieved_at') else
                datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat())

if __name__ == '__main__':
    items = [(y, n, e) for y, s in zip(range(2001, 2019, 2), 'BCDEFGHIJ')
             for n in file_names(y, s) for e in ['htm', 'xpt']]
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(fetch, items))
    if '--verify-only' not in sys.argv:
        MANIFEST.write_text(json.dumps(records, indent=2) + '\n')
    print(f'Verified {len(records)} official source files and codebooks.')
