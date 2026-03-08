/**
 * SafeHer — services/routeService.js
 *
 * Safe Route Prediction engine.
 *
 * This is a PROTOTYPE using simulated safety data.
 * Architecture is designed for a real API drop-in replacement:
 *   - Swap _fetchRouteGeometry() to call Google Directions API
 *   - Swap _scoreSafetyFactors() to query a real urban safety dataset
 *
 * Safety Score = weighted average of:
 *   crowd density      (30%) — inverse: more crowded = safer at night
 *   lighting score     (40%) — well-lit streets score higher
 *   historical safety  (30%) — area crime/incident history
 *
 *   Final score: 0–100 where 100 = perfectly safe
 */

import { buildMapsLink } from '@/services/locationService';

// ─── Config ────────────────────────────────────────────────────────────────────

const WEIGHTS = {
    crowd: 0.30,
    lighting: 0.40,
    history: 0.30,
};

/** Route variant display names and inherent bias seeds */
const ROUTE_TEMPLATES = [
    { id: 'main', label: 'Main Road', description: 'Busiest route, well-lit streets', biasSeed: 0.82 },
    { id: 'alternate', label: 'Alternate Path', description: 'Quieter roads, slightly shorter distance', biasSeed: 0.64 },
    { id: 'backstreet', label: 'Back Streets', description: 'Fastest route, less foot traffic', biasSeed: 0.41 },
];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate route options from a current position to a destination,
 * each with a safety analysis.
 *
 * @param {{ latitude: number, longitude: number }} origin
 * @param {string} destinationText  — user-typed destination label
 * @returns {Promise<RouteResult[]>}
 */
export async function getRoutes(origin, destinationText) {
    if (!destinationText?.trim()) {
        throw new Error('Please enter a destination.');
    }

    // Simulate a short network delay (real API would wait here)
    await _delay(900);

    // Simulate a rough destination coordinate offset from origin
    const destOffset = _hashDestination(destinationText);
    const destination = {
        latitude: origin.latitude + destOffset.dlat,
        longitude: origin.longitude + destOffset.dlng,
        label: destinationText.trim(),
    };

    const routes = ROUTE_TEMPLATES.map((template, index) => {
        const safetyFactors = _scoreSafetyFactors(origin, destination, template);
        const safetyScore = _compositeScore(safetyFactors);
        const { distance, duration } = _estimateDistance(origin, destination, template);

        return {
            id: template.id,
            label: template.label,
            description: template.description,
            origin,
            destination,
            safetyScore,        // 0–100
            safetyFactors,      // { crowd, lighting, history } each 0–100
            safetyLevel: _scoreToLevel(safetyScore),
            distance,           // km string e.g. "1.8 km"
            duration,           // minutes string e.g. "22 min"
            mapsLink: buildMapsLink(destination.latitude, destination.longitude),
            waypoints: _generateWaypoints(origin, destination, index),
            isRecommended: false,  // set below
        };
    });

    // Mark the safest route as recommended
    const sorted = [...routes].sort((a, b) => b.safetyScore - a.safetyScore);
    const recommendedId = sorted[0].id;
    routes.forEach(r => { r.isRecommended = r.id === recommendedId; });

    return routes;
}

/**
 * Get a plain text summary of why a route was recommended.
 *
 * @param {RouteResult} route
 * @returns {string}
 */
export function getRouteSummary(route) {
    const { safetyFactors, safetyLevel, label } = route;
    const strongFactors = [];
    if (safetyFactors.lighting >= 75) strongFactors.push('excellent street lighting');
    if (safetyFactors.crowd >= 75) strongFactors.push('good foot traffic');
    if (safetyFactors.history >= 75) strongFactors.push('low incident history');

    if (strongFactors.length === 0) {
        return `${label} has a ${safetyLevel} safety rating based on current data.`;
    }
    return `${label} is recommended for its ${strongFactors.join(' and ')}.`;
}

// ─── Internal — safety engine ──────────────────────────────────────────────────

/**
 * Simulates per-route safety factor scores.
 * In production, these come from a real-time urban data API.
 *
 * Each factor is deterministically seeded from the route template's bias
 * and the destination hash so results are consistent across re-renders.
 *
 * @param {object} origin
 * @param {object} destination
 * @param {object} template
 * @returns {{ crowd: number, lighting: number, history: number }}
 */
function _scoreSafetyFactors(origin, destination, template) {
    // Deterministic pseudo-random offset based on destination coords
    const seed = Math.abs(
        Math.sin(destination.latitude * 100 + destination.longitude * 50) * 10000
    ) % 1;

    // Each factor jitters around the template's bias by ±15 points
    const jitter = (base, s) => Math.min(100, Math.max(10,
        Math.round(base * 100 + (s - 0.5) * 30)
    ));

    return {
        crowd: jitter(template.biasSeed, seed),
        lighting: jitter(template.biasSeed, (seed + 0.33) % 1),
        history: jitter(template.biasSeed, (seed + 0.66) % 1),
    };
}

/**
 * Compute the weighted composite safety score.
 *
 * @param {{ crowd: number, lighting: number, history: number }} factors
 * @returns {number}  0–100, rounded to nearest integer
 */
function _compositeScore(factors) {
    return Math.round(
        factors.crowd * WEIGHTS.crowd +
        factors.lighting * WEIGHTS.lighting +
        factors.history * WEIGHTS.history
    );
}

/**
 * Map a 0–100 score to a human-readable safety level.
 *
 * @param {number} score
 * @returns {'SAFE'|'MODERATE'|'CAUTION'|'UNSAFE'}
 */
function _scoreToLevel(score) {
    if (score >= 75) return 'SAFE';
    if (score >= 55) return 'MODERATE';
    if (score >= 35) return 'CAUTION';
    return 'UNSAFE';
}

// ─── Internal — geometry simulation ────────────────────────────────────────────

/**
 * Deterministically hash a destination string into a lat/lng offset.
 * Keeps results repeatable for the same destination text.
 */
function _hashDestination(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    }
    const norm = (Math.abs(h) % 10000) / 10000;
    return {
        dlat: (norm - 0.5) * 0.06,   // ±0.03 degrees ≈ ±3 km
        dlng: ((norm * 1.618) % 1 - 0.5) * 0.06,
    };
}

/**
 * Simulate estimated distance and duration for a route variant.
 */
function _estimateDistance(origin, destination, template) {
    const dLat = destination.latitude - origin.latitude;
    const dLng = destination.longitude - origin.longitude;
    const basKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111; // rough km

    // Route variants have different multipliers
    const multipliers = { main: 1.35, alternate: 1.15, backstreet: 1.05 };
    const mult = multipliers[template.id] ?? 1.2;

    const km = Math.max(0.3, basKm * mult);
    const min = Math.round(km / 5 * 60); // assume 5 km/h walking speed

    return {
        distance: `${km.toFixed(1)} km`,
        duration: `${min} min walk`,
    };
}

/**
 * Generate a simple list of waypoint coordinates for the visual map.
 * In production, these come from the routing API polyline.
 */
function _generateWaypoints(origin, destination, routeIndex) {
    const steps = 4;
    const waypoints = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Add slight curvature variation per route
        const curve = Math.sin(t * Math.PI) * (routeIndex * 0.003);
        waypoints.push({
            latitude: origin.latitude + (destination.latitude - origin.latitude) * t + curve,
            longitude: origin.longitude + (destination.longitude - origin.longitude) * t + curve,
        });
    }
    return waypoints;
}

function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Types (JSDoc) ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RouteResult
 * @property {string}  id
 * @property {string}  label
 * @property {string}  description
 * @property {object}  origin
 * @property {object}  destination
 * @property {number}  safetyScore        0–100
 * @property {{ crowd: number, lighting: number, history: number }} safetyFactors
 * @property {'SAFE'|'MODERATE'|'CAUTION'|'UNSAFE'} safetyLevel
 * @property {string}  distance
 * @property {string}  duration
 * @property {string}  mapsLink
 * @property {Array}   waypoints
 * @property {boolean} isRecommended
 */
