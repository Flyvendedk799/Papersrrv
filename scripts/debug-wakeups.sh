#!/usr/bin/env bash
# Dumps wakeup/mention/run debug info to a local file for AI diagnosis.
# Usage: bash scripts/debug-wakeups.sh [companyId]
#
# Reads from the local or Railway server and writes to scripts/debug-output.json
# so Claude Code can read it directly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$SCRIPT_DIR/debug-output.json"

# Default to first company if not specified
COMPANY_ID="${1:-}"
BASE_URL="${PAPERCLIP_API_URL:-http://localhost:4100/api}"

if [ -z "$COMPANY_ID" ]; then
  echo "Fetching first company..."
  COMPANY_ID=$(curl -sf "$BASE_URL/companies" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const companies=JSON.parse(d);
      if(companies.length)console.log(companies[0].id);
      else{console.error('No companies found');process.exit(1);}
    })")
  echo "Using company: $COMPANY_ID"
fi

echo "Querying debug endpoints..."

node -e "
const BASE = '${BASE_URL}';
const CID = '${COMPANY_ID}';

async function fetch_json(url) {
  const res = await fetch(url);
  if (!res.ok) return { error: res.status + ' ' + res.statusText, url };
  return res.json();
}

async function main() {
  const [wakeups, mentions, runs] = await Promise.all([
    fetch_json(BASE + '/companies/' + CID + '/debug/wakeups?limit=30'),
    fetch_json(BASE + '/companies/' + CID + '/debug/mentions?limit=20'),
    fetch_json(BASE + '/companies/' + CID + '/debug/runs?limit=30'),
  ]);

  const output = {
    _generated: new Date().toISOString(),
    _companyId: CID,
    wakeups,
    mentions,
    runs,
  };

  require('fs').writeFileSync('${OUT}', JSON.stringify(output, null, 2));
  console.log('Written to ${OUT}');

  // Quick summary
  console.log('\\n--- Wakeup stats ---');
  if (wakeups.stats) console.log(JSON.stringify(wakeups.stats, null, 2));
  console.log('\\n--- Run stats ---');
  if (runs.stats) console.log(JSON.stringify(runs.stats, null, 2));
  console.log('\\n--- Recent mentions: ' + (mentions.wakeups?.length ?? 0) + ' ---');
  for (const m of (mentions.wakeups ?? []).slice(0, 5)) {
    console.log('  ' + m.agentName + ' | ' + m.status + ' | run:' + (m.runStatus ?? 'none') + ' | ' + m.requestedAt);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
" 2>&1

echo ""
echo "Full output saved to: $OUT"
echo "Ask Claude Code to read: scripts/debug-output.json"
