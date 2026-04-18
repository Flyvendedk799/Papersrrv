#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
security unlock-keychain -p "abe12345" ~/Library/Keychains/login.keychain-db 2>/dev/null
export PAPERCLIP_SERVER_URL="http://localhost:3100"
export PAPERCLIP_PUBLIC_URL="http://192.168.0.182:8080"
export PAPERCLIP_RUNNER_TOKEN="d6e0efa6f85f432c3aec85b3cc9fb2717d39acaf64dd43fc5d6864e2516701e1"
export POLL_INTERVAL_MS=1000
export MAX_CONCURRENT_RUNS=15
cd ~/paperclip
exec node scripts/local-runner-macos.mjs
