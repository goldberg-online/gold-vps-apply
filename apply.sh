#!/bin/bash
# GOLD VPS apply pack 20260908-r2
# Do not put receipt.$id.tsx in an unquoted bash array — set -u aborts on $id.
set -euo pipefail
echo "GOLD apply pack 20260908-r2"

ROOT=/var/www/gold
test -f "$ROOT/package.json" || { echo "Need $ROOT — are you on the DIS VPS?"; exit 1; }

DL=/tmp/gold-vps-apply-dl
WORKDIR=/tmp/gold-vps-apply-src
rm -rf "$DL" "$WORKDIR"
mkdir -p "$DL"

echo "Downloading patch from GitHub (tarball, no git)..."
set +e
curl -fsSL "https://codeload.github.com/goldberg-online/gold-vps-apply/tar.gz/refs/heads/main" | tar -xz -C "$DL"
tar_ok=$?
set -e
if [ "$tar_ok" -ne 0 ]; then
  echo "codeload failed, trying github archive..."
  curl -fsSL "https://github.com/goldberg-online/gold-vps-apply/archive/refs/heads/main.tar.gz" | tar -xz -C "$DL"
fi

SRCROOT=""
for d in "$DL"/gold-vps-apply-*; do
  if [ -d "$d" ]; then SRCROOT="$d"; break; fi
done
test -n "$SRCROOT" && test -d "$SRCROOT/src" || { echo "Download did not unpack"; ls -la "$DL"; exit 1; }
cp -a "$SRCROOT" "$WORKDIR"
echo "Unpacked $WORKDIR"

test -d "$WORKDIR/src" && test -d "$WORKDIR/migrations" || { echo "Pack missing src or migrations"; exit 1; }
mkdir -p "$ROOT/src" "$ROOT/migrations"
cp -a "$WORKDIR/src/." "$ROOT/src/"
cp -a "$WORKDIR/migrations/." "$ROOT/migrations/"

n=0
list=/tmp/gold-apply-files.txt
find "$WORKDIR/src" "$WORKDIR/migrations" -type f | sort > "$list"
while IFS= read -r f; do
  rel=${f#"$WORKDIR"/}
  dest="$ROOT/$rel"
  test -f "$dest" || { echo "FAILED to land $rel"; exit 1; }
  n=$((n+1))
  echo "WROTE $rel $(wc -c < "$dest")"
done < "$list"

if [ "$n" -lt 38 ]; then
  echo "expected at least 38 files, got $n"; exit 1
fi

# Glob the receipt route so bash never expands $id
found_receipt=0
for r in "$ROOT/src/routes/app"/receipt.*.tsx; do
  if [ -f "$r" ]; then found_receipt=1; fi
done
test "$found_receipt" -eq 1 || { echo "receipt route did not land"; exit 1; }

grep -q attachCumulativeCard "$ROOT/src/lib/school.ts" || { echo "school.ts did not land"; exit 1; }
grep -q "Pupils by class" "$ROOT/src/routes/app/cumulative.tsx" || { echo "cumulative page did not land"; exit 1; }
grep -q postAnnouncement "$ROOT/src/lib/announcements.ts" || { echo "announcements lib did not land"; exit 1; }
grep -q 'href: "/app/announcements"' "$ROOT/src/routes/app.tsx" || { echo "announcements menu did not land"; exit 1; }
grep -q "A Christian private school in Accra" "$ROOT/src/components/prospectus.tsx" || { echo "prospectus did not land"; exit 1; }
grep -q "Sign in to the office" "$ROOT/src/components/prospectus.tsx" || { echo "prospectus sign-in CTA did not land"; exit 1; }
grep -q 'return <Prospectus signedIn={!!user} />' "$ROOT/src/routes/index.tsx" || { echo "front page is not the school prospectus"; exit 1; }
grep -q 'signOut("/")' "$ROOT/src/lib/auth/idle-logout.tsx" || { echo "idle logout did not land on prospectus"; exit 1; }
grep -q receipt-paid-mark "$ROOT/src/components/official-receipt.tsx" || { echo "paid watermark did not land"; exit 1; }
grep -q 'Print feeding' "$ROOT/src/routes/app/services.tsx" || { echo "bus/feeding print did not land"; exit 1; }
echo "OK $n files under $ROOT"

echo
echo "Building and restarting GOLD..."
cd "$ROOT"
npm run build:vps
systemctl restart gold
sleep 2
systemctl is-active gold && echo "GOLD is running."
echo "Done. Hard-refresh the site (Ctrl+Shift+R)."
echo "Look for: Bus & feeding → Print feeding / Print bus."
