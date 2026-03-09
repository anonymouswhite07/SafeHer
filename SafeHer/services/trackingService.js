/**
 * SafeHer — services/trackingService.js
 *
 * Persistent live location tracking during emergencies.
 *
 * Strategy (two-layer approach):
 *   PRIMARY: Location.watchPositionAsync  — fires on every movement (event-driven)
 *            This is how real tracking apps work. No polling gaps.
 *   FALLBACK: 10-second heartbeat        — keeps backend alive when user is stationary
 *             Ensures the guardian page doesn't show stale data if user hasn't moved.
 *
 * Lifecycle:
 *   startTracking(lat, lng)  → creates backend session, begins watching
 *   stopTracking()           → removes watcher + clears heartbeat
 *   getTrackingLink()        → returns the guardian URL
 */

import * as Location from 'expo-location';

const BACKEND_URL = 'https://safeher-c7ad.onrender.com';
const HEARTBEAT_MS = 10_000;  // push at least every 10s even when stationary
const DISTANCE_METERS = 1;       // fire watcher on any movement ≥ 1 metre

// ── Module state ──────────────────────────────────────────────────────────────

let _trackingId = null;
let _trackingLink = null;
let _isActive = false;
let _watchSubscription = null;   // expo-location subscription object
let _heartbeatTimer = null;   // interval for stationary keep-alive
let _lastLat = null;
let _lastLng = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a backend session and begin live tracking.
 *
 * @param {number} lat   Initial latitude
 * @param {number} lng   Initial longitude
 * @returns {Promise<{ trackingId: string|null, link: string|null }>}
 */
export async function startTracking(lat, lng) {
    if (_isActive) {
        console.warn('[tracking] Already active — returning existing session.');
        return { trackingId: _trackingId, link: _trackingLink };
    }

    _lastLat = lat;
    _lastLng = lng;

    // ── Step 1: Register session on backend ────────────────────────────────
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

        console.info(`[tracking] ✅ Session: ${_trackingId}`);
        console.info(`[tracking] 🔗 ${_trackingLink}`);
    } catch (err) {
        console.warn('[tracking] Could not create backend session:', err.message);
        return { trackingId: null, link: null };
    }

    // ── Step 2: watchPositionAsync — primary event-driven updates ──────────
    try {
        _watchSubscription = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                distanceInterval: DISTANCE_METERS,   // fire on ≥ 1m movement
                timeInterval: 3000,              // also fire at least every 3s
            },
            (location) => {
                const { latitude, longitude } = location.coords;
                _lastLat = latitude;
                _lastLng = longitude;
                _pushUpdate(latitude, longitude);
            }
        );
        console.info('[tracking] watchPositionAsync started.');
    } catch (err) {
        console.warn('[tracking] watchPositionAsync failed, heartbeat-only mode:', err.message);
    }

    // ── Step 3: Heartbeat — keeps session alive when stationary ───────────
    _heartbeatTimer = setInterval(async () => {
        if (!_isActive || _lastLat === null) return;
        // Only push if watcher isn't firing (i.e. user is stationary)
        // Watcher already calls _pushUpdate, so this is just a keep-alive.
        await _pushUpdate(_lastLat, _lastLng);
    }, HEARTBEAT_MS);

    return { trackingId: _trackingId, link: _trackingLink };
}

/**
 * Stop all tracking — removes the location watcher and heartbeat timer.
 */
export function stopTracking() {
    _isActive = false;

    if (_watchSubscription) {
        _watchSubscription.remove();
        _watchSubscription = null;
        console.info('[tracking] Location watcher removed.');
    }

    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
        console.info('[tracking] Heartbeat cleared.');
    }

    _trackingId = null;
    _trackingLink = null;
    _lastLat = null;
    _lastLng = null;

    console.info('[tracking] Tracking stopped.');
}

/** @returns {string|null} */
export function getTrackingLink() { return _trackingLink; }

/** @returns {boolean} */
export function isTrackingActive() { return _isActive; }

// ── Internal ──────────────────────────────────────────────────────────────────

async function _pushUpdate(lat, lng) {
    if (!_trackingId) return;
    try {
        await fetch(`${BACKEND_URL}/update-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: _trackingId, lat, lng }),
        });
        console.info(`[tracking] 📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch (err) {
        console.warn('[tracking] Push failed:', err.message);
    }
}
