from pathlib import Path
import json, csv
root = Path(__file__).resolve().parents[1]
for p in root.rglob("*.json"):
    json.loads(p.read_text(encoding="utf-8"))
for p in root.rglob("*.jsonl"):
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip(): json.loads(line)
for p in root.rglob("*.csv"):
    with p.open(encoding="utf-8-sig", newline="") as f:
        rows=list(csv.reader(f))
    assert rows and all(len(r)==len(rows[0]) for r in rows)
try:
    import yaml
    spec=yaml.safe_load((root/"schemas/openapi.yaml").read_text(encoding="utf-8"))
    assert spec["openapi"].startswith("3.")
except ImportError:
    text=(root/"schemas/openapi.yaml").read_text(encoding="utf-8")
    assert "openapi: 3.1.0" in text and "\npaths:" in text
print("Search Growth V1.0 devpack structured-file validation passed.")
