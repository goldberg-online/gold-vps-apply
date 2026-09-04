#!/bin/bash
set -euo pipefail
ROOT=/var/www/gold
test -f "$ROOT/package.json" || { echo "Need $ROOT — are you on the DIS VPS?"; exit 1; }
URL="https://raw.githubusercontent.com/goldberg-online/gold-vps-apply/main/gold-vps.b64"
echo "Downloading patch from GitHub..."
python3 - "$ROOT" "$URL" << 'PY'
import sys, base64, io, tarfile, hashlib, urllib.request
from pathlib import Path
root, url = Path(sys.argv[1]), sys.argv[2]
print("GET", url)
blob = urllib.request.urlopen(url, timeout=60).read().decode("ascii").strip()
print("b64 chars", len(blob))
raw = base64.b64decode(blob)
print("bytes", len(raw), "sha", hashlib.sha256(raw).hexdigest())
expect = "951914857332e628cafd2f24ddfc045228209d01017accbfc5c21bf361f05449"
got = hashlib.sha256(raw).hexdigest()
if got != expect:
    sys.exit("SHA mismatch: got %s want %s" % (got, expect))
n = 0
buf = io.BytesIO(raw)
with tarfile.open(fileobj=buf, mode="r:gz") as tar:
    for m in tar.getmembers():
        if not m.isfile():
            continue
        dest = root / m.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(tar.extractfile(m).read())
        n += 1
        print("WROTE", m.name, dest.stat().st_size)
if n != 23:
    sys.exit("expected 23 files, got %s" % n)
school = (root / "src/lib/school.ts").read_text()
if "attachCumulativeCard" not in school:
    sys.exit("school.ts did not land")
cum = (root / "src/routes/app/cumulative.tsx").read_text()
if "Pupils by class" not in cum:
    sys.exit("cumulative page did not land")
print("OK 23 files under", root)
print("NOW RUN: cd /var/www/gold && npm run build:vps && systemctl restart gold")
PY
echo
echo "Building and restarting GOLD..."
cd "$ROOT"
npm run build:vps
systemctl restart gold
sleep 2
systemctl is-active gold && echo "GOLD is running."
echo "Done. Hard-refresh the site (Ctrl+Shift+R)."
