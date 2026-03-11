/**
 * SafeHer — sensorService.js
 *
 * Continuous accelerometer-based motion monitoring.
 * Detects abnormal movement patterns (shake, impact, rapid motion)
 * and emits structured MotionEvent objects for the AI threat detection module.
 *
 * Usage:
 *   const { stop } = await startMotionMonitoring(onEvent, onError);
 *   // … later …
 *   stop();
 */

import { Accelerometer } from 'expo-sensors';
import { analyzeMotion } from '@/ai/threatDetection';

// ─── Tuneable constants ────────────────────────────────────────────────────────

/** Accelerometer update interval (ms). Lower = faster but higher power use. */
const UPDATE_INTERVAL_MS = 100;

/**
 * Magnitude thresholds (m/s² equivalents; expo-sensors returns G-force values
 * already scaled, so 1.0 ≈ 9.8 m/s²).
 *
 * Earth gravity baseline ≈ 1.0 G (device at rest shows ~1 G).
 * We subtract 1.0 from the raw magnitude to get the "excess" movement.
 */
const THRESHOLDS = {
    SHAKE: 4.5,   // violent shaking  — very rapid back-and-forth  (≥ ~45 m/s² net)
    IMPACT: 5.0,   // sudden hard impact — device hits something hard (≥ ~50 m/s² net)
    RAPID: 2.5,   // rapid movement   — fast repositioning           (≥ ~25 m/s² net)
    CALM: 0.15,  // below this → device is essentially still
};

let _shakeCount = 0;
let _shakeTimer = null;

/**
 * A short-term rolling window of raw magnitudes used for the shake detector.
 * Shake = many direction-reversals within the window, not just single high peak.
 */
const SHAKE_WINDOW_SIZE = 8;     // samples
const SHAKE_REVERSAL_MIN = 4;    // minimum direction-reversals in the window

/** Cooldown between emitting events of the same type (ms) to avoid spam. */
const EVENT_COOLDOWN_MS = 800;

// ─── Internal state ───────────────────────────────────────────────────────────
let _subscription = null;
let _isMonitoring = false;

// Rolling sample window for shake analysis
const _window = [];
let _lastMagnitude = 1.0;
let _lastEventAt = {};   // { [eventType]: timestamp }

// Exported snapshot of the latest reading (for UI and AI module polling)
let _latestReading = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start continuous accelerometer monitoring.
 *
 * @param {(event: MotionEvent) => void} onEvent
 *   Called every time a threat is detected.
 *
 * @param {(error: Error) => void}       [onError]
 *   Called on subscription errors.
 *
 * @param {MonitoringOptions}            [options]
 *   Override thresholds or update interval.
 *
 * @returns {{ stop: () => void, isActive: () => boolean }}
 */
export async function startMotionMonitoring(onEvent, onError, options = {}) {
    if (_isMonitoring) {
        console.warn('[sensorService] Already monitoring. Call stop() first.');
        return { stop: stopMotionMonitoring, isActive: () => _isMonitoring };
    }

    const thresholds = { ...THRESHOLDS, ...options.thresholds };
    const interval = options.updateInterval ?? UPDATE_INTERVAL_MS;

    // Check availability
    const available = await Accelerometer.isAvailableAsync();
    if (!available) {
        const err = new Error('Accelerometer is not available on this device.');
        console.error('[sensorService]', err.message);
        if (typeof onError === 'function') onError(err);
        return { stop: () => { }, isActive: () => false };
    }

    Accelerometer.setUpdateInterval(interval);

    _subscription = Accelerometer.addListener((raw) => {
        try {
            _processSample(raw, thresholds, onEvent);
        } catch (err) {
            if (typeof onError === 'function') onError(err);
        }
    });

    _isMonitoring = true;
    console.info('[sensorService] Motion monitoring started.');

    return {
        stop: stopMotionMonitoring,
        isActive: () => _isMonitoring,
    };
}

/**
 * Stop accelerometer monitoring and clean up the subscription.
 */
export function stopMotionMonitoring() {
    if (_subscription) {
        _subscription.remove();
        _subscription = null;
    }
    _isMonitoring = false;
    _window.length = 0;
    _lastMagnitude = 1.0;
    _lastEventAt = {};
    console.info('[sensorService] Motion monitoring stopped.');
}

/**
 * Synchronous access to the most recent accelerometer reading.
 * Returns null if monitoring has not started.
 * Useful for polling from the AI threat module without subscribing.
 *
 * @returns {LatestReading|null}
 */
export function getLatestReading() {
    return _latestReading;
}

/**
 * Returns true when the monitoring loop is active.
 * @returns {boolean}
 */
export function isMonitoring() {
    return _isMonitoring;
}

// ─── Core detection logic ─────────────────────────────────────────────────────

/**
 * Process one accelerometer sample and fire onEvent if any threat is detected.
 *
 * @param {{ x: number, y: number, z: number }} raw
 * @param {typeof THRESHOLDS} thresholds
 * @param {Function} onEvent
 */
function _processSample(raw, thresholds, onEvent) {
    const { x, y, z } = raw;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    // Net motion (subtract gravitational baseline of 1 G)
    const net = Math.max(0, magnitude - 1.0);

    // Update rolling window
    _window.push({ x, y, z, magnitude, net, ts: Date.now() });
    if (_window.length > SHAKE_WINDOW_SIZE) _window.shift();

    // Build the shared context snapshot
    _latestReading = {
        x, y, z,
        magnitude,
        net,
        timestamp: Date.now(),
        isStill: net < thresholds.CALM,
    };

    // ── 1. Sudden hard impact or Violent shake ──────────────────────────────
    if (net >= thresholds.SHAKE || net >= thresholds.IMPACT) {
        _shakeCount++;
        console.info(`[sensorService] Heavy shock registered. Consecutive strikes: ${_shakeCount}/3`);

        if (_shakeTimer) clearTimeout(_shakeTimer);
        _shakeTimer = setTimeout(() => {
            _shakeCount = 0;
            console.info('[sensorService] Shock accumulation threshold reset.');
        }, 2000);

        if (_shakeCount >= 3) {
            _shakeCount = 0; // consume
            if (_shakeTimer) {
                clearTimeout(_shakeTimer);
                _shakeTimer = null;
            }

            _emit(
                {
                    type: net >= thresholds.IMPACT ? 'IMPACT' : 'SHAKE',
                    severity: 'HIGH',
                    magnitude,
                    net,
                    x, y, z,
                    description: 'Sequential violent impacts/shakes detected',
                    logMessage: 'Danger movement confirmed — MULTIPLE DIRECT HITS (net: ' + net.toFixed(3) + ' G)',
                },
                onEvent
            );
        }
        return;
    }

    // ── 3. Rapid / abrupt movement ────────────────────────────────────────────
    if (net >= thresholds.RAPID) {
        const delta = Math.abs(magnitude - _lastMagnitude);
        if (delta >= 0.8) {
            _emit(
                {
                    type: 'RAPID_MOVEMENT',
                    severity: 'MEDIUM',
                    magnitude,
                    net,
                    delta,
                    x, y, z,
                    description: 'Rapid or abrupt movement detected',
                    logMessage: 'Potential danger movement detected — RAPID MOVEMENT (Δ: ' + delta.toFixed(3) + ' G, net: ' + net.toFixed(3) + ' G)',
                },
                onEvent
            );
        }
    }

    _lastMagnitude = magnitude;
}

/**
 * Count axis direction-reversals in the current rolling window.
 * A reversal is when the sign of a component flips relative to the prior sample.
 * High reversal count is a strong shake indicator.
 *
 * @returns {number}
 */
function _countReversals() {
    let count = 0;
    for (let i = 1; i < _window.length; i++) {
        const prev = _window[i - 1];
        const curr = _window[i];
        if (Math.sign(curr.x) !== Math.sign(prev.x)) count++;
        if (Math.sign(curr.y) !== Math.sign(prev.y)) count++;
        if (Math.sign(curr.z) !== Math.sign(prev.z)) count++;
    }
    return count;
}

/**
 * Emit a MotionEvent, respecting the cooldown.
 *
 * @param {MotionEvent} event
 * @param {Function}    callback
 */
function _emit(event, callback) {
    const now = Date.now();
    const last = _lastEventAt[event.type] ?? 0;
    if (now - last < EVENT_COOLDOWN_MS) return;

    _lastEventAt[event.type] = now;

    // Run raw axes through the AI threat detection module
    const threat = analyzeMotion(event.x, event.y, event.z);

    // Attach threat result so callers (and the future AI module) receive it
    const enrichedEvent = { ...event, threat };

    // Log — matches the required format + AI classification
    console.warn(
        '[sensorService]', enrichedEvent.logMessage,
        `| AI: ${threat.status} (confidence: ${threat.confidence}, backend: ${threat.backend})`
    );

    if (typeof callback === 'function') callback(enrichedEvent);
}

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MotionEvent
 * @property {'SHAKE'|'IMPACT'|'RAPID_MOVEMENT'}  type         — category of threat
 * @property {'HIGH'|'MEDIUM'|'LOW'}              severity     — risk level
 * @property {number}  magnitude   — raw vector magnitude (G)
 * @property {number}  net         — magnitude minus 1 G gravity baseline
 * @property {number}  x           — raw X axis
 * @property {number}  y           — raw Y axis
 * @property {number}  z           — raw Z axis
 * @property {string}  description — human-readable description
 * @property {string}  logMessage  — exact string logged to console
 * @property {number}  [reversals] — shake: number of axis reversals in window
 * @property {number}  [delta]     — rapid: magnitude change from previous sample
 */

/**
 * @typedef {Object} LatestReading
 * @property {number}  x
 * @property {number}  y
 * @property {number}  z
 * @property {number}  magnitude
 * @property {number}  net
 * @property {number}  timestamp
 * @property {boolean} isStill
 */

/**
 * @typedef {Object} MonitoringOptions
 * @property {Partial<typeof THRESHOLDS>} [thresholds]    — override any threshold
 * @property {number}                     [updateInterval] — ms between samples (default 100)
 */
