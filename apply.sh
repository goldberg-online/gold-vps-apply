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
  src/lib/announcements.ts
  src/lib/auth/idle-logout.tsx
  src/components/cumulative-record.tsx
  src/components/student-typeahead.tsx
  src/components/announcement-feed.tsx
  src/components/prospectus.tsx
  src/components/system-prospectus.tsx
  src/components/receipt-gallery.tsx
  src/components/official-receipt.tsx
  src/routes/app/cumulative.tsx
  src/routes/app/students.tsx
  src/routes/app/academic.tsx
  src/routes/app/marks.tsx
  src/routes/app/report-cards.tsx
  src/routes/app/index.tsx
  src/routes/app.tsx
  src/routes/app/announcements.tsx
  src/routes/app/billing.tsx
  src/routes/app/payments.tsx
  src/routes/app/services.tsx
  src/routes/app/homework.tsx
  src/routes/app/promote.tsx
  src/routes/app/receipt.$id.tsx
  src/routes/index.tsx
  src/routes/looks.tsx
  src/routes/login.tsx
  src/routes/online.tsx
  src/styles.css
  migrations/0015_enrolled_on.sql
  migrations/0016_cumulative.sql
  migrations/0017_cumulative_records.sql
  migrations/0018_announcements.sql
  migrations/0019_service_receipts.sql
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

if [ "$n" -ne 38 ]; then
  echo "expected 38 files, got $n"; exit 1
fi
grep -q attachCumulativeCard "$ROOT/src/lib/school.ts" || { echo "school.ts did not land"; exit 1; }
grep -q "Pupils by class" "$ROOT/src/routes/app/cumulative.tsx" || { echo "cumulative page did not land"; exit 1; }
grep -q postAnnouncement "$ROOT/src/lib/announcements.ts" || { echo "announcements lib did not land"; exit 1; }
grep -q 'href: "/app/announcements"' "$ROOT/src/routes/app.tsx" || { echo "announcements menu did not land"; exit 1; }
grep -q "A Christian private school in Accra" "$ROOT/src/components/prospectus.tsx" || { echo "prospectus did not land"; exit 1; }
grep -q "Sign in to the office" "$ROOT/src/components/prospectus.tsx" || { echo "prospectus sign-in CTA did not land"; exit 1; }
grep -q 'return <Prospectus signedIn={!!user} />' "$ROOT/src/routes/index.tsx" || { echo "front page is not the school prospectus"; exit 1; }
grep -q 'signOut("/")' "$ROOT/src/lib/auth/idle-logout.tsx" || { echo "idle logout did not land on prospectus"; exit 1; }
grep -q receipt-paid-mark "$ROOT/src/components/official-receipt.tsx" || { echo "paid watermark did not land"; exit 1; }
grep -q 'Print receipt' "$ROOT/src/routes/app/services.tsx" || { echo "bus/feeding print did not land"; exit 1; }
echo "OK 38 files under $ROOT"

echo
echo "Building and restarting GOLD..."
cd "$ROOT"
npm run build:vps
systemctl restart gold
sleep 2
systemctl is-active gold && echo "GOLD is running."
echo "Done. Hard-refresh the site (Ctrl+Shift+R)."
