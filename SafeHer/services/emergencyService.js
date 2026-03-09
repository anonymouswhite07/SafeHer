/**
 * SafeHer — services/emergencyService.js
 *
 * Central emergency alert orchestrator.
 *
 * ALERT DELIVERY — dual-path system:
 * ┌─────────────────────────────────────────────────────┐
 * │  Internet available?                                │
 * │    YES → POST /send-bulk-alert to Twilio backend    │
 * │    NO  → expo-sms device SMS (no internet needed)   │
 * └─────────────────────────────────────────────────────┘
 *
 * Full workflow (triggerEmergency):
 *   1. Fetch live GPS coordinates           (locationService)
 *   2. Load guardian contacts from storage  (contactService)
 *   3. Start audio evidence recording       (evidenceService)
 *   4. Check internet connectivity          (networkService)
 *   5. Send SMS via Twilio OR device SMS    (online/offline)
 *   6. Schedule escalation timer            (internal)
 */

import { Platform } from 'react-native';
import * as SMS from 'expo-sms';

import { getCurrentLocation } from '@/services/locationService';
import { getContacts } from '@/services/contactService';
import { startAudioRecording, stopRecording as stopEvidenceSession } from '@/services/evidenceService';
import { isInternetAvailable } from '@/services/networkService';
import { startTracking, stopTracking, getTrackingLink } from '@/services/trackingService';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * ⚠️  Set this to your backend server's IP or domain.
 *
 * Local development:  http://192.168.x.x:3000   (your machine's LAN IP)
 * ngrok tunnel:       https://xxxx.ngrok.io
 * Production:         https://your-server.com
 *
 * Find your LAN IP on Windows: run `ipconfig` and look for IPv4 Address
 */
const BACKEND_URL = 'https://safeher-c7ad.onrender.com';

const ESCALATION_TIMEOUT_MS = 60_000;   // 60s before first escalation
const MAX_ESCALATIONS = 3;

// ─── Module state ─────────────────────────────────────────────────────────────

let _escalationTimer = null;
let _escalationCount = 0;
let _emergencyActive = false;
let _lastAlertResult = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full emergency workflow — call this from the SOS button or AI detection.
 *
 * @param {{ triggeredBy?: 'SOS_BUTTON'|'AI_DETECTION'|'SHAKE' }} [options]
 * @returns {Promise<EmergencyResult>}
 */
export async function triggerEmergency(options = {}) {
    if (_emergencyActive) {
        console.warn('[emergencyService] Emergency already active.');
        return _lastAlertResult;
    }

    _emergencyActive = true;
    _escalationCount = 0;
    const startedAt = Date.now();

    console.info('[emergencyService] ── EMERGENCY TRIGGERED ──');

    // ── Step 1: GPS ───────────────────────────────────────────────────────────
    let locationResult = null;
    let mapsLink = 'Location unavailable.';
    try {
        locationResult = await getCurrentLocation();
        mapsLink = locationResult.mapsLink;
        console.info('[emergencyService] GPS:', mapsLink);

        // ── Start live tracking session on the backend ─────────────────────
        try {
            const trackResult = await startTracking(locationResult.latitude, locationResult.longitude);
            if (trackResult.link) {
                mapsLink = trackResult.link;   // override static link with live tracking URL
                console.info('[emergencyService] 🔗 Live tracking:', trackResult.link);
            }
        } catch (trackErr) {
            console.warn('[emergencyService] Could not start tracking session:', trackErr.message);
            // mapsLink stays as the static Google Maps URL
        }
    } catch (err) {
        console.warn('[emergencyService] Location unavailable:', err.message);
    }

    // ── Step 2: Contacts ──────────────────────────────────────────────────────
    let contacts = [];
    try {
        contacts = await getContacts();
        console.info('[emergencyService] Contacts loaded:', contacts.length);
    } catch (err) {
        console.warn('[emergencyService] Could not load contacts:', err.message);
    }

    // ── Step 3: Evidence recording ────────────────────────────────────────────
    let recordingUri = null;
    try {
        const rec = await startAudioRecording();
        recordingUri = rec.uri;
        console.info('[emergencyService] Audio recording started.');
    } catch (err) {
        console.warn('[emergencyService] Could not start recording:', err.message);
    }

    // ── Step 4: Send alerts ───────────────────────────────────────────────────
    const alertResult = await sendEmergencyAlert({
        contacts,
        mapsLink,
        escalationLevel: 0,
        triggeredBy: options.triggeredBy ?? 'SOS_BUTTON',
    });

    // ── Step 5: Escalation timer ──────────────────────────────────────────────
    _scheduleEscalation(contacts, mapsLink);

    _lastAlertResult = {
        success: alertResult.success,
        contactsAlerted: alertResult.contactsAlerted,
        deliveryMethod: alertResult.deliveryMethod,
        mapsLink,
        location: locationResult,
        recordingUri,
        startedAt,
        escalationCount: 0,
    };

    return _lastAlertResult;
}

/**
 * Build and send the emergency alert to all guardian contacts.
 *
 * Tries Twilio backend first; falls back to device SMS if offline.
 *
 * @param {{ contacts, mapsLink, escalationLevel?, triggeredBy? }} params
 * @returns {Promise<AlertSendResult>}
 */
export async function sendEmergencyAlert({ contacts, mapsLink, escalationLevel = 0, triggeredBy = 'SOS_BUTTON' }) {
    const message = _buildAlertMessage(mapsLink, escalationLevel);

    console.info('[emergencyService] Alert message:\n', message);

    if (!contacts || contacts.length === 0) {
        console.warn('[emergencyService] No guardians — alert not sent.');
        return { success: false, contactsAlerted: [], contactsFailed: [], message, deliveryMethod: 'none' };
    }

    // ── Connectivity check ────────────────────────────────────────────────────
    const online = await isInternetAvailable();
    console.info(`[emergencyService] Delivery path: ${online ? 'TWILIO (online)' : 'DEVICE SMS (offline)'}`);

    if (online) {
        return _sendViaTwilioBackend(contacts, message);
    } else {
        return _sendViaDeviceSMS(contacts, message);
    }
}

/**
 * Start evidence audio recording (convenience re-export).
 */
export async function startEvidenceRecording() {
    return startAudioRecording();
}

/**
 * Resolve / cancel the active emergency.
 * Stops escalation timers and ends audio recording.
 */
export async function resolveEmergency() {
    _emergencyActive = false;
    _escalationCount = 0;

    if (_escalationTimer !== null) {
        clearTimeout(_escalationTimer);
        _escalationTimer = null;
    }

    // Stop live tracking updates
    stopTracking();

    const session = await stopEvidenceSession();
    console.info('[emergencyService] Emergency resolved. Audio URI:', session?.audioUri ?? 'none');
}

/** @returns {boolean} */
export function isEmergencyActive() { return _emergencyActive; }

/** @returns {EmergencyResult|null} */
export function getLastAlertResult() { return _lastAlertResult; }

// ─── Delivery: Twilio backend ─────────────────────────────────────────────────

/**
 * POST to the Node.js backend which calls the Twilio API.
 * Uses /send-bulk-alert to alert all contacts in one request.
 *
 * @param {Array}  contacts
 * @param {string} message
 * @returns {Promise<AlertSendResult>}
 */
async function _sendViaTwilioBackend(contacts, message) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(`${BACKEND_URL}/send-bulk-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts, message }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        const data = await response.json();

        if (data.success) {
            console.info('[emergencyService] ✅ Twilio alerts sent:', data.alerted);
            return {
                success: true,
                contactsAlerted: data.alerted ?? [],
                contactsFailed: data.failed ?? [],
                message,
                deliveryMethod: 'twilio',
            };
        } else {
            // Backend responded but reported failure — fall through to device SMS
            console.warn('[emergencyService] Backend reported failure — falling back to device SMS');
            return _sendViaDeviceSMS(contacts, message);
        }
    } catch (err) {
        // Network error or timeout — fall through to device SMS
        console.warn('[emergencyService] Backend unreachable —', err.message, '— falling back to device SMS');
        return _sendViaDeviceSMS(contacts, message);
    }
}

// ─── Delivery: Device SMS (offline fallback) ──────────────────────────────────

/**
 * Open the native SMS composer with all guardian phone numbers pre-filled.
 * Works without any internet connection.
 *
 * @param {Array}  contacts
 * @param {string} message
 * @returns {Promise<AlertSendResult>}
 */
async function _sendViaDeviceSMS(contacts, message) {
    const phones = contacts.map(c => c.phone).filter(Boolean);

    try {
        const isAvailable = await SMS.isAvailableAsync();

        if (!isAvailable) {
            console.warn('[emergencyService] Device SMS not available on this device/platform.');
            return {
                success: false,
                contactsAlerted: [],
                contactsFailed: contacts.map(c => c.name),
                message,
                deliveryMethod: 'none',
            };
        }

        const { result } = await SMS.sendSMSAsync(phones, message);

        const sent = result === 'sent' || result === 'unknown';
        console.info(`[emergencyService] Device SMS result: ${result}`);

        return {
            success: sent,
            contactsAlerted: sent ? contacts.map(c => c.name) : [],
            contactsFailed: sent ? [] : contacts.map(c => c.name),
            message,
            deliveryMethod: 'device-sms',
        };
    } catch (err) {
        console.error('[emergencyService] Device SMS error:', err.message);
        return {
            success: false,
            contactsAlerted: [],
            contactsFailed: contacts.map(c => c.name),
            message,
            deliveryMethod: 'none',
        };
    }
}

// ─── Message builder ──────────────────────────────────────────────────────────

function _buildAlertMessage(mapsLink, escalationLevel = 0) {
    if (escalationLevel === 0) {
        return (
            `🚨 Emergency Alert from SafeHer.\n` +
            `User may be in danger.\n\n` +
            `Live Location:\n${mapsLink}`
        );
    }
    return (
        `⚠️ ESCALATION ALERT (level ${escalationLevel}) — SafeHer\n` +
        `No response from user after ${escalationLevel} minute(s).\n` +
        `User may be in serious danger. Please act immediately.\n\n` +
        `Last known location:\n${mapsLink}`
    );
}

// ─── Escalation ───────────────────────────────────────────────────────────────

function _scheduleEscalation(contacts, mapsLink) {
    if (_escalationTimer !== null) clearTimeout(_escalationTimer);

    const delay = ESCALATION_TIMEOUT_MS * Math.pow(2, _escalationCount);

    _escalationTimer = setTimeout(async () => {
        if (!_emergencyActive) return;
        if (_escalationCount >= MAX_ESCALATIONS) {
            console.warn('[emergencyService] Max escalations reached.');
            return;
        }

        _escalationCount++;
        console.warn(`[emergencyService] ── ESCALATION ${_escalationCount} ──`);

        await sendEmergencyAlert({
            contacts,
            mapsLink,
            escalationLevel: _escalationCount,
            triggeredBy: 'ESCALATION',
        });

        _scheduleEscalation(contacts, mapsLink);
    }, delay);
}

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {{ triggeredBy?: 'SOS_BUTTON'|'AI_DETECTION'|'SHAKE' }} TriggerOptions
 * @typedef {{ contacts: Array, mapsLink: string, escalationLevel?: number, triggeredBy?: string }} AlertOptions
 * @typedef {{ success: boolean, contactsAlerted: string[], contactsFailed?: string[], message: string, deliveryMethod: 'twilio'|'device-sms'|'none' }} AlertSendResult
 * @typedef {{ success: boolean, contactsAlerted: string[], deliveryMethod: string, mapsLink: string, location: object|null, recordingUri: string|null, startedAt: number, escalationCount: number }} EmergencyResult
 */
