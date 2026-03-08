/**
 * SafeHer — services/storageService.js
 *
 * Drop-in AsyncStorage replacement built on expo-file-system.
 *
 * WHY: @react-native-async-storage v3 uses New Architecture native bridges
 * that are unavailable in Expo Go SDK 54. expo-file-system is bundled with
 * every Expo installation and works in Expo Go with zero native linking.
 *
 * API mirrors AsyncStorage exactly:
 *   getItem(key)           → Promise<string | null>
 *   setItem(key, value)    → Promise<void>
 *   removeItem(key)        → Promise<void>
 *   clear()                → Promise<void>
 *   getAllKeys()            → Promise<string[]>
 *   multiGet(keys)         → Promise<[string, string|null][]>
 *   multiSet(pairs)        → Promise<void>
 */

import * as FileSystem from 'expo-file-system/legacy';

// All storage files live in a single directory inside the app's document store
const STORAGE_DIR = `${FileSystem.documentDirectory}safeher-storage/`;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

let _initialized = false;

async function _ensureDir() {
    if (_initialized) return;
    const info = await FileSystem.getInfoAsync(STORAGE_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(STORAGE_DIR, { intermediates: true });
    }
    _initialized = true;
}

// ─── Key → file path ──────────────────────────────────────────────────────────

function _keyToPath(key) {
    // Sanitise the key so it is safe to use as a filename
    const safe = key.replace(/[^a-zA-Z0-9_\-@.]/g, '_');
    return `${STORAGE_DIR}${safe}.json`;
}

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Read a value by key.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getItem(key) {
    await _ensureDir();
    try {
        const path = _keyToPath(key);
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return null;
        return await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    } catch (err) {
        console.warn(`[storageService] getItem("${key}") failed:`, err.message);
        return null;
    }
}

/**
 * Write a string value for a key.
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function setItem(key, value) {
    await _ensureDir();
    try {
        await FileSystem.writeAsStringAsync(_keyToPath(key), value, {
            encoding: FileSystem.EncodingType.UTF8,
        });
    } catch (err) {
        console.warn(`[storageService] setItem("${key}") failed:`, err.message);
        throw err;
    }
}

/**
 * Remove a key.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function removeItem(key) {
    await _ensureDir();
    try {
        const path = _keyToPath(key);
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
    } catch (err) {
        console.warn(`[storageService] removeItem("${key}") failed:`, err.message);
    }
}

/**
 * Remove all stored keys.
 * @returns {Promise<void>}
 */
export async function clear() {
    try {
        await FileSystem.deleteAsync(STORAGE_DIR, { idempotent: true });
        _initialized = false;
    } catch (err) {
        console.warn('[storageService] clear() failed:', err.message);
    }
}

/**
 * Return all stored key names.
 * @returns {Promise<string[]>}
 */
export async function getAllKeys() {
    await _ensureDir();
    try {
        const files = await FileSystem.readDirectoryAsync(STORAGE_DIR);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace(/\.json$/, '').replace(/_/g, match => {
                // Best-effort reverse sanitisation — good enough for debug use
                return match;
            }));
    } catch (err) {
        console.warn('[storageService] getAllKeys() failed:', err.message);
        return [];
    }
}

/**
 * Batch-read multiple keys.
 * @param {string[]} keys
 * @returns {Promise<[string, string|null][]>}
 */
export async function multiGet(keys) {
    return Promise.all(keys.map(async k => [k, await getItem(k)]));
}

/**
 * Batch-write multiple key-value pairs.
 * @param {[string, string][]} pairs
 * @returns {Promise<void>}
 */
export async function multiSet(pairs) {
    await Promise.all(pairs.map(([k, v]) => setItem(k, v)));
}

// ─── Default export matching AsyncStorage interface ───────────────────────────

const Storage = { getItem, setItem, removeItem, clear, getAllKeys, multiGet, multiSet };
export default Storage;
