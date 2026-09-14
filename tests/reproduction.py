"""Compare regenerated analytical values with the current committed snapshot."""
import json
import math
from pathlib import Path
import subprocess

def compare(expected, actual, path='root'):
    if isinstance(expected, bool) or expected is None:
        assert actual == expected, path
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)) and math.isclose(expected, actual, rel_tol=1e-10, abs_tol=1e-8), path
    elif isinstance(expected, dict):
        assert actual.keys() == expected.keys(), path
        for key in expected:
            compare(expected[key], actual[key], f'{path}.{key}')
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for i, (left, right) in enumerate(zip(expected, actual)):
            compare(left, right, f'{path}[{i}]')
    else:
        assert actual == expected, path

if __name__ == '__main__':
    expected = json.loads(subprocess.check_output(['git', 'show', 'HEAD:data/nhanes_data.json']))
    actual = json.loads(Path('data/nhanes_data.json').read_text(encoding='utf-8'))
    for key in ['data', 'mappings', 'biomarkers']:
        compare(expected[key], actual[key], key)
    print('Rebuilt estimates and mappings match the committed snapshot within numerical tolerance.')
