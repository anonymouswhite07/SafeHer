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
import * as TaskManager from 'expo-task-manager';

const BACKEND_URL = 'https://safeher-c7ad.onrender.com';
const LOCATION_TASK = 'safeher-location-task';

TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
    if (error) {
        console.error('[tracking] Background TaskManager error:', error.message);
        return;
    }
    if (data) {
        const { locations } = data;
        if (locations && locations.length > 0) {
            const location = locations[0];
            const { latitude, longitude } = location.coords;

            // Internally track states natively without relying on module closure
            _pushUpdate(latitude, longitude);
        }
    }
});
const HEARTBEAT_MS = 10_000;  // push at least every 10s even when stationary
const LOW_BATTERY_HEARTBEAT_MS = 30_000; // extend heartbeat to 30s
const DISTANCE_METERS = 1;       // fire watcher on any movement ≥ 1 metre
const LOW_BATTERY_DISTANCE = 10; // fire only on ≥ 10 metre movement

// ── Module state ──────────────────────────────────────────────────────────────

let _trackingId = null;
let _trackingLink = null;
let _isActive = false;
let _watchSubscription = null;   // expo-location subscription object
let _heartbeatTimer = null;   // interval for stationary keep-alive
let _lastLat = null;
let _lastLng = null;
let _isLowBattery = false;

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
    await _startLocationWatcher();

    // ── Step 3: Heartbeat — keeps session alive when stationary ───────────
    _startHeartbeat();

    return { trackingId: _trackingId, link: _trackingLink };
}

async function _startLocationWatcher() {
    try {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

        if (fgStatus !== 'granted' || bgStatus !== 'granted') {
            console.warn('[tracking] Critical OS Location permissions denied.');
            return;
        }

        // Native Android OS Task Delegation for offline/locked screen polling
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
            accuracy: _isLowBattery ? Location.Accuracy.Balanced : Location.Accuracy.BestForNavigation,
            timeInterval: _isLowBattery ? 30000 : 3000,
            distanceInterval: _isLowBattery ? LOW_BATTERY_DISTANCE : DISTANCE_METERS,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
                notificationTitle: "SafeHer Protection Active",
                notificationBody: "Monitoring safety sensors and tracking location securely.",
                notificationColor: "#FF0000"
            }
        });
        console.info('[tracking] Background TaskManager watcher bounded');
    } catch (err) {
        console.warn('[tracking] TaskManager bound failed, heartbeat-only mode:', err.message);
    }
}

function _startHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(async () => {
        if (!_isActive || _lastLat === null) return;
        await _pushUpdate(_lastLat, _lastLng);
    }, _isLowBattery ? LOW_BATTERY_HEARTBEAT_MS : HEARTBEAT_MS);
}



/**
 * Stop all tracking — removes the location watcher and heartbeat timer.
 */
export function stopTracking() {
    _isActive = false;

    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).then((started) => {
        if (started) {
            Location.stopLocationUpdatesAsync(LOCATION_TASK);
            console.info('[tracking] TaskManager Location unwired.');
        }
    });

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

/** @returns {string|null} */
export function getTrackingId() { return _trackingId; }

/** @returns {boolean} */
export function isTrackingActive() { return _isActive; }

/**
 * Configure tracking parameters based on battery level.
 * Called by batteryService.
 */
export async function setLowBatteryTracking(isLow) {
    if (_isLowBattery === isLow) return;
    _isLowBattery = isLow;
    if (_isActive) {
        console.info(`[tracking] Restarting watcher: Low Battery = ${isLow}`);
        await _startLocationWatcher();
        _startHeartbeat();
    }
}

/**
 * Perform a final push with the specific battery_critical status before death.
 */
export async function transmitFinalLocation() {
    if (!_isActive || _lastLat === null) return;
    console.info('[tracking] Transmitting final location heartbeat...');
    await _pushUpdate(_lastLat, _lastLng, 'battery_critical');
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _pushUpdate(lat, lng, status = null) {
    if (!_trackingId) return;

    _lastLat = lat;
    _lastLng = lng;

    try {
        const payload = { id: _trackingId, lat, lng };
        if (status) payload.status = status;

        await fetch(`${BACKEND_URL}/update-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        console.info(`[tracking] 📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch (err) {
        console.warn('[tracking] Push failed:', err.message);
    }
}
