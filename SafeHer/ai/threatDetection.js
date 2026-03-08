/**
 * SafeHer — ai/threatDetection.js
 *
 * Rule-based AI threat detection module.
 * Analyzes raw accelerometer data and classifies movement as "normal" or "danger".
 *
 * ARCHITECTURE NOTE — designed for TensorFlow Lite drop-in replacement:
 * ─────────────────────────────────────────────────────────────────────
 * This module exposes a stable public interface:
 *   analyzeMotion(x, y, z) → ThreatResult
 *
 * When a TFLite model is ready, only the internals of `_runModel()` need
 * to change. The interface and all callers (sensorService, SafeHerContext)
 * stay identical. See the commented TFLite stub at the bottom of this file.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Movement magnitude thresholds (G-force units).
 * Raw magnitude = √(x² + y² + z²).
 * Earth's gravity ≈ 1.0 G, so a still device reads ~1.0.
 */
const THRESHOLDS = {
    DANGER: 2.5,   // "danger"  — moderate+ abnormal force
    WARNING: 1.8,   // "warning" — elevated movement, not yet dangerous
    NORMAL: 0.0,   // "normal"  — everything below DANGER
};

/** Which backend is currently active. Change to 'tflite' when model is ready. */
const ACTIVE_BACKEND = 'rules';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a single accelerometer reading and return a threat classification.
 *
 * @param {number} x  — X-axis acceleration (G)
 * @param {number} y  — Y-axis acceleration (G)
 * @param {number} z  — Z-axis acceleration (G)
 * @returns {ThreatResult}
 *
 * @example
 * const result = analyzeMotion(0.1, 0.2, 1.0);
 * // { status: 'normal', magnitude: 1.02, confidence: 1.0, backend: 'rules' }
 *
 * const result = analyzeMotion(2.8, 1.2, 0.5);
 * // { status: 'danger', magnitude: 3.09, confidence: 1.0, backend: 'rules' }
 */
export function analyzeMotion(x, y, z) {
    const magnitude = _calcMagnitude(x, y, z);
    return _runModel(x, y, z, magnitude);
}

/**
 * Feed data directly from a MotionEvent (returned by sensorService).
 * Convenience wrapper around analyzeMotion().
 *
 * @param {{ x: number, y: number, z: number, magnitude?: number }} motionEvent
 * @returns {ThreatResult}
 */
export function analyzeMotionEvent(motionEvent) {
    return analyzeMotion(motionEvent.x, motionEvent.y, motionEvent.z);
}

/**
 * Feed the latest reading from locationService's getLatestReading().
 * Returns null if no reading is available.
 *
 * @param {{ x: number, y: number, z: number } | null} reading
 * @returns {ThreatResult | null}
 */
export function analyzeReading(reading) {
    if (!reading) return null;
    return analyzeMotion(reading.x, reading.y, reading.z);
}

/**
 * Returns metadata about the currently active detection backend.
 * Useful for the AI module status UI panel.
 *
 * @returns {{ backend: string, version: string, thresholds: object }}
 */
export function getBackendInfo() {
    return {
        backend: ACTIVE_BACKEND,
        version: ACTIVE_BACKEND === 'rules' ? '1.0.0-rules' : '1.0.0-tflite',
        thresholds: { ...THRESHOLDS },
    };
}

// ─── Internal model runner ────────────────────────────────────────────────────

/**
 * Route to the correct backend implementation.
 * Swap in `_runTFLiteModel` when switching to TensorFlow Lite.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} magnitude
 * @returns {ThreatResult}
 */
function _runModel(x, y, z, magnitude) {
    if (ACTIVE_BACKEND === 'tflite') {
        return _runTFLiteModel(x, y, z, magnitude);
    }
    return _runRulesModel(magnitude);
}

/**
 * Rule-based classification — current production implementation.
 *
 * Logic:
 *   magnitude ≥ 2.5  →  status: "danger"
 *   magnitude ≥ 1.8  →  status: "warning"
 *   otherwise        →  status: "normal"
 *
 * @param {number} magnitude
 * @returns {ThreatResult}
 */
function _runRulesModel(magnitude) {
    let status;
    let confidence = 1.0; // rule-based results are always certainty 1.0

    if (magnitude >= THRESHOLDS.DANGER) {
        status = 'danger';
        // Confidence scales above the threshold to give callers a sense of intensity
        confidence = Math.min(1.0, (magnitude - THRESHOLDS.DANGER) / THRESHOLDS.DANGER + 0.85);
    } else if (magnitude >= THRESHOLDS.WARNING) {
        status = 'warning';
        confidence = (magnitude - THRESHOLDS.WARNING) / (THRESHOLDS.DANGER - THRESHOLDS.WARNING);
    } else {
        status = 'normal';
    }

    if (status === 'danger' || status === 'warning') {
        console.warn(
            `[threatDetection] ${status.toUpperCase()} — magnitude: ${magnitude.toFixed(4)} G` +
            ` (threshold: ${status === 'danger' ? THRESHOLDS.DANGER : THRESHOLDS.WARNING} G)`
        );
    }

    return {
        status,
        magnitude,
        confidence: parseFloat(confidence.toFixed(3)),
        backend: ACTIVE_BACKEND,
        timestamp: Date.now(),
    };
}

/**
 * TensorFlow Lite model stub.
 *
 * TO ENABLE TFLITE:
 *   1. Install:  npx expo install expo-modules-core @tensorflow/tfjs @tensorflow/tfjs-react-native
 *   2. Place your .tflite model in assets/models/threat_detector.tflite
 *   3. Load the model once at app startup using loadTFLiteModel()
 *   4. Set ACTIVE_BACKEND = 'tflite' above
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} magnitude
 * @returns {ThreatResult}
 */
function _runTFLiteModel(x, y, z, magnitude) {
    /*
     * Example TFLite implementation (uncomment when ready):
     *
     * const inputTensor = tf.tensor2d([[x, y, z, magnitude]], [1, 4]);
     * const outputTensor = _tfliteModel.predict(inputTensor);
     * const [dangerScore] = await outputTensor.data();
     * inputTensor.dispose(); outputTensor.dispose();
     *
     * return {
     *   status:     dangerScore >= 0.6 ? 'danger' : dangerScore >= 0.35 ? 'warning' : 'normal',
     *   magnitude,
     *   confidence: parseFloat(dangerScore.toFixed(3)),
     *   backend:    'tflite',
     *   timestamp:  Date.now(),
     * };
     */

    // Fallback to rules until TFLite is configured
    console.warn('[threatDetection] TFLite not yet configured — falling back to rules model.');
    return _runRulesModel(magnitude);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate the Euclidean magnitude of an (x, y, z) acceleration vector.
 * magnitude = √(x² + y² + z²)
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number}
 */
function _calcMagnitude(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
}

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ThreatResult
 * @property {'normal'|'warning'|'danger'} status      — classification result
 * @property {number}                      magnitude   — √(x²+y²+z²) in G
 * @property {number}                      confidence  — 0–1 certainty score
 * @property {'rules'|'tflite'}            backend     — which model produced this
 * @property {number}                      timestamp   — Unix ms
 */
