import * as Battery from 'expo-battery';
import { sendEmergencyAlert, isEmergencyActive } from './emergencyService';
import { setLowBatteryCapture } from './evidenceService';
import { getTrackingLink, getTrackingId, transmitFinalLocation, setLowBatteryTracking } from './trackingService';
import { getContacts } from './contactService';

const LOW_BATTERY_THRESHOLD = 0.15;      // 15%
const CRITICAL_BATTERY_THRESHOLD = 0.05; // 5%

let _batterySubscription = null;
let _isLowBatteryMode = false;
let _hasSentCriticalAlert = false;

/**
 * Start monitoring battery levels centrally.
 */
export async function startBatteryMonitoring() {
    if (_batterySubscription) return;

    try {
        const level = await Battery.getBatteryLevelAsync();
        _handleBatteryLevel(level);

        _batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
            _handleBatteryLevel(batteryLevel);
        });
        console.info('[batteryService] Battery monitoring started.');
    } catch (err) {
        console.warn('[batteryService] Could not start battery monitoring:', err.message);
    }
}

/**
 * Stop monitoring battery levels.
 */
export function stopBatteryMonitoring() {
    if (_batterySubscription) {
        _batterySubscription.remove();
        _batterySubscription = null;
        console.info('[batteryService] Battery monitoring stopped.');
    }
}

async function _handleBatteryLevel(level) {
    if (level < 0) return; // Unknown or simulator

    // For debugging you can log the level occasionally, but avoiding spam is ideal.
    // console.info(`[batteryService] Battery level detected: ${Math.round(level * 100)}%`);

    if (level <= CRITICAL_BATTERY_THRESHOLD) {
        if (!_hasSentCriticalAlert) {
            _hasSentCriticalAlert = true;
            console.warn(`[batteryService] Battery level: ${Math.round(level * 100)}% < 5% (CRITICAL)`);
            await _triggerCriticalProtocol();
        }
    } else if (level <= LOW_BATTERY_THRESHOLD) {
        if (!_isLowBatteryMode) {
            _isLowBatteryMode = true;
            console.info(`[batteryService] Battery level: ${Math.round(level * 100)}% < 15%`);
            console.info('[batteryService] Low battery mode activated.');
            _applyLowBatteryMode(true);
        }
    } else {
        // Recovered (plugged in)
        if (_isLowBatteryMode || _hasSentCriticalAlert) {
            console.info(`[batteryService] Battery recovered to ${Math.round(level * 100)}%`);
            _isLowBatteryMode = false;
            _hasSentCriticalAlert = false;
            _applyLowBatteryMode(false);
        }
    }
}

function _applyLowBatteryMode(isLow) {
    // 1. Reduce GPS update frequency depending on mode
    setLowBatteryTracking(isLow);

    // 2. Disable camera evidence capture
    setLowBatteryCapture(isLow);

    // 3. Audio recording continues automatically if emergency mode was active (no changes required)
    // 4. Tracking continues pushing updates transparently in trackingService
}

async function _triggerCriticalProtocol() {
    // 5. Final location transmission before death
    await transmitFinalLocation();
    console.info('[batteryService] Final location transmitted.');

    // 6. Send critical alert to guardians
    try {
        const trackingId = getTrackingId();
        let link = getTrackingLink();

        if (!link && trackingId) {
            link = `https://safeher-c7ad.onrender.com/track/${trackingId}`;
        }
        if (!link) {
            link = 'Location unavailable';
        }

        const contacts = await getContacts();

        // This will send an alert even if emergency mode isn't active
        await sendEmergencyAlert({
            contacts,
            mapsLink: link,
            escalationLevel: 0,
            triggeredBy: 'CRITICAL_BATTERY',
        });
        console.info('[batteryService] Critical battery alert sent.');
    } catch (err) {
        console.warn('[batteryService] Failed to send critical battery alert:', err.message);
    }
}
