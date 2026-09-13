#!/usr/bin/env bash
#
# Rebuild the site, check it, commit and publish to GitHub Pages.
#
#   ./publish.sh "what changed"       full checks, then push
#   ./publish.sh --fast "what changed"   bundle checks only, then push
#   ./publish.sh --dry "what changed"    rebuild and check, push nothing
#
# Runs from ANY directory: it cd's to its own location first. An earlier version
# of these instructions was a copy-paste sequence beginning `cd data`, which
# silently walked the user to the wrong place when they were not already in the
# project root.
#
# It will NOT push if a check fails. The premise of this project is that no
# published figure goes out unverified, so a failing check has to stop the
# publish rather than warn about it.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$PWD"

# The GitHub noreply address, so the corporate identity in the global git config
# never reaches a public commit. Override with GIT_PUBLISH_EMAIL if needed.
EMAIL="${GIT_PUBLISH_EMAIL:-216244057+financeAzamat@users.noreply.github.com}"
NAME="${GIT_PUBLISH_NAME:-financeAzamat}"
SITE="https://financeazamat.github.io/seeing-the-statistics/"

FAST=0
DRY=0
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --fast) FAST=1; shift ;;
    --dry)  DRY=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
MSG="${1:-}"
if [[ -z "$MSG" && "$DRY" -eq 0 ]]; then
  echo "usage: ./publish.sh [--fast] [--dry] \"what changed\"" >&2
  exit 2
fi

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "rebuild docs/ and the nav"
( cd "$ROOT/data" && python3 build_site.py | tail -3 )

step "check the bundle"
python3 "$ROOT/verify_site.py" > /tmp/udj-verify-site.log 2>&1 \
  && echo "  verify_site.py PASS" \
  || { echo "  verify_site.py FAIL — not publishing"; tail -20 /tmp/udj-verify-site.log; exit 1; }

if [[ "$FAST" -eq 0 ]]; then
  step "re-derive every published figure (pass --fast to skip; takes ~1 min)"
  failed=0
  for v in "$ROOT"/verify_*.py; do
    n=$(basename "$v")
    [[ "$n" == "verify_site.py" ]] && continue
    if python3 "$v" > "/tmp/udj-$n.log" 2>&1; then
      printf '  %-26s PASS\n' "$n"
    else
      printf '  %-26s FAIL  (see /tmp/udj-%s.log)\n' "$n" "$n"
      failed=1
    fi
  done
  if python3 "$ROOT/data/audit_claims.py" > /tmp/udj-audit.log 2>&1; then
    printf '  %-26s PASS\n' "audit_claims.py"
  else
    printf '  %-26s FAIL  (see /tmp/udj-audit.log)\n' "audit_claims.py"
    failed=1
  fi
  if [[ "$failed" -ne 0 ]]; then
    echo -e "\n  a figure no longer matches its data — not publishing"
    exit 1
  fi
fi

if [[ "$DRY" -eq 1 ]]; then
  step "dry run — nothing committed or pushed"
  git -C "$ROOT" status --short | head -20
  exit 0
fi

step "commit and push"
git -C "$ROOT" add -A
if git -C "$ROOT" diff --cached --quiet; then
  echo "  nothing changed — already published"
else
  git -C "$ROOT" -c "user.email=$EMAIL" -c "user.name=$NAME" commit -q -m "$MSG"
  echo "  committed as $(git -C "$ROOT" log -1 --format='%an <%ae>')"
  git -C "$ROOT" push -q origin main
  echo "  pushed to origin/main"
fi

step "live in ~30s"
echo "  $SITE"
