/**
 * SafeHer — services/evidenceService.js
 *
 * Automatic evidence capture during an emergency.
 *
 * Capabilities:
 *   - Audio recording  (expo-av, continuous, iOS background-compatible)
 *   - Photo capture    (expo-camera, periodic intervals via a ref camera)
 *   - Local file storage in <cacheDir>/safeher-evidence/<session>/
 *
 * NOTE — Background camera limitation:
 *   iOS and Android do not allow apps to activate the camera sensor in the
 *   background. capturePhotoEvidence() requires an active CameraRef passed
 *   from a mounted screen. Audio recording, however, continues in the
 *   background on both platforms when configured correctly.
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Interval (ms) between automatic photo captures when startPeriodicCapture() is active */
const PHOTO_INTERVAL_MS = 10_000; // every 10 seconds

/** Max photos captured per evidence session */
const MAX_PHOTOS = 20;

/** Directory inside the app's cache folder that holds all evidence sessions */
const EVIDENCE_BASE_DIR = `${FileSystem.cacheDirectory}safeher-evidence/`;

/** Audio recording settings — high quality M4A */
const AUDIO_OPTIONS = {
    android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,   // mono saves space
        bitRate: 96_000,
    },
    ios: {
        extension: '.m4a',
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.MEDIUM,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 96_000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
    },
    web: {},
};

// ─── Session state ────────────────────────────────────────────────────────────

let _sessionId = null;     // unique ID for the current evidence session
let _sessionDir = null;     // absolute path to session directory
let _audioRecording = null;     // active Audio.Recording instance
let _photoTimer = null;     // interval handle for periodic capture
let _photoCount = 0;        // photos captured this session
let _photoPaths = [];       // absolute paths of saved photos this session
let _audioUri = null;     // URI of the in-progress/completed audio file
let _isCapturing = false;    // true while a session is active

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start an audio evidence recording session.
 *
 * Configures expo-av for background-compatible recording on iOS
 * (allowsRecordingIOS + playsInSilentModeIOS).  On Android the
 * recording continues as long as the app is in the foreground.
 *
 * @returns {Promise<{ uri: string, sessionId: string }>}
 */
export async function startAudioRecording() {
    await _ensureSessionDir();

    // Stop any pre-existing recording
    if (_audioRecording) {
        await _safeStopRecording(_audioRecording);
        _audioRecording = null;
    }

    // Request microphone permission
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
        throw new Error(
            'Microphone permission denied. Cannot record evidence audio. ' +
            'Please enable microphone access in your device Settings.'
        );
    }

    // iOS: allow recording while device is silenced + continue in background
    await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,   // keeps the audio session alive when app backgrounds
        shouldDuckAndroid: false,
    });

    const { recording } = await Audio.Recording.createAsync(AUDIO_OPTIONS);
    _audioRecording = recording;
    _isCapturing = true;

    const uri = recording.getURI() ?? '';
    _audioUri = uri;

    console.info(`[evidenceService] Audio recording started. Session: ${_sessionId} | URI: ${uri}`);
    return { uri, sessionId: _sessionId };
}

/**
 * Capture a single photo from the provided camera reference.
 *
 * The image is saved to the session directory with a timestamp filename.
 * Returns null (without throwing) if the camera is not ready or unavailable —
 * a missing camera should never crash the emergency flow.
 *
 * @param {React.RefObject}  cameraRef   — ref to an expo-camera <Camera> component
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<PhotoResult|null>}
 */
export async function capturePhotoEvidence(cameraRef, opts = {}) {
    if (!cameraRef?.current) {
        console.warn('[evidenceService] capturePhotoEvidence: camera not available.');
        return null;
    }
    if (_photoCount >= MAX_PHOTOS) {
        console.warn('[evidenceService] Max photo limit reached for this session.');
        return null;
    }

    try {
        await _ensureSessionDir();

        const photo = await cameraRef.current.takePictureAsync({
            quality: opts.quality ?? 0.6,
            skipProcessing: true,          // faster, less CPU
            exif: false,         // no EXIF — privacy
        });

        // Move from temp location to organised session folder
        const filename = `photo_${Date.now()}_${String(_photoCount).padStart(3, '0')}.jpg`;
        const destPath = `${_sessionDir}${filename}`;
        await FileSystem.moveAsync({ from: photo.uri, to: destPath });

        _photoCount++;
        _photoPaths.push(destPath);

        const result = {
            uri: destPath,
            width: photo.width,
            height: photo.height,
            index: _photoCount,
            sessionId: _sessionId,
            timestamp: Date.now(),
        };

        console.info(`[evidenceService] Photo ${_photoCount} captured: ${destPath}`);
        return result;
    } catch (err) {
        console.warn('[evidenceService] capturePhotoEvidence error:', err.message);
        return null;
    }
}

/**
 * Start periodic automatic photo capture at PHOTO_INTERVAL_MS intervals.
 * Requires a cameraRef to be passed — stops automatically if it becomes null.
 *
 * @param {React.RefObject} cameraRef
 * @param {(result: PhotoResult|null) => void} [onCapture]  — called after each capture
 */
export function startPeriodicCapture(cameraRef, onCapture) {
    stopPeriodicCapture(); // clear any existing timer

    _photoTimer = setInterval(async () => {
        if (!cameraRef?.current || _photoCount >= MAX_PHOTOS) {
            stopPeriodicCapture();
            return;
        }
        const result = await capturePhotoEvidence(cameraRef);
        if (typeof onCapture === 'function') onCapture(result);
    }, PHOTO_INTERVAL_MS);

    console.info('[evidenceService] Periodic photo capture started.');
}

/**
 * Stop periodic photo capture without ending the audio recording.
 */
export function stopPeriodicCapture() {
    if (_photoTimer !== null) {
        clearInterval(_photoTimer);
        _photoTimer = null;
        console.info('[evidenceService] Periodic photo capture stopped.');
    }
}

/**
 * Stop all evidence capture — audio recording and photo timer.
 * Resets audio mode back to playback.
 *
 * @returns {Promise<EvidenceSession>}
 */
export async function stopRecording() {
    stopPeriodicCapture();

    let finalAudioUri = null;
    if (_audioRecording) {
        finalAudioUri = await _safeStopRecording(_audioRecording);
        _audioRecording = null;
    }

    // Restore audio mode for normal playback
    try {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: false,
        });
    } catch (_) { /* non-critical */ }

    _isCapturing = false;

    const session = {
        sessionId: _sessionId,
        sessionDir: _sessionDir,
        audioUri: finalAudioUri ?? _audioUri,
        photos: [..._photoPaths],
        photoCount: _photoCount,
        endedAt: Date.now(),
    };

    console.info(
        `[evidenceService] Session ${_sessionId} ended.` +
        ` Audio: ${session.audioUri ?? 'none'} | Photos: ${session.photoCount}`
    );

    return session;
}

/**
 * Returns true while an evidence session is active.
 * @returns {boolean}
 */
export function isCapturing() {
    return _isCapturing;
}

/**
 * Returns the current session summary without stopping anything.
 * Useful for UI status display.
 *
 * @returns {SessionStatus}
 */
export function getSessionStatus() {
    return {
        sessionId: _sessionId,
        isCapturing: _isCapturing,
        audioUri: _audioUri,
        photoCount: _photoCount,
        photoPaths: [..._photoPaths],
        sessionDir: _sessionDir,
    };
}

/**
 * List all past evidence session directories in the base folder.
 * Useful for a future "Evidence Vault" screen.
 *
 * @returns {Promise<string[]>}  array of session directory URIs
 */
export async function listEvidenceSessions() {
    try {
        const info = await FileSystem.getInfoAsync(EVIDENCE_BASE_DIR);
        if (!info.exists) return [];
        const { directories } = await FileSystem.readDirectoryAsync(EVIDENCE_BASE_DIR);
        return (directories ?? []).map(d => `${EVIDENCE_BASE_DIR}${d}/`);
    } catch (err) {
        console.warn('[evidenceService] listEvidenceSessions error:', err.message);
        return [];
    }
}

/**
 * Delete a specific session directory and all its files.
 * Pass the sessionId or the full path returned by listEvidenceSessions().
 *
 * @param {string} sessionIdOrPath
 * @returns {Promise<boolean>}
 */
export async function deleteEvidenceSession(sessionIdOrPath) {
    const path = sessionIdOrPath.startsWith('/')
        ? sessionIdOrPath
        : `${EVIDENCE_BASE_DIR}${sessionIdOrPath}/`;
    try {
        await FileSystem.deleteAsync(path, { idempotent: true });
        console.info('[evidenceService] Deleted session:', path);
        return true;
    } catch (err) {
        console.warn('[evidenceService] deleteEvidenceSession error:', err.message);
        return false;
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Create (or reuse) a timestamped session directory.
 * Resets photo counters on a new session.
 */
async function _ensureSessionDir() {
    if (_sessionId && _sessionDir) return; // session already initialised

    _sessionId = `session_${Date.now()}`;
    _sessionDir = `${EVIDENCE_BASE_DIR}${_sessionId}/`;
    _photoCount = 0;
    _photoPaths = [];
    _audioUri = null;

    await FileSystem.makeDirectoryAsync(_sessionDir, { intermediates: true });
    console.info('[evidenceService] Session directory created:', _sessionDir);
}

/**
 * Safely stop and unload a recording, returning its file URI.
 *
 * @param {Audio.Recording} recording
 * @returns {Promise<string|null>}
 */
async function _safeStopRecording(recording) {
    try {
        const status = await recording.getStatusAsync();
        if (status.isRecording) {
            await recording.stopAndUnloadAsync();
        }
        return recording.getURI();
    } catch (err) {
        console.warn('[evidenceService] _safeStopRecording error:', err.message);
        return null;
    }
}

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PhotoResult
 * @property {string} uri
 * @property {number} width
 * @property {number} height
 * @property {number} index
 * @property {string} sessionId
 * @property {number} timestamp
 */

/**
 * @typedef {Object} EvidenceSession
 * @property {string}   sessionId
 * @property {string}   sessionDir
 * @property {string|null} audioUri
 * @property {string[]} photos
 * @property {number}   photoCount
 * @property {number}   endedAt
 */

/**
 * @typedef {Object} SessionStatus
 * @property {string|null}  sessionId
 * @property {boolean}      isCapturing
 * @property {string|null}  audioUri
 * @property {number}       photoCount
 * @property {string[]}     photoPaths
 * @property {string|null}  sessionDir
 */
