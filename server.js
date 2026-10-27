const express = require('express');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

// Read the backend URL from an environment variable (defaults to Kubernetes service DNS)
const BACKEND_URL = process.env.BACKEND_URL || 'http://go-backend-service:80';

// Each backend endpoint gets its own status card on the dashboard
const ENDPOINTS = [
    { name: 'Root Endpoint', path: '/', description: 'Main greeting from the Go app' },
    { name: 'Health Check', path: '/health', description: 'Kubernetes liveness/readiness probe' },
    { name: 'Redis Check', path: '/redis-check', description: 'PINGs redis-db-service:6379 via TCP' },
];

function checkEndpoint(path) {
    return new Promise((resolve) => {
        const start = Date.now();
        const req = http.get(BACKEND_URL + path, (backendRes) => {
            let data = '';
            backendRes.on('data', (chunk) => { data += chunk; });
            backendRes.on('end', () => {
                resolve({
                    ok: backendRes.statusCode >= 200 && backendRes.statusCode < 300,
                    statusCode: backendRes.statusCode,
                    latency: Date.now() - start,
                    body: data.trim(),
                });
            });
        });
        req.on('error', (err) => {
            resolve({ ok: false, statusCode: null, latency: Date.now() - start, body: err.message });
        });
        req.setTimeout(5000, () => {
            req.destroy(new Error('Request timed out after 5s'));
        });
    });
}

function postToBackend(path) {
    return new Promise((resolve) => {
        const req = http.request(BACKEND_URL + path, { method: 'POST' }, (backendRes) => {
            backendRes.resume(); // drain response
            backendRes.on('end', () => resolve(backendRes.statusCode));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => req.destroy(new Error('Request timed out after 5s')));
        req.end();
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderCard(endpoint, result) {
    const color = result.ok ? '#16a34a' : '#dc2626';
    const badge = result.ok ? 'UP' : 'DOWN';
    const statusText = result.statusCode ? `HTTP ${result.statusCode}` : 'No response';
    return `
        <div style="background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 20px; border-top: 4px solid ${color};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #333;">${endpoint.name}</h3>
                <span style="background: ${color}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${badge}</span>
            </div>
            <p style="color: #666; font-size: 13px; margin: 8px 0;">${endpoint.description}</p>
            <p style="font-family: monospace; font-size: 12px; color: #555; margin: 4px 0;">
                GET ${endpoint.path} &middot; ${statusText} &middot; ${result.latency}ms
            </p>
            <div style="background: #f1f5f9; padding: 12px; border-radius: 5px; font-family: monospace; font-size: 13px; word-break: break-all; margin-top: 10px;">
                ${escapeHtml(result.body) || '(empty response)'}
            </div>
        </div>`;
}

function renderLoginsCard(result) {
    let records = [];
    let parseError = null;
    if (result.ok) {
        try {
            records = JSON.parse(result.body) || [];
        } catch (e) {
            parseError = e.message;
        }
    }
    if (!Array.isArray(records)) records = [];

    const color = result.ok && !parseError ? '#16a34a' : '#dc2626';
    const badge = result.ok && !parseError ? `${records.length} RECORD${records.length === 1 ? '' : 'S'}` : 'ERROR';

    const rows = records.map((r) => `
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(r.timestamp || '')}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(r.pod_name || '')}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(r.pod_ip || '')}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(r.node_name || '')}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(r.client_addr || '')}</td>
        </tr>`).join('');

    const table = records.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="text-align: left; color: #64748b;">
                    <th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Timestamp</th>
                    <th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Pod</th>
                    <th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Pod IP</th>
                    <th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Node</th>
                    <th style="padding: 6px 10px; border-bottom: 2px solid #cbd5e1;">Client</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>` : `
        <div style="background: #f1f5f9; padding: 12px; border-radius: 5px; font-family: monospace; font-size: 13px; margin-top: 10px;">
            ${result.ok ? (parseError ? `Parse error: ${escapeHtml(parseError)}` : 'No login records yet — hit the button to create one.') : escapeHtml(result.body)}
        </div>`;

    return `
        <div style="background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 20px; border-top: 4px solid ${color};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #333;">Login Records (Redis Persistent Volume)</h3>
                <span style="background: ${color}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${badge}</span>
            </div>
            <p style="color: #666; font-size: 13px; margin: 8px 0;">
                Records written to the Redis <code>logins</code> list — survives pod restarts via the persistent volume.
            </p>
            <p style="font-family: monospace; font-size: 12px; color: #555; margin: 4px 0;">
                GET /logins &middot; ${result.statusCode ? `HTTP ${result.statusCode}` : 'No response'} &middot; ${result.latency}ms
            </p>
            <form method="POST" action="/login" style="margin-top: 10px;">
                <button type="submit" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 13px;">
                    Record Login (POST /login)
                </button>
            </form>
            ${table}
        </div>`;
}

// Button in the UI POSTs here; we proxy the POST to the Go backend and reload the dashboard
app.post('/login', async (req, res) => {
    await postToBackend('/login');
    res.redirect('/');
});

app.get('/', async (req, res) => {
    const results = await Promise.all([
        ...ENDPOINTS.map((e) => checkEndpoint(e.path)),
        checkEndpoint('/logins'),
    ]);
    const checks = results.slice(0, ENDPOINTS.length);
    const loginsResult = results[ENDPOINTS.length];
    const cards = ENDPOINTS.map((e, i) => renderCard(e, checks[i])).join('');
    const allUp = checks.every((r) => r.ok);

    res.send(`
        <html>
            <head>
                <title>K8s UI Test</title>
                <meta http-equiv="refresh" content="10">
            </head>
            <body style="font-family: Arial, sans-serif; padding: 40px; background: #f9f9f9;">
                <div style="max-width: 900px; margin: auto;">
                    <h2 style="color: #333;">Frontend UI Dashboard</h2>
                    <p>Backend connectivity:
                        <span style="color: ${allUp ? 'green' : 'red'}; font-weight: bold;">
                            ${allUp ? 'All endpoints reachable' : 'Some endpoints are down'}
                        </span>
                    </p>
                    <div style="display: grid; gap: 20px; margin-top: 20px;">
                        ${cards}
                        ${renderLoginsCard(loginsResult)}
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Target Backend URL: ${BACKEND_URL} &middot; auto-refreshes every 10s
                    </p>
                </div>
            </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`Frontend UI running on port ${port}`);
});
