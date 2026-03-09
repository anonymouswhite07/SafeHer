/**
 * SafeHer — safeher-backend/server.js
 *
 * Endpoints:
 *   GET  /health                              → server health
 *   POST /send-alert                          → Twilio SMS (single)
 *   POST /send-bulk-alert                     → Twilio SMS (multiple)
 *   POST /start-tracking  { lat, lng }        → create tracking session
 *   POST /update-location { id, lat, lng }    → push location update
 *   GET  /location/:id                        → fetch current location JSON
 *   GET  /track/:id                           → live tracking HTML page for guardians
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

// ─── Env validation ───────────────────────────────────────────────────────────

const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error('[SafeHer] Missing env vars:', missing.join(', '));
    process.exit(1);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const app = express();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://safeher-c7ad.onrender.com`;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ─── In-memory tracking store ─────────────────────────────────────────────────
// Structure: { [id]: { lat, lng, updatedAt, createdAt } }
// Sessions expire after 2 hours automatically.

const sessions = {};
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Garbage collect stale sessions every 30 minutes
setInterval(() => {
    const now = Date.now();
    let removed = 0;
    for (const id in sessions) {
        if (now - sessions[id].createdAt > SESSION_TTL_MS) {
            delete sessions[id];
            removed++;
        }
    }
    if (removed > 0) console.log(`[tracking] Removed ${removed} expired session(s).`);
}, 30 * 60 * 1000);

// ─── ID generator ─────────────────────────────────────────────────────────────

function generateId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < length; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    return sessions[id] ? generateId(length) : id;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeSessions: Object.keys(sessions).length,
    });
});

// ── Twilio: single SMS ────────────────────────────────────────────────────────

app.post('/send-alert', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
        return res.status(400).json({ success: false, error: 'Invalid phone number.' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Missing message.' });
    }

    try {
        const sms = await client.messages.create({
            body: message.trim(),
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone.trim(),
        });
        console.log(`[twilio] ✅ SMS → ${phone} SID: ${sms.sid}`);
        return res.json({ success: true, sid: sms.sid });
    } catch (err) {
        console.error(`[twilio] ❌ ${phone}:`, err.message);
        return res.status(502).json({ success: false, error: err.message, code: err.code });
    }
});

// ── Twilio: bulk SMS ──────────────────────────────────────────────────────────

app.post('/send-bulk-alert', async (req, res) => {
    const { contacts, message } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ success: false, error: 'contacts must be a non-empty array.' });
    }
    if (!message) {
        return res.status(400).json({ success: false, error: 'Missing message.' });
    }

    const results = await Promise.allSettled(
        contacts.map(c => client.messages.create({
            body: message.trim(),
            from: process.env.TWILIO_PHONE_NUMBER,
            to: c.phone.trim(),
        }))
    );

    const alerted = [];
    const failed = [];

    results.forEach((r, i) => {
        const name = contacts[i].name ?? contacts[i].phone;
        if (r.status === 'fulfilled') {
            alerted.push(name);
            console.log(`[twilio] ✅ Alerted ${name} SID: ${r.value.sid}`);
        } else {
            failed.push(name);
            console.error(`[twilio] ❌ Failed ${name}:`, r.reason?.message);
        }
    });

    return res.json({ success: alerted.length > 0, alerted, failed });
});

// ── Tracking: start session ───────────────────────────────────────────────────

/**
 * POST /start-tracking
 * Body: { lat: number, lng: number }
 * Returns: { trackingId, link }
 */
app.post('/start-tracking', (req, res) => {
    const { lat, lng } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ success: false, error: 'lat and lng must be numbers.' });
    }

    const id = generateId();
    const now = Date.now();

    sessions[id] = { lat, lng, updatedAt: now, createdAt: now };

    const link = `${BASE_URL}/track/${id}`;
    console.log(`[tracking] ✅ Session created: ${id} @ ${lat},${lng}`);

    return res.json({ trackingId: id, link });
});

// ── Tracking: update location ─────────────────────────────────────────────────

/**
 * POST /update-location
 * Body: { id: string, lat: number, lng: number }
 * Returns: { success: true }
 */
app.post('/update-location', (req, res) => {
    const { id, lat, lng } = req.body;

    if (!id || !sessions[id]) {
        return res.status(404).json({ success: false, error: 'Tracking session not found.' });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ success: false, error: 'lat and lng must be numbers.' });
    }

    sessions[id].lat = lat;
    sessions[id].lng = lng;
    sessions[id].updatedAt = Date.now();

    console.log(`[tracking] 📍 Updated: ${id} → ${lat},${lng}`);
    return res.json({ success: true });
});

// ── Tracking: get location JSON ───────────────────────────────────────────────

/**
 * GET /location/:id
 * Returns: { lat, lng, updatedAt }
 */
app.get('/location/:id', (req, res) => {
    const session = sessions[req.params.id];

    if (!session) {
        return res.status(404).json({ error: 'Session not found or expired.' });
    }

    return res.json({
        lat: session.lat,
        lng: session.lng,
        updatedAt: session.updatedAt,
    });
});

// ── Tracking: guardian live-tracking HTML page ────────────────────────────────

/**
 * GET /track/:id
 * Returns a full HTML page that auto-refreshes location every 5 seconds.
 * Guardian clicks "Open in Google Maps" for turn-by-turn navigation.
 */
app.get('/track/:id', (req, res) => {
    const id = req.params.id;
    const session = sessions[id];

    if (!session) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>SafeHer — Session Not Found</title>
                <style>
                    body { font-family: -apple-system, sans-serif; background: #0f0f1a;
                           color: #fff; display: flex; align-items: center;
                           justify-content: center; height: 100vh; margin: 0; }
                    .card { text-align: center; padding: 40px; }
                    h1 { font-size: 24px; color: #E8547A; }
                    p  { color: rgba(255,255,255,0.6); }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>🛡 SafeHer</h1>
                    <p>This tracking session has expired or does not exist.</p>
                </div>
            </body>
            </html>
        `);
    }

    return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>SafeHer — Live Tracking</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: #0f0f1a;
                    color: #fff;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 24px 16px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 28px;
                }
                .logo {
                    font-size: 28px;
                    font-weight: 900;
                    color: #E8547A;
                    letter-spacing: -0.5px;
                }
                .logo span { color: #fff; }
                .subtitle {
                    font-size: 13px;
                    color: rgba(255,255,255,0.5);
                    margin-top: 4px;
                }
                .card {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 24px;
                    width: 100%;
                    max-width: 420px;
                    margin-bottom: 16px;
                }
                .status-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 20px;
                }
                .pulse {
                    width: 10px; height: 10px; border-radius: 50%;
                    background: #E8547A;
                    animation: pulse 1.2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(1.3); }
                }
                .status-text { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.8); }
                .coord-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .coord-box {
                    background: rgba(255,255,255,0.05);
                    border-radius: 12px;
                    padding: 12px;
                    text-align: center;
                }
                .coord-label { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
                .coord-value { font-size: 16px; font-weight: 700; margin-top: 4px; color: #E8547A; }
                .updated {
                    font-size: 11px;
                    color: rgba(255,255,255,0.35);
                    text-align: center;
                    margin-bottom: 20px;
                }
                .maps-btn {
                    display: block;
                    width: 100%;
                    padding: 16px;
                    background: #E8547A;
                    color: #fff;
                    border: none;
                    border-radius: 14px;
                    font-size: 16px;
                    font-weight: 800;
                    cursor: pointer;
                    text-decoration: none;
                    text-align: center;
                    transition: opacity 0.2s;
                }
                .maps-btn:hover { opacity: 0.85; }
                .error-banner {
                    background: rgba(255,68,68,0.15);
                    border: 1px solid rgba(255,68,68,0.3);
                    border-radius: 12px;
                    padding: 12px 14px;
                    font-size: 12px;
                    color: #ff6b6b;
                    margin-top: 12px;
                    display: none;
                }
                .refresh-note {
                    font-size: 11px;
                    color: rgba(255,255,255,0.25);
                    text-align: center;
                    margin-top: 16px;
                }
                .session-id {
                    font-size: 11px;
                    color: rgba(255,255,255,0.2);
                    text-align: center;
                    margin-top: 8px;
                    font-family: monospace;
                }
                iframe {
                    width: 100%;
                    max-width: 420px;
                    height: 220px;
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.08);
                    margin-bottom: 16px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">Safe<span>Her</span> 🛡</div>
                <div class="subtitle">Live Emergency Tracking — Session ${id}</div>
            </div>

            <div class="card">
                <div class="status-row">
                    <div class="pulse" id="pulse"></div>
                    <div class="status-text" id="statusText">Connecting…</div>
                </div>

                <div class="coord-grid">
                    <div class="coord-box">
                        <div class="coord-label">LATITUDE</div>
                        <div class="coord-value" id="lat">—</div>
                    </div>
                    <div class="coord-box">
                        <div class="coord-label">LONGITUDE</div>
                        <div class="coord-value" id="lng">—</div>
                    </div>
                </div>

                <div class="updated" id="updated">Last updated: —</div>

                <a id="mapsBtn" class="maps-btn" href="#" target="_blank">
                    📍 Open in Google Maps
                </a>

                <div class="error-banner" id="errorBanner">
                    ⚠ Location update failed. Retrying…
                </div>
            </div>

            <iframe id="mapFrame" src="" frameborder="0" allowfullscreen></iframe>

            <div class="refresh-note">Updates every 5 seconds automatically</div>
            <div class="session-id">Session ID: ${id}</div>

            <script>
                const SESSION_ID  = '${id}';
                const API_BASE    = '${BASE_URL}';
                let firstLoad     = true;

                function timeSince(ts) {
                    const s = Math.round((Date.now() - ts) / 1000);
                    if (s < 5)  return 'just now';
                    if (s < 60) return s + 's ago';
                    return Math.round(s / 60) + 'm ago';
                }

                async function fetchLocation() {
                    try {
                        const res  = await fetch(API_BASE + '/location/' + SESSION_ID);
                        if (!res.ok) throw new Error('Session not found');
                        const data = await res.json();

                        const lat = data.lat.toFixed(6);
                        const lng = data.lng.toFixed(6);
                        const mapsUrl = 'https://maps.google.com/?q=' + data.lat + ',' + data.lng;
                        const embedUrl = 'https://maps.google.com/maps?q=' + data.lat + ',' + data.lng + '&output=embed&z=16';

                        document.getElementById('lat').textContent    = lat;
                        document.getElementById('lng').textContent    = lng;
                        document.getElementById('updated').textContent = 'Last updated: ' + timeSince(data.updatedAt);
                        document.getElementById('mapsBtn').href       = mapsUrl;
                        document.getElementById('statusText').textContent = '🔴 LIVE — Location active';
                        document.getElementById('errorBanner').style.display = 'none';

                        if (firstLoad) {
                            document.getElementById('mapFrame').src = embedUrl;
                            firstLoad = false;
                        }
                    } catch (err) {
                        document.getElementById('statusText').textContent = 'Reconnecting…';
                        document.getElementById('errorBanner').style.display = 'block';
                        console.warn('[SafeHer tracking]', err.message);
                    }
                }

                // Initial fetch + 5-second polling
                fetchLocation();
                setInterval(fetchLocation, 5000);
            </script>
        </body>
        </html>
    `);
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log(`  ║  SafeHer Backend  →  port ${PORT}            ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
    console.log('  POST /send-alert       → single Twilio SMS');
    console.log('  POST /send-bulk-alert  → multiple guardians');
    console.log('  POST /start-tracking   → create tracking session');
    console.log('  POST /update-location  → push location update');
    console.log('  GET  /location/:id     → current location JSON');
    console.log('  GET  /track/:id        → guardian live-tracking page');
    console.log('  GET  /health           → health check');
    console.log('');
});
