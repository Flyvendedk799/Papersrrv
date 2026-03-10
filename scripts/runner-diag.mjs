// Diagnostics for Paperclip Local Runner
const SERVER_URL = process.env.PAPERCLIP_SERVER_URL;
const RUNNER_TOKEN = process.env.PAPERCLIP_RUNNER_TOKEN;

if (!SERVER_URL || !RUNNER_TOKEN) {
    console.error("❌ ERROR: PAPERCLIP_SERVER_URL and PAPERCLIP_RUNNER_TOKEN environment variables are required.");
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${RUNNER_TOKEN}`,
};

const pollUrl = `${SERVER_URL}/api/runner/poll`;

console.log(`🔍 Runner Diagnostics`);
console.log(`   Server: ${SERVER_URL}`);

globalThis.fetch(pollUrl, { headers })
    .then(async (res) => {
        if (res.status === 401) {
            console.error("❌ Auth Failed: Check your PAPERCLIP_RUNNER_TOKEN. It must match the server's token.");
            return;
        }

        if (!res.ok) {
            console.error(`❌ API Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(`   Details: ${text}`);
            return;
        }

        const data = await res.json();
        console.log("✅ Connection Successful!");
        if (data.run) {
            console.log(`📥 A queued run WAS found!`);
            console.log(`   Run ID: ${data.run.runId}`);
            console.log(`   Agent ID: ${data.run.agentId}`);
            console.log(`   Adapter Type: ${data.run.adapterType}`);
        } else {
            console.log("ℹ️  Queue is empty. The server has no runs waiting for a remote runner.");
            console.log("   Check that your agents are set to an adapter type like 'cursor' or 'process'.");
        }
    })
    .catch((err) => {
        console.error(`❌ Connection Failed: ${err.message}`);
        console.error(`   Make sure your PAPERCLIP_SERVER_URL is reachable from this machine.`);
    });
