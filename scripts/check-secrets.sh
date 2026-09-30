#!/usr/bin/env bash
#
# Secrets gate (BUILD_ORDER Phase 11 — "git grep finds no secret in any client
# bundle or tracked file"; AGENTS.md §3.5 / §5).
#
# The search is by PATTERN, never by literal value — hardcoding a real secret
# here would be the leak it exists to prevent. Documentation placeholders in
# <angle-brackets>, empty `.env.example` values, and obvious tokens like `xxx`
# are expected noise; a plausible real value is a failure.
#
# Exit non-zero on any finding so CI fails the build.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { printf '  \342\234\227 %s\n' "$1"; fail=1; }

echo "secrets gate: scanning tracked files by pattern"

# 1. A three-segment JWT (service-role / anon key material). Never in any tracked
#    file. `.env.example` is excluded because it ships only empty placeholders.
hits=$(git grep -nE "eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}" -- . ':(exclude)pnpm-lock.yaml' || true)
[ -n "$hits" ] && note "JWT-shaped token in a tracked file:
$hits"

# 2. A Cloudinary API secret assigned a real-looking value (letters+digits, >=8),
#    excluding <angle-bracket> placeholders.
hits=$(git grep -nE "CLOUDINARY_API_SECRET=[A-Za-z0-9_-]{8,}" -- . | grep -vE "=<" || true)
[ -n "$hits" ] && note "Cloudinary API secret assigned a value:
$hits"

# 3. Any server secret assigned a value that is NOT an <angle-bracket>
#    placeholder, an empty value, or an obvious token (xxx / your_...).
hits=$(git grep -nE "^[[:space:]]*(CLOUDINARY_API_SECRET|SUPABASE_SERVICE_KEY|SUPABASE_JWT_SECRET|INTERNAL_JWT_SECRET)=[^[:space:]<]" -- . ':(exclude)*.env.example' \
  | grep -vEi "=(xxx|your_|<)" || true)
[ -n "$hits" ] && note "server secret assigned a non-placeholder value:
$hits"

# 4. A VITE_/EXPO_PUBLIC_ variable must never carry a secret (it is inlined into
#    the client bundle, AGENTS.md §3.5).
hits=$(git grep -nE "(VITE_|EXPO_PUBLIC_)[A-Z_]*(SECRET|SERVICE_KEY|JWT_SECRET)" -- . || true)
[ -n "$hits" ] && note "secret-bearing client-public (VITE_/EXPO_PUBLIC_) variable:
$hits"

# 5. No .env.local is tracked or staged.
hits=$(git ls-files | grep -E "\.env(\.local)?$" | grep -v "\.env\.example$" || true)
[ -n "$hits" ] && note "a real .env file is tracked:
$hits"

# 6. A built dashboard bundle must not contain the Cloudinary secret literal.
if [ -d apps/dashboard/dist ]; then
  hits=$(grep -rIl "CLOUDINARY_API_SECRET" apps/dashboard/dist || true)
  [ -n "$hits" ] && note "CLOUDINARY_API_SECRET literal in the dashboard bundle:
$hits"
fi

if [ "$fail" -eq 0 ]; then
  echo "secrets gate: OK — no secret value in any tracked file or client bundle"
  exit 0
fi
echo "secrets gate: FAILED"
exit 1
