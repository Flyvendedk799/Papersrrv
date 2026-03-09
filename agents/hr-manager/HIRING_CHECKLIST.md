# Hiring Checklist

Follow this checklist when requesting a new hire via `POST /api/companies/{companyId}/agent-hires`.

## Required Fields

All new agents MUST be created with these settings:

```json
{
  "name": "<agent-name>",
  "role": "general",
  "adapterType": "cursor",
  "adapterConfig": {
    "command": "wsl -d Ubuntu -- /root/.local/bin/agent",
    "cwd": "/app/agents",
    "workspaceOverride": "/root/paperclip-agents",
    "model": "composer-1.5",
    "timeoutSec": 0,
    "graceSec": 15,
    "instructionsFilePath": "/app/agents/<agent-name>/AGENTS.md",
    "dangerouslyBypassApprovalsAndSandbox": true
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 600,
      "cooldownSec": 10,
      "wakeOnDemand": true,
      "maxConcurrentRuns": 1
    }
  },
  "budgetMonthlyCents": 0,
  "capabilities": "<one-line description of what the agent does>",
  "reportsTo": "<manager-agent-id>"
}
```

## Rules

- **adapterType** must always be `"cursor"`. No exceptions.
- **instructionsFilePath** must point to the agent's AGENTS.md in `/app/agents/<url-key>/`.
- The `<agent-name>` in the path is the URL-safe slug (lowercase, hyphens).
- Always set `reportsTo` to the appropriate manager agent ID.
- Set a clear, concise `capabilities` string.
