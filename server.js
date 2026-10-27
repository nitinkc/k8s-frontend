const express = require('express');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

// Read the backend URL from an environment variable (defaults to Kubernetes service DNS)
const BACKEND_URL = process.env.BACKEND_URL || 'http://go-app-service:80';

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

app.get('/', async (req, res) => {
    const results = await Promise.all(ENDPOINTS.map((e) => checkEndpoint(e.path)));
    const cards = ENDPOINTS.map((e, i) => renderCard(e, results[i])).join('');
    const allUp = results.every((r) => r.ok);

    res.send(`
        <html>
            <head>
                <title>K8s UI Test</title>
                <meta http-equiv="refresh" content="10">
            </head>
            <body style="font-family: Arial, sans-serif; padding: 40px; background: #f9f9f9;">
                <div style="max-width: 700px; margin: auto;">
                    <h2 style="color: #333;">Frontend UI Dashboard</h2>
                    <p>Backend connectivity:
                        <span style="color: ${allUp ? 'green' : 'red'}; font-weight: bold;">
                            ${allUp ? 'All endpoints reachable' : 'Some endpoints are down'}
                        </span>
                    </p>
                    <div style="display: grid; gap: 20px; margin-top: 20px;">
                        ${cards}
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
