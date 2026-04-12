#!/bin/sh
# Wrapper script to run the server with xvfb for headed Chrome in headless environments.
# Needed because Imperva WAF blocks headless Chrome at the TLS level.

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "Error: xvfb-run not found. Install it with:"
  echo "  sudo apt-get install -y xvfb"
  exit 1
fi

exec xvfb-run --auto-servernum -- npx tsx server/index.ts "$@"
