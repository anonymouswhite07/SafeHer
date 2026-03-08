/**
 * SafeHer — services/networkService.js
 *
 * Checks live internet connectivity using Expo Network.
 *
 * isInternetAvailable()  → Promise<boolean>
 *   true  = device has an active internet connection
 *   false = offline (alerts will be sent via device SMS fallback)
 */

import * as Network from 'expo-network';

// Cache the last known state so synchronous callers can read it instantly
let _lastKnownOnline = true;

/**
 * Check whether the device currently has internet access.
 *
 * Combines two signals for reliability:
 *   1. NetworkState.isInternetReachable  — full reachability probe
 *   2. NetworkState.type                 — at least has a carrier/wifi
 *
 * @returns {Promise<boolean>}
 */
export async function isInternetAvailable() {
    try {
        const state = await Network.getNetworkStateAsync();

        const online =
            state.isInternetReachable === true &&
            state.type !== Network.NetworkStateType.NONE &&
            state.type !== Network.NetworkStateType.UNKNOWN;

        _lastKnownOnline = online;
        console.info(`[networkService] Internet: ${online ? 'ONLINE' : 'OFFLINE'} (type=${state.type})`);
        return online;
    } catch (err) {
        console.warn('[networkService] Could not check network state:', err.message);
        // Assume online — the backend call will fail gracefully and SMS fallback will catch it
        return true;
    }
}

/**
 * Return the most recently cached connectivity state without an async probe.
 * Useful for quick synchronous checks (e.g. deciding which UI to show).
 *
 * @returns {boolean}
 */
export function getLastKnownOnlineState() {
    return _lastKnownOnline;
}
