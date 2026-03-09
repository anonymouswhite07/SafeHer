/**
 * SafeHer — services/trackingService.js
 *
 * Manages the live location tracking session during an emergency.
 *
 * Flow:
 *   startTracking(lat, lng)        → creates backend session, returns link
 *   _pushLocationLoop()            → sends GPS updates every 5 seconds
 *   stopTracking()                 → clears the update interval
 *   getTrackingLink()              → returns the current guardian link (or null)
 *
 * The backend stores locations in-memory and serves a live HTML page
 * at https://safeher-c7ad.onrender.com/track/<id> for guardians.
 */

import { getCurrentLocation } from '@/services/locationService';

const BACKEND_URL = 'https://safeher-c7ad.onrender.com';
const UPDATE_INTERVAL = 3000;   // push new GPS every 3 seconds

// ─── Module state ─────────────────────────────────────────────────────────────

let _trackingId = null;
let _trackingLink = null;
let _intervalId = null;
let _isActive = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a tracking session on the backend and begin sending location updates.
 *
 * @param {number} lat   Initial latitude
 * @param {number} lng   Initial longitude
 * @returns {Promise<{ trackingId: string, link: string }>}
 */
export async function startTracking(lat, lng) {
    if (_isActive) {
        console.warn('[tracking] Already active — returning existing link.');
        return { trackingId: _trackingId, link: _trackingLink };
    }

    try {
        const res = await fetch(`${BACKEND_URL}/start-tracking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng }),
        });

        if (!res.ok) throw new Error(`Server responded ${res.status}`);

        const data = await res.json();
        _trackingId = data.trackingId;
        _trackingLink = data.link;
        _isActive = true;

        console.info(`[tracking] ✅ Session created: ${_trackingId}`);
        console.info(`[tracking] 🔗 Link: ${_trackingLink}`);

        // Begin continuous updates
        _startLocationLoop();

        return { trackingId: _trackingId, link: _trackingLink };
    } catch (err) {
        console.warn('[tracking] Could not start session:', err.message);
        return { trackingId: null, link: null };
    }
}

/**
 * Stop sending location updates and clear the session.
 */
export function stopTracking() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
    _isActive = false;
    _trackingId = null;
    _trackingLink = null;
    console.info('[tracking] Tracking stopped.');
}

/**
 * Return the active tracking link (for embedding in SMS).
 * @returns {string|null}
 */
export function getTrackingLink() {
    return _trackingLink;
}

/**
 * @returns {boolean}
 */
export function isTrackingActive() {
    return _isActive;
}

// ─── Internal: location polling loop ─────────────────────────────────────────

function _startLocationLoop() {
    if (_intervalId) clearInterval(_intervalId);

    _intervalId = setInterval(async () => {
        if (!_isActive || !_trackingId) {
            clearInterval(_intervalId);
            return;
        }

        try {
            const loc = await getCurrentLocation();
            await _pushUpdate(loc.latitude, loc.longitude);
        } catch (err) {
            console.warn('[tracking] Location poll failed:', err.message);
        }
    }, UPDATE_INTERVAL);
}

async function _pushUpdate(lat, lng) {
    try {
        const res = await fetch(`${BACKEND_URL}/update-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: _trackingId, lat, lng }),
        });
        if (res.ok) {
            console.info(`[tracking] 📍 Location updated: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
    } catch (err) {
        console.warn('[tracking] Update push failed:', err.message);
    }
}
