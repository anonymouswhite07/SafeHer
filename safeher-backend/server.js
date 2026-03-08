/**
 * SafeHer — safeher-backend/server.js
 *
 * Node.js / Express backend that sends emergency SMS alerts via Twilio.
 *
 * Endpoints:
 *   POST /send-alert   { phone, message }  → sends SMS, returns { success, sid }
 *   GET  /health                           → returns { status: 'ok' }
 *
 * Run:
 *   node server.js
 *   (or: npm start)
 *
 * Environment (.env):
 *   TWILIO_ACCOUNT_SID   — your Twilio account SID
 *   TWILIO_AUTH_TOKEN    — your Twilio auth token
 *   TWILIO_PHONE_NUMBER  — your Twilio "from" number e.g. +15551234567
 *   PORT                 — optional, defaults to 3000
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error('[SafeHer Backend] Missing required environment variables:', missing.join(', '));
    console.error('  → Copy .env.example to .env and fill in your Twilio credentials.');
    process.exit(1);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const app = express();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Simple health-check for the mobile app to test connectivity before sending.
 */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /send-alert
 *
 * Body: { phone: string, message: string }
 *
 * Sends an SMS to `phone` from the configured Twilio number.
 * Returns: { success: true, sid: string }
 *       or: { success: false, error: string }
 */
app.post('/send-alert', async (req, res) => {
    const { phone, message } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
        return res.status(400).json({
            success: false,
            error: 'Invalid or missing "phone" field. Must be an E.164 number e.g. +15551234567',
        });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Missing "message" field.' });
    }

    // ── Send via Twilio ─────────────────────────────────────────────────────
    try {
        const smsResult = await client.messages.create({
            body: message.trim(),
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone.trim(),
        });

        console.log(`[SafeHer Backend] ✅ SMS sent to ${phone} — SID: ${smsResult.sid}`);
        return res.json({ success: true, sid: smsResult.sid });

    } catch (err) {
        console.error(`[SafeHer Backend] ❌ Twilio error for ${phone}:`, err.message);
        return res.status(502).json({
            success: false,
            error: err.message,
            code: err.code,
        });
    }
});

/**
 * POST /send-bulk-alert
 *
 * Convenience endpoint to alert multiple guardians in one call.
 * Body: { contacts: [{ name, phone }], message: string }
 */
app.post('/send-bulk-alert', async (req, res) => {
    const { contacts, message } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ success: false, error: 'contacts must be a non-empty array.' });
    }
    if (!message) {
        return res.status(400).json({ success: false, error: 'Missing message.' });
    }

    const results = await Promise.allSettled(
        contacts.map(c =>
            client.messages.create({
                body: message.trim(),
                from: process.env.TWILIO_PHONE_NUMBER,
                to: c.phone.trim(),
            })
        )
    );

    const alerted = [];
    const failed = [];

    results.forEach((r, i) => {
        const name = contacts[i].name ?? contacts[i].phone;
        if (r.status === 'fulfilled') {
            alerted.push(name);
            console.log(`[SafeHer Backend] ✅ Alerted ${name} — SID: ${r.value.sid}`);
        } else {
            failed.push(name);
            console.error(`[SafeHer Backend] ❌ Failed to alert ${name}:`, r.reason?.message);
        }
    });

    return res.json({
        success: alerted.length > 0,
        alerted,
        failed,
    });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log(`  ║  SafeHer Backend  →  port ${PORT}         ║`);
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');
    console.log('  POST /send-alert       → single SMS');
    console.log('  POST /send-bulk-alert  → multiple guardians');
    console.log('  GET  /health           → server health check');
    console.log('');
});
