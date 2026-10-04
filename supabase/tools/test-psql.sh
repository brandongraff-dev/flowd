#!/usr/bin/env sh
# Runs the SQL tests against a real Postgres (the local Supabase stack, a CI container or a scratch database) with psql.
# Same files and same assertions as `node supabase/tools/verify-pglite.mjs`; this is the runner for a machine that has Docker and the Supabase CLI.
#
#   supabase start && supabase db reset --no-seed        # a clean database with migrations 0001..0006 and no seed
#   sh supabase/tools/test-psql.sh                        # every supabase/tests/*.test.sql
#   sh supabase/tools/test-psql.sh money                  # only files whose name contains "money"
#   supabase db reset                                     # with the seed this time
#   sh supabase/tools/test-psql.sh --seed                 # tests/seed/*.test.sql (assertions about supabase/seed.sql)
#
# DATABASE_URL defaults to the local Supabase database (postgresql://postgres:postgres@127.0.0.1:54322/postgres).
# Every test file is one transaction that ends in ROLLBACK, so nothing it creates survives. The helper schema "tap" is created by
# tests/00_helpers.sql and is not part of any migration; `drop schema tap cascade;` removes it.

set -eu

here=$(cd "$(dirname "$0")" && pwd)
tests="$here/../tests"
url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

dir="$tests"
filter=""
for arg in "$@"; do
  case "$arg" in
    --seed) dir="$tests/seed" ;;
    *) filter="$arg" ;;
  esac
done

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Use node supabase/tools/verify-pglite.mjs instead (no Docker, no psql)." >&2
  exit 2
fi

psql "$url" -X -q -v ON_ERROR_STOP=1 -f "$tests/00_helpers.sql" >/dev/null

failed=0
count=0
for f in "$dir"/*.test.sql; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  case "$name" in *"$filter"*) ;; *) continue ;; esac
  count=$((count + 1))
  if out=$(psql "$url" -X -q -t -A -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok   $name: $(printf '%s\n' "$out" | grep -E 'passed' | tail -n 1)"
  else
    failed=$((failed + 1))
    echo "FAIL $name"
    printf '%s\n' "$out" | sed 's/^/     /'
  fi
done

if [ "$count" -eq 0 ]; then
  echo "no test files matched" >&2
  exit 2
fi
if [ "$failed" -ne 0 ]; then
  echo "$failed of $count test file(s) failed" >&2
  exit 1
fi
echo "all $count test file(s) passed"
