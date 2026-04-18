#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export DATABASE_URL="postgres://tobiasmastek@localhost:5432/paperclip"
export PORT=3100
export HOST=127.0.0.1
export SERVE_UI=true
export NODE_ENV=production
export PAPERCLIP_RUNNER_MODE=remote
export PAPERCLIP_RUNNER_TOKEN="d6e0efa6f85f432c3aec85b3cc9fb2717d39acaf64dd43fc5d6864e2516701e1"
export BETTER_AUTH_SECRET="94b927afd77045771ba6251e00f431ff4e9edca2ecc7aefc29f209858b29b73a"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"  # Set your Anthropic API key here for Papee AI chat

cd ~/paperclip/server
exec pnpm exec tsx src/index.ts