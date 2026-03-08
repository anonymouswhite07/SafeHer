import * as Location from 'expo-location';

// ─── Internal state ───────────────────────────────────────────────────────────
let _watchSubscription = null;   // active Location.watchPositionAsync subscription
let _lastKnownLocation = null;   // most recently received LocationObject
let _listeners = new Set();      // callbacks registered via startLocationTracking()

// ─── Permission helper ────────────────────────────────────────────────────────

/**
 * Request foreground location permission.
 * Returns true if granted, false otherwise.
 * @returns {Promise<boolean>}
 */
export async function requestLocationPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
}

/**
 * Check whether foreground location permission is already granted
 * without showing a system dialog.
 * @returns {Promise<boolean>}
 */
export async function hasLocationPermission() {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
}

// ─── One-shot fetch ───────────────────────────────────────────────────────────

/**
 * Get the device's current GPS position (one-shot, high accuracy).
 *
 * Returns an object with:
 *   latitude   {number}
 *   longitude  {number}
 *   accuracy   {number|null}  – metres
 *   altitude   {number|null}  – metres above sea level
 *   speed      {number|null}  – m/s
 *   heading    {number|null}  – degrees from true north
 *   timestamp  {number}       – Unix ms
 *   mapsLink   {string}       – Google Maps URL for the coordinate
 *
 * Throws if permission is denied or location is unavailable.
 *
 * @returns {Promise<LocationResult>}
 */
export async function getCurrentLocation() {
    const granted = await requestLocationPermission();
    if (!granted) {
        throw new Error('Location permission denied. Please enable it in Settings.');
    }

    const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
    });

    return _buildResult(loc);
}

// ─── Continuous tracking ──────────────────────────────────────────────────────

/**
 * Start continuous background location monitoring.
 *
 * @param {(location: LocationResult) => void} onUpdate  – called each time position changes
 * @param {(error: Error) => void}             onError   – called if an error occurs
 * @param {object} [options]
 * @param {number} [options.distanceInterval=10]  – min metres between updates
 * @param {number} [options.timeInterval=5000]    – min ms between updates (Android hint)
 * @returns {Promise<void>}
 */
export async function startLocationTracking(
    onUpdate,
    onError,
    options = {}
) {
    const granted = await requestLocationPermission();
    if (!granted) {
        const err = new Error('Location permission denied. Please enable it in Settings.');
        if (typeof onError === 'function') onError(err);
        return;
    }

    // Register the caller's callback
    if (typeof onUpdate === 'function') _listeners.add(onUpdate);

    // Already watching — no need to create a second subscription
    if (_watchSubscription !== null) return;

    const { distanceInterval = 10, timeInterval = 5000 } = options;

    try {
        _watchSubscription = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                distanceInterval,
                timeInterval,
            },
            (loc) => {
                const result = _buildResult(loc);
                _lastKnownLocation = result;
                // Notify all registered listeners
                _listeners.forEach((cb) => {
                    try { cb(result); } catch (_) { /* swallow listener errors */ }
                });
            }
        );
    } catch (err) {
        _watchSubscription = null;
        if (typeof onError === 'function') onError(err);
    }
}

/**
 * Stop continuous location monitoring and unregister a specific listener.
 * The underlying subscription is removed only when ALL listeners have unsubscribed.
 *
 * @param {Function} [listener] – the same callback passed to startLocationTracking().
 *                                Omit to forcefully stop everything.
 */
export function stopLocationTracking(listener) {
    if (typeof listener === 'function') {
        _listeners.delete(listener);
    } else {
        // No specific listener — clear all
        _listeners.clear();
    }

    // Stop the OS-level watcher only when no listeners remain
    if (_listeners.size === 0 && _watchSubscription !== null) {
        _watchSubscription.remove();
        _watchSubscription = null;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the most recently tracked location without making a new request.
 * Returns null if tracking has not started or no fix obtained yet.
 * @returns {LocationResult|null}
 */
export function getLastKnownLocation() {
    return _lastKnownLocation;
}

/**
 * Generate a Google Maps URL for a given lat/lng pair.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
export function buildMapsLink(latitude, longitude) {
    return `https://maps.google.com/?q=${latitude},${longitude}`;
}

/**
 * Build a human-readable address string from reverse geocoding.
 * Returns a best-effort string; never throws.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string>}
 */
export async function reverseGeocode(latitude, longitude) {
    try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (!results || results.length === 0) return 'Unknown location';
        const g = results[0];
        const parts = [g.streetNumber, g.street, g.city, g.region, g.country].filter(Boolean);
        return parts.join(', ') || 'Unknown location';
    } catch {
        return 'Unknown location';
    }
}

/**
 * Build a normalised LocationResult from a raw Expo LocationObject.
 * @param {import('expo-location').LocationObject} loc
 * @returns {LocationResult}
 */
function _buildResult(loc) {
    const { latitude, longitude, accuracy, altitude, speed, heading } = loc.coords;
    return {
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
        timestamp: loc.timestamp,
        mapsLink: buildMapsLink(latitude, longitude),
    };
}

/**
 * @typedef {Object} LocationResult
 * @property {number}      latitude
 * @property {number}      longitude
 * @property {number|null} accuracy
 * @property {number|null} altitude
 * @property {number|null} speed
 * @property {number|null} heading
 * @property {number}      timestamp
 * @property {string}      mapsLink
 */
