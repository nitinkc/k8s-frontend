const express = require('express');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

// Read the backend URL from an environment variable (defaults to Kubernetes service DNS)
const BACKEND_URL = process.env.BACKEND_URL || 'http://go-app-service:80';

app.get('/', (req, res) => {
    // Make an HTTP GET request to the Go backend service inside the cluster
    http.get(BACKEND_URL, (backendRes) => {
        let data = '';
        backendRes.on('data', (chunk) => { data += chunk; });
        backendRes.on('end', () => {
            res.send(`
                <html>
                    <head><title>K8s UI Test</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 40px; background: #f9f9f9;">
                        <div style="max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                            <h2 style="color: #333;">Frontend UI Dashboard</h2>
                            <p>Status: <span style="color: green; font-weight: bold;">Connected to Backend Successfully!</span></p>
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                            <h3>Response received from Go Backend:</h3>
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 5px; font-family: monospace;">
                                ${data}
                            </div>
                            <p style="color: #666; font-size: 12px; margin-top: 20px;">Target Backend URL: ${BACKEND_URL}</p>
                        </div>
                    </body>
                </html>
            `);
        });
    }).on('error', (err) => {
        res.send(`
            <html>
                <body style="font-family: Arial; padding: 40px;">
                    <h2>Frontend UI Dashboard</h2>
                    <p style="color: red; font-weight: bold;">Failed to connect to backend!</p>
                    <p><b>Error:</b> ${err.message}</p>
                    <p><b>Attempted URL:</b> ${BACKEND_URL}</p>
                </body>
            </html>
        `);
    });
});

app.listen(port, () => {
    console.log(`Frontend UI running on port ${port}`);
});