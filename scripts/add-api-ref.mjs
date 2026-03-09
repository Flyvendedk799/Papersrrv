import fs from "fs";
import path from "path";

const agentsDir = "C:/Users/tobia/OneDrive/Skrivebord/paperclip/agents";
const API_REF = `
## API Quick Reference

Use \`$PAPERCLIP_API_URL\` as the base. Authenticate with \`Authorization: Bearer $PAPERCLIP_API_KEY\`.
Include \`X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID\` header on all mutating (POST/PATCH/DELETE) calls.

| Action | Method | Endpoint |
|--------|--------|----------|
| Who am I? | GET | \`/api/agents/me\` |
| List my issues | GET | \`/api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked\` |
| Get issue detail | GET | \`/api/issues/{id}\` |
| Create issue | POST | \`/api/companies/{companyId}/issues\` |
| Update issue (status, fields) | PATCH | \`/api/issues/{id}\` -- body: \`{status, title, description, ...}\` |
| Checkout issue | POST | \`/api/issues/{id}/checkout\` -- body: \`{agentId, expectedStatuses}\` |
| Release checkout | POST | \`/api/issues/{id}/release\` |
| List comments | GET | \`/api/issues/{id}/comments\` |
| Post comment | POST | \`/api/issues/{id}/comments\` -- body: \`{body}\` |
| List agents | GET | \`/api/companies/{companyId}/agents\` |
| Request hire | POST | \`/api/companies/{companyId}/approvals\` -- body: \`{type: "hire_agent", payload: {...}}\` |
| List approvals | GET | \`/api/companies/{companyId}/approvals\` |
`;

const dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith("tmp-"));

let updated = 0;
for (const dir of dirs) {
  const hbPath = path.join(agentsDir, dir.name, "HEARTBEAT.md");
  if (!fs.existsSync(hbPath)) continue;

  let content = fs.readFileSync(hbPath, "utf8");
  if (content.includes("API Quick Reference")) {
    console.log("  skip (already has API ref):", dir.name);
    continue;
  }

  content = content.trimEnd() + "\n" + API_REF;
  fs.writeFileSync(hbPath, content);
  updated++;
  console.log("  updated:", dir.name);
}
console.log("Updated", updated, "files");
