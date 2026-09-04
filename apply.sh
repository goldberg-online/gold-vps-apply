#!/bin/bash
set -euo pipefail
ROOT=/var/www/gold
test -f "$ROOT/package.json" || { echo "Need $ROOT — are you on the DIS VPS?"; exit 1; }

WORKDIR=/tmp/gold-vps-apply-src
rm -rf "$WORKDIR"
echo "Cloning patch from GitHub..."
git clone --depth 1 https://github.com/goldberg-online/gold-vps-apply.git "$WORKDIR"

FILES=(
  src/lib/ghana.ts
  src/lib/ges-cumulative.ts
  src/lib/cumulative-store.ts
  src/lib/academic-ops.ts
  src/lib/school.ts
  src/components/cumulative-record.tsx
  src/components/student-typeahead.tsx
  src/routes/app/cumulative.tsx
  src/routes/app/students.tsx
  src/routes/app/academic.tsx
  src/routes/app/marks.tsx
  src/routes/app/report-cards.tsx
  src/routes/app/index.tsx
  src/routes/app.tsx
  src/routes/app/billing.tsx
  src/routes/app/payments.tsx
  src/routes/app/services.tsx
  src/routes/app/homework.tsx
  src/routes/app/promote.tsx
  src/styles.css
  migrations/0015_enrolled_on.sql
  migrations/0016_cumulative.sql
  migrations/0017_cumulative_records.sql
)

n=0
for f in "${FILES[@]}"; do
  src="$WORKDIR/$f"
  dest="$ROOT/$f"
  test -f "$src" || { echo "MISSING in repo: $f"; exit 1; }
  mkdir -p "$(dirname "$dest")"
  cp -a "$src" "$dest"
  n=$((n+1))
  echo "WROTE $f $(wc -c < "$dest")"
done

if [ "$n" -ne 23 ]; then
  echo "expected 23 files, got $n"; exit 1
fi
grep -q attachCumulativeCard "$ROOT/src/lib/school.ts" || { echo "school.ts did not land"; exit 1; }
grep -q "Pupils by class" "$ROOT/src/routes/app/cumulative.tsx" || { echo "cumulative page did not land"; exit 1; }
echo "OK 23 files under $ROOT"

echo
echo "Building and restarting GOLD..."
cd "$ROOT"
npm run build:vps
systemctl restart gold
sleep 2
systemctl is-active gold && echo "GOLD is running."
echo "Done. Hard-refresh the site (Ctrl+Shift+R)."
