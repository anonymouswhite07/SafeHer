/**
 * SafeHer — safeher-backend/server.js
 *
 * Endpoints:
 *   GET  /health
 *   POST /send-alert                { phone, message }
 *   POST /send-bulk-alert           { contacts, message }
 *   POST /start-tracking            { lat, lng }
 *   POST /update-location           { id, lat, lng }
 *   GET  /location/:id
 *   GET  /track/:id                 ← Leaflet live-tracking page
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('[SafeHer] Missing env vars:', missing.join(', '));
  process.exit(1);
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://safeher-c7ad.onrender.com';

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large base64 uploads
app.use('/evidence', express.static(path.join(__dirname, 'evidence'))); // Expose evidence folder

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── In-memory tracking sessions ───────────────────────────────────────────────
// { [id]: { lat, lng, updatedAt, createdAt } }
const sessions = {};
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const now = Date.now();
  for (const id in sessions) {
    if (now - sessions[id].createdAt > SESSION_TTL_MS) {
      delete sessions[id];
      console.log('[tracking] Expired session removed:', id);
    }
  }
}, 30 * 60 * 1000);

function generateId(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return sessions[id] ? generateId(len) : id;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), activeSessions: Object.keys(sessions).length });
});

// POST /send-alert
app.post('/send-alert', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || phone.trim().length < 7)
    return res.status(400).json({ success: false, error: 'Invalid phone number.' });
  if (!message || !message.trim())
    return res.status(400).json({ success: false, error: 'Missing message.' });
  try {
    const sms = await client.messages.create({ body: message.trim(), from: process.env.TWILIO_PHONE_NUMBER, to: phone.trim() });
    console.log('[twilio] SMS sent to', phone, 'SID:', sms.sid);
    return res.json({ success: true, sid: sms.sid });
  } catch (err) {
    console.error('[twilio] Error:', err.message);
    return res.status(502).json({ success: false, error: err.message, code: err.code });
  }
});

// POST /send-bulk-alert
app.post('/send-bulk-alert', async (req, res) => {
  const { contacts, message } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0)
    return res.status(400).json({ success: false, error: 'contacts must be a non-empty array.' });
  if (!message)
    return res.status(400).json({ success: false, error: 'Missing message.' });

  const results = await Promise.allSettled(
    contacts.map(c => client.messages.create({ body: message.trim(), from: process.env.TWILIO_PHONE_NUMBER, to: c.phone.trim() }))
  );
  const alerted = [], failed = [];
  results.forEach((r, i) => {
    const name = contacts[i].name || contacts[i].phone;
    if (r.status === 'fulfilled') { alerted.push(name); console.log('[twilio] Alerted', name); }
    else { failed.push(name); console.error('[twilio] Failed', name, r.reason?.message); }
  });
  return res.json({ success: alerted.length > 0, alerted, failed });
});

// POST /start-tracking
app.post('/start-tracking', (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return res.status(400).json({ success: false, error: 'lat and lng must be numbers.' });

  const id = generateId();
  const now = Date.now();
  sessions[id] = { lat, lng, updatedAt: now, createdAt: now };
  const link = `${BASE_URL}/track/${id}`;
  console.log('[tracking] Session created:', id, '@', lat, lng);
  return res.json({ trackingId: id, link });
});

// POST /update-location
app.post('/update-location', (req, res) => {
  const { id, lat, lng } = req.body;
  if (!id || !sessions[id])
    return res.status(404).json({ success: false, error: 'Session not found.' });
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return res.status(400).json({ success: false, error: 'lat and lng must be numbers.' });

  sessions[id].lat = lat;
  sessions[id].lng = lng;
  sessions[id].updatedAt = Date.now();
  console.log('[tracking] Updated:', id, '->', lat, lng);
  return res.json({ success: true });
});

// GET /location/:id
app.get('/location/:id', (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
  return res.json({ lat: s.lat, lng: s.lng, updatedAt: s.updatedAt });
});

// POST /upload-evidence
app.post('/upload-evidence', (req, res) => {
  const { trackingId, type, file } = req.body;
  if (!trackingId || !type || !file) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Create session directory if it doesn't exist
  const dirPath = path.join(__dirname, 'evidence', trackingId);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const timestamp = Date.now();
  const extension = type === 'audio' ? 'm4a' : 'jpg';
  const filename = `${type}_${timestamp}.${extension}`;
  const filePath = path.join(dirPath, filename);

  try {
    // file is base64 depending on what we pass. 
    // We'll assume the mobile app sends it as a raw base64 string without data URI prefix
    const base64Data = file.replace(/^data:([\\w\\/\\-]+);base64,/, '');
    fs.writeFileSync(filePath, base64Data, 'base64');
    console.log(`[evidence] Uploaded: ${filename} for session ${trackingId}`);
    return res.json({ success: true, url: `/evidence/${trackingId}/${filename}` });
  } catch (err) {
    console.error('[evidence] Failed to save file:', err);
    return res.status(500).json({ success: false, error: 'Failed to save file' });
  }
});

// GET /evidence/:id
app.get('/evidence/:id', (req, res) => {
  const trackingId = req.params.id;
  const dirPath = path.join(__dirname, 'evidence', trackingId);

  if (!fs.existsSync(dirPath)) {
    return res.json({ photos: [], audio: [] });
  }

  try {
    const files = fs.readdirSync(dirPath);
    const photos = [];
    const audio = [];

    files.forEach(file => {
      const url = `/evidence/${trackingId}/${file}`;
      if (file.endsWith('.jpg')) {
        photos.push(url);
      } else if (file.endsWith('.m4a')) {
        audio.push(url);
      }
    });

    // Sort descending so newest is first
    photos.sort().reverse();
    audio.sort().reverse();

    return res.json({ photos, audio });
  } catch (err) {
    console.error('[evidence] Error reading directory:', err);
    return res.status(500).json({ error: 'Failed to read evidence' });
  }
});

// GET /track/:id  — Leaflet live-tracking page for guardians
app.get('/track/:id', (req, res) => {
  const id = req.params.id;
  const s = sessions[id];

  if (!s) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SafeHer - Session Not Found</title>
  <style>
    body{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#fff;
         display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}
    h1{color:#E8547A;font-size:22px;margin-bottom:10px}
    p{color:rgba(255,255,255,.5);font-size:14px}
  </style>
</head>
<body>
  <div><h1>&#128737; SafeHer</h1><p>This tracking session has expired or does not exist.</p></div>
</body>
</html>`);
  }

  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SafeHer - Live Tracking</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f1a;color:#fff;height:100vh;display:flex;flex-direction:column}
    .topbar{background:rgba(15,15,26,.96);border-bottom:1px solid rgba(255,255,255,.08);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;z-index:1000}
    .logo{font-size:18px;font-weight:900;color:#E8547A;letter-spacing:-.3px}
    .logo span{color:#fff}
    .live-badge{display:flex;align-items:center;gap:6px;background:rgba(232,84,122,.15);border:1px solid rgba(232,84,122,.4);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;color:#E8547A}
    .dot{width:8px;height:8px;border-radius:50%;background:#E8547A;animation:blink 1s infinite}
    @keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.4)}}
    #map{flex:1;width:100%;min-height:0}
    .panel{background:rgba(15,15,26,.97);border-top:1px solid rgba(255,255,255,.08);padding:14px 16px;flex-shrink:0}
    .coords{display:flex;gap:10px;margin-bottom:10px}
    .cbox{flex:1;background:rgba(255,255,255,.05);border-radius:10px;padding:10px;text-align:center}
    .clabel{font-size:9px;font-weight:800;letter-spacing:1px;color:rgba(255,255,255,.35);text-transform:uppercase}
    .cval{font-size:15px;font-weight:700;color:#E8547A;margin-top:3px;font-variant-numeric:tabular-nums}
    .ts{font-size:11px;color:rgba(255,255,255,.3);text-align:center;margin-bottom:10px}
    .btn{display:block;width:100%;padding:14px;background:#E8547A;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center;transition:opacity .2s}
    .btn:hover{opacity:.85}
    .safeher-marker{width:36px;height:36px;background:#E8547A;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(232,84,122,.3),0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px;animation:mpulse 2s infinite}
    @keyframes mpulse{0%,100%{box-shadow:0 0 0 4px rgba(232,84,122,.3),0 4px 12px rgba(0,0,0,.4)}50%{box-shadow:0 0 0 12px rgba(232,84,122,.08),0 4px 12px rgba(0,0,0,.4)}}
    
    .evidence-panel{background:rgba(15,15,26,.97);border-top:1px solid rgba(255,255,255,.08);padding:14px 16px;flex-shrink:0}
    .etitle{font-size:14px;font-weight:800;color:#fff;margin-bottom:12px;display:flex;align-items:center;gap:6px}
    .gallery{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px}
    .gallery img{width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.1)}
    .av-list{display:flex;flex-direction:column;gap:10px}
    .av-list audio{height:36px;width:100%; border-radius: 8px}
    .no-data{font-size:12px;color:rgba(255,255,255,.4)}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">Safe<span>Her</span> &#128737;</div>
    <div class="live-badge"><div class="dot"></div>LIVE</div>
  </div>
  <div id="map"></div>
  <div class="panel">
    <div class="coords">
      <div class="cbox"><div class="clabel">Latitude</div><div class="cval" id="dLat">-</div></div>
      <div class="cbox"><div class="clabel">Longitude</div><div class="cval" id="dLng">-</div></div>
    </div>
    <div class="ts" id="ts">Connecting...</div>
    <a id="gmaps" class="btn" href="#" target="_blank" rel="noopener">&#128205; Open in Google Maps</a>
  </div>
  
  <div class="evidence-panel">
    <div class="etitle">&#128248; Live Evidence</div>
    <div class="gallery" id="pgal"><div class="no-data">Waiting for photos...</div></div>
    <div class="av-list" id="agal" style="margin-top:10px"></div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var ID  = '${id}';
    var LAT = ${s.lat};
    var LNG = ${s.lng};
    var UPD = ${s.updatedAt};

    var map = L.map('map', { animate: true }).setView([LAT, LNG], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    var icon = L.divIcon({ html: '<div class="safeher-marker">&#128737;</div>', className: '', iconSize: [36,36], iconAnchor: [18,18] });
    var marker = L.marker([LAT, LNG], { icon: icon }).addTo(map)
      .bindPopup('<b>SafeHer User</b><br>Location updating live...', { closeButton: false })
      .openPopup();
    var ring = L.circle([LAT, LNG], { radius: 30, color: '#E8547A', fillColor: '#E8547A', fillOpacity: 0.12, weight: 2 }).addTo(map);

    function ago(ts) {
      var s = Math.round((Date.now() - ts) / 1000);
      if (s < 5)  return 'just now';
      if (s < 60) return s + 's ago';
      return Math.round(s / 60) + 'm ago';
    }

    function render(lat, lng, ts) {
      document.getElementById('dLat').textContent = lat.toFixed(6);
      document.getElementById('dLng').textContent = lng.toFixed(6);
      document.getElementById('ts').textContent   = 'Last updated: ' + ago(ts);
      document.getElementById('gmaps').href       = 'https://maps.google.com/?q=' + lat + ',' + lng;
      marker.setLatLng([lat, lng]);
      ring.setLatLng([lat, lng]);
      map.panTo([lat, lng], { animate: true, duration: 0.8 });
    }

    render(LAT, LNG, UPD);

    async function pollLocation() {
      try {
        var r    = await fetch('/location/' + ID);
        if (!r.ok) return;
        var data = await r.json();
        render(data.lat, data.lng, data.updatedAt);
      } catch (e) {
        document.getElementById('ts').textContent = 'Reconnecting...';
      }
    }

    async function pollEvidence() {
      try {
        var r = await fetch('/evidence/' + ID);
        if (!r.ok) return;
        var data = await r.json();
        
        var pgal = document.getElementById('pgal');
        if (data.photos && data.photos.length > 0) {
          pgal.innerHTML = data.photos.map(u => '<a href="' + u + '" target="_blank"><img src="' + u + '" /></a>').join('');
        }
        
        var agal = document.getElementById('agal');
        if (data.audio && data.audio.length > 0) {
          agal.innerHTML = data.audio.map(u => '<audio controls src="' + u + '"></audio>').join('');
        }
      } catch (e) {}
    }

    setInterval(pollLocation, 3000);
    setInterval(pollEvidence, 5000);
    pollEvidence();
  </script>
</body>
</html>`);
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Start
app.listen(PORT, () => {
  console.log('');
  console.log('  SafeHer Backend  port ' + PORT);
  console.log('  POST /send-alert        single SMS');
  console.log('  POST /send-bulk-alert   bulk SMS');
  console.log('  POST /start-tracking    create session');
  console.log('  POST /update-location   push GPS update');
  console.log('  GET  /location/:id      current coords JSON');
  console.log('  GET  /track/:id         Leaflet live map page');
  console.log('  GET  /health            health check');
  console.log('');
});
