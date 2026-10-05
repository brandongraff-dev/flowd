#!/usr/bin/env bash
# Keeps the shared Next.js dev server alive on :3000 (restarts it if it dies). Run from the repo root.
while true; do
  if ! curl -s -o /dev/null -m 8 http://localhost:3000/; then
    echo "[$(date +%T)] dev server down - starting"
    (npm --prefix apps/web run dev > .dev-server.log 2>&1 &)
    sleep 25
  fi
  sleep 20
done
